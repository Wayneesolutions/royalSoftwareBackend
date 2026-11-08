/**
 * Bundle B (Korvo + Loyvexa) endpoints. Mounted in app.js:
 *
 *   POST /api/v1/orders/external              Loyvexa → Korvo WhatsApp orders   (X-Api-Key: kvo_…)
 *   GET  /api/v1/rewards/session              Korvo app Rewards tab (logged-in dealer)
 *   GET  /api/v1/integrations/loyvexa         link status (admin)
 *   PUT  /api/v1/integrations/loyvexa         set the link by hand (admin)
 *   POST /api/v1/integrations/loyvexa/sync    send dealers, products and outstanding now (admin)
 *   GET  /api/v1/integrations/loyvexa/console-link   one-click sign-in to the Loyvexa console (admin)
 *   POST /api/v1/hub/provision                Loyvexa sets the link up automatically (hub JWT)
 */
import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../middleware/authMiddleware.js';
import Company from '../../models/company/companyModel.js';
import Ledger from '../../models/ledger/ledgerModel.js';
import Product from '../../models/product/productModel.js';
import Order from '../../models/order/orderModel.js';
import User from '../../models/user/userModel.js';
import { createOrder } from '../../controllres/orderController.js';
import { linkFor, participantToken, queueMasterSync, queueOutstandingSync, sha256 } from '../../services/loyvexa.js';

const companyOf = (req) => req.user.userDetails.defaultCompany?._id || req.user.userDetails.defaultCompany;
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const newInboundKey = () => {
  const plain = `kvo_${crypto.randomBytes(24).toString('base64url')}`;
  return { plain, hash: sha256(plain), prefix: plain.slice(0, 10) };
};

// ── Loyvexa → Korvo: WhatsApp orders ──────────────────────────────────────
export const externalOrders = express.Router();

externalOrders.post('/', async (req, res) => {
  try {
    const key = req.headers['x-api-key'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!key) return fail(res, 401, 'Missing API key');
    const company = await Company.findOne({ 'integrations.loyvexa.inboundKeyHash': sha256(key), 'integrations.loyvexa.enabled': true }).lean();
    if (!company) return fail(res, 401, 'Invalid API key');

    const b = req.body || {};
    const externalOrderId = String(b.externalOrderId || req.headers['idempotency-key'] || '').trim();
    if (!externalOrderId || !Array.isArray(b.items) || !b.items.length) return fail(res, 400, 'externalOrderId and items are required');

    // Same Loyvexa order twice → same Korvo order.
    const existing = await Order.findOne({ companyId: company._id, otherReference: externalOrderId }).select('orderNumber status').lean();
    if (existing) return res.json({ success: true, orderNumber: existing.orderNumber, status: existing.status, duplicate: true });

    // Dealer: Korvo id first (that's what master sync sent as the ref), then mobile.
    let dealer = null;
    if (b.dealerExternalRef && /^[a-f0-9]{24}$/i.test(String(b.dealerExternalRef))) {
      dealer = await Ledger.findOne({ _id: b.dealerExternalRef, companyId: company._id }).lean();
    }
    if (!dealer && b.dealerMobile) {
      const tail = String(b.dealerMobile).replace(/\D/g, '').slice(-10);
      if (tail.length === 10) dealer = await Ledger.findOne({ companyId: company._id, LedgerMobile: { $regex: `${tail}$` } }).lean();
    }
    if (!dealer) return fail(res, 422, 'Dealer not found in Korvo', { code: 'NO_DEALER' });

    const items = [];
    for (const it of b.items) {
      const product = await Product.findOne({ companyId: company._id, productCode: String(it.productCode || ''), isActive: true }).select('_id').lean();
      if (!product) return fail(res, 422, `Product ${it.productCode} not found in Korvo`, { code: 'NO_PRODUCT' });
      const qty = Number(it.quantity);
      if (!(qty > 0)) return fail(res, 400, 'Quantity must be positive');
      items.push({ productId: product._id, quantity: qty, ...(it.unitPrice != null ? { unitPrice: Number(it.unitPrice) } : {}) });
    }

    // Reuse the normal order logic (GST, totals, numbering), as if the dealer placed it.
    let out = null, status = 200;
    const fakeRes = { status(s) { status = s; return fakeRes; }, json(j) { out = j; return fakeRes; } };
    await createOrder({
      user: { userDetails: { _id: dealer._id, role: 'dealers', defaultCompany: company._id } },
      body: {
        customerId: String(dealer._id), customerName: dealer.LedgerName, customerMobile: dealer.LedgerMobile || b.dealerMobile || '',
        dealerId: String(dealer._id), dealerName: dealer.LedgerName, items, priority: 'medium', paymentMethod: 'credit',
        otherReference: externalOrderId, notes: `WhatsApp order ${externalOrderId} via Loyvexa`,
      },
    }, fakeRes);
    if (status >= 300 || !out?.order) return fail(res, status >= 400 ? status : 500, out?.message || 'Could not create the order');

    // Into the normal approval chain: the dealer's salesman, then ASM, RSM, zonal; else a company admin.
    const order = await Order.findById(out.order._id);
    const approverId = dealer.SalesMan || dealer.ASM || dealer.RSM || dealer.ZSM;
    const approver = approverId
      ? await User.findById(approverId).select('_id name role').lean()
      : await User.findOne({ role: 'admin', isActive: true, $or: [{ defaultCompany: company._id }, { 'companies.companyId': company._id }] }).select('_id name role').lean();
    order.status = 'pending_approval';
    if (approver) {
      order.nextApprover = approver._id;
      order.approvalHistory.push({ approverId: approver._id, approverName: approver.name, approverRole: approver.role, action: 'pending', notes: 'WhatsApp order (Loyvexa)', timestamp: new Date() });
    }
    await order.save();
    return res.status(201).json({ success: true, orderNumber: order.orderNumber, status: order.status });
  } catch (e) {
    console.error('external order error', e);
    return fail(res, 500, 'Server error');
  }
});

// ── Korvo app: Rewards tab ────────────────────────────────────────────────
export const rewards = express.Router();

rewards.get('/session', authMiddleware(['dealers', 'distibutors', 'subdealer']), async (req, res) => {
  try {
    const u = req.user.userDetails;
    const r = await participantToken(companyOf(req), { externalRef: String(u._id), mobile: u.mobile || u.ledgerData?.LedgerMobile });
    if (!r) return fail(res, 404, 'Rewards are not switched on for this company', { code: 'NOT_LINKED' });
    return res.json({ success: true, ...r });
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404) return fail(res, 404, 'You are not in the rewards programme yet. Your company will add you.', { code: 'NOT_ENROLLED' });
    return fail(res, 502, 'Rewards are not reachable right now');
  }
});

// ── Admin: link status, manual set-up, sync, console sign-in ──────────────
export const admin = express.Router();
admin.use(authMiddleware(['admin', 'superadmin']));

admin.get('/', async (req, res) => {
  const c = await Company.findById(companyOf(req)).select('integrations companyName').lean();
  const l = c?.integrations?.loyvexa || {};
  res.json({ success: true, loyvexa: { enabled: !!l.enabled, baseUrl: l.baseUrl || null, tenantSlug: l.tenantSlug || null, earnOn: l.earnOn || 'delivered', inboundKeyPrefix: l.inboundKeyPrefix || null, lastMasterSyncAt: l.lastMasterSyncAt || null, lastOutstandingSyncAt: l.lastOutstandingSyncAt || null } });
});

admin.put('/', async (req, res) => {
  const b = req.body || {};
  const set = {};
  if (typeof b.enabled === 'boolean') set['integrations.loyvexa.enabled'] = b.enabled;
  if (b.baseUrl) {
    if (!/^https?:\/\//.test(b.baseUrl)) return fail(res, 400, 'baseUrl must start with http(s)://');
    set['integrations.loyvexa.baseUrl'] = String(b.baseUrl).replace(/\/$/, '');
  }
  if (b.tenantSlug) set['integrations.loyvexa.tenantSlug'] = String(b.tenantSlug);
  if (b.connectorKey) set['integrations.loyvexa.connectorKey'] = String(b.connectorKey);
  if (b.earnOn && ['approved', 'delivered'].includes(b.earnOn)) set['integrations.loyvexa.earnOn'] = b.earnOn;
  let inboundKey;
  if (b.newInboundKey) {
    const k = newInboundKey(); inboundKey = k.plain;
    set['integrations.loyvexa.inboundKeyHash'] = k.hash; set['integrations.loyvexa.inboundKeyPrefix'] = k.prefix;
  }
  await Company.updateOne({ _id: companyOf(req) }, { $set: set });
  res.json({ success: true, ...(inboundKey ? { inboundKey, note: 'Shown once. Put it in Loyvexa as this brand\'s Korvo key.' } : {}) });
});

admin.post('/sync', async (req, res) => {
  const id = companyOf(req);
  const now = new Date();
  res.json({ success: true, masters: await queueMasterSync(id, now), outstanding: await queueOutstandingSync(id, now) });
});

admin.get('/console-link', async (req, res) => {
  const secret = process.env.HUB_SECRET;
  const link = await linkFor(companyOf(req));
  const c = await Company.findById(companyOf(req)).select('integrations.loyvexa.tenantSlug').lean();
  const slug = c?.integrations?.loyvexa?.tenantSlug;
  if (!link || !slug) return fail(res, 404, 'Loyvexa is not linked to this company', { code: 'NOT_LINKED' });
  if (!secret || secret.length < 32) return fail(res, 503, 'HUB_SECRET is not set on Korvo');
  const u = req.user.userDetails;
  const token = jwt.sign({ purpose: 'sso', email: u.email, name: u.name, role: 'admin' }, secret,
    { algorithm: 'HS256', issuer: 'korvo', audience: 'loyvexa', subject: slug, expiresIn: 60, jwtid: crypto.randomBytes(12).toString('hex') });
  res.json({ success: true, url: `${link.baseUrl}/admin/#sso=${encodeURIComponent(token)}`, expiresIn: 60 });
});

// ── Hub: Loyvexa sets everything up (one click in the Loyvexa platform) ───
export const hub = express.Router();
const seen = new Map();

hub.post('/provision', async (req, res) => {
  try {
    const secret = process.env.HUB_SECRET;
    if (!secret || secret.length < 32) return fail(res, 503, 'HUB_SECRET is not set on Korvo');
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let claims;
    try { claims = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'loyvexa', audience: 'korvo', maxAge: '3m' }); }
    catch (e) { return fail(res, 401, `Hub token rejected: ${e.message}`); }
    if (claims.purpose !== 'provision' || !claims.jti) return fail(res, 401, 'Not a provisioning token');
    const now = Date.now();
    for (const [k, until] of seen) if (until < now) seen.delete(k);
    if (seen.has(claims.jti)) return fail(res, 401, 'Hub token was already used');
    seen.set(claims.jti, claims.exp * 1000);

    const b = req.body || {};
    const code = String(b.companyCode || '').trim().toUpperCase();
    if (!code || !b.baseUrl || !b.connectorKey || !b.tenantSlug) return fail(res, 400, 'companyCode, baseUrl, connectorKey and tenantSlug are required');
    const company = await Company.findOne({ companyCode: code }).select('+integrations.loyvexa.inboundKeyHash integrations companyName').lean();
    if (!company) return fail(res, 404, `No Korvo company with code ${code}`, { code: 'NO_COMPANY' });
    const prevSlug = company.integrations?.loyvexa?.tenantSlug;
    if (prevSlug && prevSlug !== b.tenantSlug) return fail(res, 409, `Company ${code} is already linked to Loyvexa brand ${prevSlug}`, { code: 'LINKED_ELSEWHERE' });

    const set = {
      'integrations.loyvexa.enabled': b.active !== false,
      'integrations.loyvexa.baseUrl': String(b.baseUrl).replace(/\/$/, ''),
      'integrations.loyvexa.tenantSlug': String(b.tenantSlug),
      'integrations.loyvexa.connectorKey': String(b.connectorKey),
      ...(b.earnOn && ['approved', 'delivered'].includes(b.earnOn) ? { 'integrations.loyvexa.earnOn': b.earnOn } : {}),
    };
    let inboundKey;
    if (!company.integrations?.loyvexa?.inboundKeyHash || b.rotateKey) {
      const k = newInboundKey(); inboundKey = k.plain;
      set['integrations.loyvexa.inboundKeyHash'] = k.hash; set['integrations.loyvexa.inboundKeyPrefix'] = k.prefix;
    }
    await Company.updateOne({ _id: company._id }, { $set: set });
    if (b.active !== false) { await queueMasterSync(company._id); await queueOutstandingSync(company._id); }
    return res.json({ success: true, companyId: String(company._id), companyName: company.companyName, enabled: b.active !== false, ...(inboundKey ? { korvoApiKey: inboundKey } : {}) });
  } catch (e) {
    console.error('hub provision error', e);
    return fail(res, 500, 'Server error');
  }
});
