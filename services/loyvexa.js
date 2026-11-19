/**
 * Bundle B: Korvo (dealer management + Tally) ⇄ Loyvexa (loyalty, WhatsApp, AI).
 *
 * Korvo → Loyvexa (through the IntegrationOutbox, retried with backoff):
 *   order approved / delivered / cancelled / returned → POST /api/connect/royal       (purchase points, AI reorder model)
 *   dealers (Ledgers) + products, nightly            → POST /api/connect/parties | /products
 *   overdue outstanding per dealer, nightly          → POST /api/connect/outstanding  (AI payment reminders)
 * Loyvexa → Korvo:
 *   WhatsApp orders → POST /api/v1/orders/external   (routes/integrations/loyvexaRoute.js)
 * Korvo app → Loyvexa:
 *   Rewards tab → GET /api/v1/rewards/session → POST /api/connect/participant-token (1-hour dealer token)
 *
 * Every call carries the company's Loyvexa connector key (X-Api-Key). The key
 * lives only on this server; it never goes to the mobile app.
 */
import crypto from 'crypto';
import axios from 'axios';
import mongoose from 'mongoose';
import Company from '../models/company/companyModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import Product from '../models/product/productModel.js';
import Outstanding from '../models/outstanding/outstandingModel.js';
import IntegrationOutbox from '../models/integration/integrationOutboxModel.js';

export const ORDER_EVENTS = ['approved', 'delivered', 'cancelled', 'returned'];
const MAX_ATTEMPTS = 10;
const BATCH = 500;

export const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

/** The company's Loyvexa link, or null when it isn't switched on. */
export async function linkFor(companyId) {
  const c = await Company.findById(companyId).select('+integrations.loyvexa.connectorKey integrations companyCode companyName').lean();
  const l = c?.integrations?.loyvexa;
  if (!l?.enabled || !l.baseUrl || !l.connectorKey) return null;
  return { baseUrl: l.baseUrl.replace(/\/$/, ''), key: l.connectorKey, earnOn: l.earnOn || 'delivered', company: c };
}

/** Queue one message. Same dedupeKey twice = queued once. */
export async function enqueue(companyId, path, body, dedupeKey) {
  try {
    await IntegrationOutbox.create({ companyId, path, body, dedupeKey: dedupeKey || undefined });
    return true;
  } catch (e) {
    if (e?.code === 11000) return false; // already queued
    throw e;
  }
}

/** What Loyvexa's ROYAL adapter reads from an order (see Loyvexa src/connectors/adapters.js → royal). */
export function orderPayload(order) {
  const o = typeof order.toObject === 'function' ? order.toObject() : order;
  return {
    event: `order.${o.status}`,
    order: {
      _id: String(o._id),
      orderNumber: o.orderNumber,
      orderDate: o.orderDate || o.createdAt,
      deliveryDate: o.deliveryDate || null,
      status: o.status,
      dealerId: String(o.dealerId?._id || o.dealerId || o.customerId?._id || o.customerId || ''),
      dealerName: o.dealerName || o.customerName,
      customerMobile: o.customerMobile || '',
      items: (o.items || []).map((i) => ({
        productCode: i.productCode, productName: i.productName, quantity: i.quantity,
        taxableValue: i.taxableValue, totalPrice: i.totalPrice,
      })),
      taxableValueTotal: o.taxableValueTotal,
      totalAmount: o.totalAmount,
      finalAmount: o.finalAmount,
      orderCategory: o.orderCategory,
      source: o.otherReference?.startsWith?.('WA-') ? 'loyvexa-whatsapp' : 'korvo',
    },
  };
}

/** Called from the Order model after save when the status changed. Never throws. */
export async function onOrderStatus(order) {
  try {
    if (!ORDER_EVENTS.includes(order.status) || order.isActive === false) return false;
    const link = await linkFor(order.companyId);
    if (!link) return false;
    return enqueue(order.companyId, '/api/connect/royal', orderPayload(order), `order:${order._id}:${order.status}`);
  } catch (e) {
    console.error('[loyvexa] could not queue order event', e.message);
    return false;
  }
}

const ROLE = { dealers: 'dealers', distibutors: 'distibutors', subdealer: 'subdealer' };

/** Dealers (Tally ledgers) and products → Loyvexa. Queued in chunks. */
export async function queueMasterSync(companyId, now = new Date()) {
  const link = await linkFor(companyId);
  if (!link) return { skipped: 'not linked' };
  const ledgers = await Ledger.find({ companyId, isActive: { $ne: false } })
    .select('LedgerName LedgerMobile LedgerGSTIN LedgerState').lean();
  const parties = ledgers.map((l) => ({
    _id: String(l._id), name: l.LedgerName, mobile: l.LedgerMobile || '', gstin: l.LedgerGSTIN || '',
    role: ROLE.dealers, address: { state: l.LedgerState || '' },
  }));
  const products = (await Product.find({ companyId, isActive: true })
    .select('productCode productName name category price stdSaleRate').lean())
    .filter((p) => p.productCode)
    .map((p) => ({ productCode: p.productCode, productName: p.productName || p.name, category: p.category, price: p.price || p.stdSaleRate || null }));
  const stamp = now.toISOString().slice(0, 10);
  let chunks = 0;
  for (let i = 0; i < parties.length; i += BATCH) { await enqueue(companyId, '/api/connect/parties', parties.slice(i, i + BATCH), `parties:${stamp}:${i}`); chunks++; }
  for (let i = 0; i < products.length; i += BATCH) { await enqueue(companyId, '/api/connect/products', products.slice(i, i + BATCH), `products:${stamp}:${i}`); chunks++; }
  await Company.updateOne({ _id: companyId }, { $set: { 'integrations.loyvexa.lastMasterSyncAt': now } });
  return { parties: parties.length, products: products.length, chunks };
}

/**
 * Money each dealer owes, and how much of it is past due — what the AI
 * Channel Manager uses for polite payment reminders. One snapshot per day.
 */
export async function queueOutstandingSync(companyId, now = new Date()) {
  const link = await linkFor(companyId);
  if (!link) return { skipped: 'not linked' };
  const rows = await Outstanding.aggregate([
    { $match: { companyId: new mongoose.Types.ObjectId(String(companyId)), outstandingAmount: { $gt: 0 }, status: { $nin: ['paid', 'written_off'] } } },
    { $group: {
      _id: '$partyId', partyName: { $first: '$partyName' }, mobile: { $first: '$partyContact.mobile' },
      outstanding: { $sum: '$outstandingAmount' },
      overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] }, '$outstandingAmount', 0] } },
      oldestDue: { $min: '$dueDate' }, maxDaysOverdue: { $max: '$daysOverdue' },
    } },
  ]);
  const items = rows.filter((r) => r._id).map((r) => ({
    ref: String(r._id), name: r.partyName || '', mobile: r.mobile || '',
    outstanding: Math.round(r.outstanding * 100) / 100, overdue: Math.round(r.overdue * 100) / 100,
    oldestDueDate: r.oldestDue ? new Date(r.oldestDue).toISOString().slice(0, 10) : null, daysOverdue: r.maxDaysOverdue || 0,
  }));
  const stamp = now.toISOString().slice(0, 10);
  // Always send (even empty) so Loyvexa can clear dealers who have paid.
  for (let i = 0; i < Math.max(items.length, 1); i += BATCH) {
    await enqueue(companyId, '/api/connect/outstanding', { asOf: now.toISOString(), complete: i + BATCH >= items.length, part: i / BATCH, items: items.slice(i, i + BATCH) }, `outstanding:${stamp}:${i}`);
  }
  await Company.updateOne({ _id: companyId }, { $set: { 'integrations.loyvexa.lastOutstandingSyncAt': now } });
  return { dealers: items.length };
}

const backoffMs = (attempts) => Math.min(2 ** attempts * 30000, 6 * 3600000);

/** Deliver due outbox rows. Safe to run on several servers: each row is claimed first. */
export async function flushOutbox({ limit = 50, now = new Date(), http = axios } = {}) {
  let sent = 0, failed = 0;
  for (let n = 0; n < limit; n++) {
    const job = await IntegrationOutbox.findOneAndUpdate(
      { sentAt: null, attempts: { $lt: MAX_ATTEMPTS }, nextAttemptAt: { $lte: now } },
      { $set: { nextAttemptAt: new Date(now.getTime() + 5 * 60000) } }, // lease
      { sort: { createdAt: 1 }, new: true },
    );
    if (!job) break;
    const link = await linkFor(job.companyId);
    if (!link) { await IntegrationOutbox.updateOne({ _id: job._id }, { $set: { lastError: 'Loyvexa link switched off', nextAttemptAt: new Date(now.getTime() + 3600000) } }); continue; }
    try {
      await http.post(`${link.baseUrl}${job.path}`, job.body, {
        headers: { 'X-Api-Key': link.key, 'Content-Type': 'application/json', ...(job.dedupeKey ? { 'Idempotency-Key': job.dedupeKey } : {}) },
        timeout: 20000,
      });
      await IntegrationOutbox.updateOne({ _id: job._id }, { $set: { sentAt: new Date(), lastError: null }, $inc: { attempts: 1 } });
      sent++;
    } catch (e) {
      const status = e?.response?.status;
      const msg = `${status || ''} ${e?.response?.data?.error?.message || e?.response?.data?.message || e.message}`.trim().slice(0, 300);
      // 4xx other than 408/429 won't succeed on retry: stop after the first attempt.
      const permanent = status && status >= 400 && status < 500 && ![408, 429].includes(status);
      await IntegrationOutbox.updateOne({ _id: job._id }, {
        $set: { lastError: msg, nextAttemptAt: new Date(now.getTime() + backoffMs(job.attempts + 1)), ...(permanent ? { attempts: MAX_ATTEMPTS } : {}) },
        ...(permanent ? {} : { $inc: { attempts: 1 } }),
      });
      failed++;
    }
  }
  return { sent, failed };
}

/** Swap a logged-in dealer for a 1-hour Loyvexa token (Rewards tab). */
export async function participantToken(companyId, { externalRef, mobile }, http = axios) {
  const link = await linkFor(companyId);
  if (!link) return null;
  const { data } = await http.post(`${link.baseUrl}/api/connect/participant-token`, { externalRef: String(externalRef), mobile }, { headers: { 'X-Api-Key': link.key }, timeout: 10000 });
  return { token: data.token, expiresIn: data.expiresIn, baseUrl: link.baseUrl, participant: data.participant };
}

/** Nightly syncs + outbox delivery. Started from server.js; set LOYVEXA_WORKER=off to disable. */
export function startLoyvexaWorker() {
  if (process.env.LOYVEXA_WORKER === 'off') return null;
  let busy = false;
  const tick = async () => {
    if (busy) return; busy = true;
    try {
      const now = new Date();
      const companies = await Company.find({ 'integrations.loyvexa.enabled': true }).select('integrations').lean();
      for (const c of companies) {
        const l = c.integrations?.loyvexa || {};
        const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
        // Once a day, after 01:00 IST
        const istHour = new Date(now.getTime() + 5.5 * 3600000).getUTCHours();
        if (istHour >= 1 && day(l.lastMasterSyncAt) !== day(now)) await queueMasterSync(c._id, now);
        if (istHour >= 1 && day(l.lastOutstandingSyncAt) !== day(now)) await queueOutstandingSync(c._id, now);
      }
      await flushOutbox({ now });
    } catch (e) {
      console.error('[loyvexa] worker', e.message);
    } finally { busy = false; }
  };
  const t = setInterval(tick, Number(process.env.LOYVEXA_WORKER_MS || 60000));
  t.unref?.();
  setTimeout(tick, 5000).unref?.();
  return t;
}
