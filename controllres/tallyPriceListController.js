import Company from '../models/company/companyModel.js';
import PriceList from '../models/pricelist/priceListModel.js';
import { XMLParser } from 'fast-xml-parser';

const normalizeString = (value, fallback = '') => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return value.toString().trim();
  return fallback;
};

const normalizeGuid = (value) => {
  if (value === null || value === undefined) return null;
  const trimmed = value.toString().trim();
  return trimmed || null;
};

const normalizeNumber = (value, fallback = 0) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
});

const convertJsonLikeString = (raw) =>
  raw
    .replace(/\r?\n|\t/g, '')
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

const parseIncomingPayload = (req) => {
  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    return req.body;
  }

  const raw =
    typeof req.body === 'string'
      ? req.body
      : req.rawBody
        ? req.rawBody.toString('utf8')
        : '';

  if (!raw || raw.trim() === '') return {};

  const trimmed = raw.trim();

  const tryParseJson = (input) => {
    try { return JSON.parse(input); } catch { return null; }
  };

  let parsed = tryParseJson(trimmed);
  if (parsed && typeof parsed === 'object') return parsed;

  parsed = tryParseJson(convertJsonLikeString(trimmed));
  if (parsed && typeof parsed === 'object') return parsed;

  if (trimmed.startsWith('<')) {
    try {
      const xmlResult = xmlParser.parse(trimmed);
      if (Array.isArray(xmlResult)) return xmlResult;
      if (xmlResult?.PriceLists) return xmlResult.PriceLists.PriceList || xmlResult.PriceLists;
      if (xmlResult?.PriceList) return xmlResult.PriceList;
      return xmlResult;
    } catch {
      throw new Error('INVALID_XML_PAYLOAD');
    }
  }

  throw new Error('INVALID_TALLY_PAYLOAD');
};

const findCompanyByGuid = async (rawGuid) => {
  const guid = normalizeGuid(rawGuid);
  if (!guid) {
    return { error: 'MISSING_GUID', message: 'Missing company GUID.', guid: null, company: null };
  }

  const escapedGuid = guid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numericGuid = Number(guid);
  const isNumeric = !Number.isNaN(numericGuid) && Number.isFinite(numericGuid);

  const conditions = [
    { guid },
    { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
    ...(isNumeric ? [{ guid: numericGuid }, { guid: String(numericGuid) }] : []),
  ];

  let company = null;
  for (const condition of conditions) {
    company = await Company.findOne(condition);
    if (company) break;
  }
  if (!company) company = await Company.findOne({ $or: conditions });

  if (!company) {
    company = await Company.findOne({
      companyCode: { $regex: new RegExp(`^${escapedGuid}$`, 'i') },
    });
  }

  if (!company) {
    return {
      error: 'COMPANY_NOT_FOUND',
      message: `Company not found for GUID: ${guid}.`,
      guid,
      company: null,
    };
  }

  return { company, guid };
};

/**
 * Upsert price list entries pushed from Tally ERP.
 * Accepts a single entry or an array.
 * Unique key: cmpcode + itemguid + plname
 */
export const upsertPriceListFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (payload.length === 0) {
      return res.status(400).json({ success: false, message: 'Payload cannot be empty' });
    }

    const results = [];

    for (const item of payload) {
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;
      const { company, guid, error, message } = await findCompanyByGuid(guidSource);

      if (!company) {
        results.push({
          itemguid: item.itemguid || item.ItemGuid || item.itemGUID,
          plname: item.plname || item.PLName || item.plName,
          success: false,
          message: message || `Company not found for GUID: ${guidSource}`,
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const itemguid = normalizeGuid(
        item.itemguid || item.ItemGuid || item.itemGUID || item.itemGuid
      );
      if (!itemguid) {
        results.push({
          success: false,
          message: 'itemguid is required',
          error: 'MISSING_ITEM_GUID',
        });
        continue;
      }

      const itemname = normalizeString(
        item.itemname || item.ItemName || item.itemName
      );
      if (!itemname) {
        results.push({
          itemguid,
          success: false,
          message: 'itemname is required',
          error: 'MISSING_ITEM_NAME',
        });
        continue;
      }

      const plname = normalizeString(
        item.plname || item.PLName || item.plName || item.pricelist || item.PriceList
      );
      if (!plname) {
        results.push({
          itemguid,
          success: false,
          message: 'plname (price list name) is required',
          error: 'MISSING_PL_NAME',
        });
        continue;
      }

      const cmpcode = normalizeString(
        item.cmpcode || item.CmpCode || item.companyCode || company.companyCode
      );

      const updateData = {
        itemname,
        pldate: normalizeDate(item.pldate || item.PLDate || item.plDate),
        plrate: normalizeNumber(
          item.plrate ?? item.PLRate ?? item.plRate ?? item.rate ?? item.Rate,
          0
        ),
        other1: item.other1 !== undefined ? normalizeString(item.other1 || item.Other1) : undefined,
        other2: item.other2 !== undefined ? normalizeString(item.other2 || item.Other2) : undefined,
        companyId: company._id,
        isActive:
          item.isActive !== undefined
            ? item.isActive === true || item.isActive === 'true' || item.isActive === 1
            : undefined,
      };

      // Remove undefined fields so we don't overwrite existing values with undefined
      Object.keys(updateData).forEach((k) => {
        if (updateData[k] === undefined) delete updateData[k];
      });

      const filter = { cmpcode, itemguid, plname };

      await PriceList.findOneAndUpdate(
        filter,
        { $set: { ...updateData, cmpcode, itemguid, plname } },
        { upsert: true, new: true, runValidators: true }
      );

      results.push({ success: true, itemguid, plname });
    }

    const failures = results.filter((r) => !r.success);
    const status =
      failures.length === results.length ? 400 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({ success: failures.length === 0, results });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in upsertPriceListFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while syncing price lists',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * GET price lists for the mobile app.
 * Query params: plname, itemguid, cmpcode
 * companyId is resolved from the authenticated user's default company.
 */
export const getPriceLists = async (req, res) => {
  try {
    const companyId =
      req.user?.userDetails?.defaultCompany?._id ||
      req.user?.userDetails?.defaultCompany;

    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Company context not found in token' });
    }

    const { plname, itemguid, cmpcode } = req.query;

    const filter = { companyId, isActive: true };
    if (plname) filter.plname = plname;
    if (itemguid) filter.itemguid = itemguid;
    if (cmpcode) filter.cmpcode = cmpcode;

    const entries = await PriceList.find(filter)
      .sort({ plname: 1, itemname: 1 })
      .lean();

    // Also return distinct price list names for dropdowns
    const plnames = [...new Set(entries.map((e) => e.plname))].sort();

    return res.json({
      success: true,
      total: entries.length,
      plnames,
      data: entries,
    });
  } catch (error) {
    console.error('Error in getPriceLists:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch price lists',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * GET distinct price list names for a company (for dropdown only).
 */
export const getPriceListNames = async (req, res) => {
  try {
    const companyId =
      req.user?.userDetails?.defaultCompany?._id ||
      req.user?.userDetails?.defaultCompany;

    if (!companyId) {
      return res.status(401).json({ success: false, message: 'Company context not found in token' });
    }

    const plnames = await PriceList.distinct('plname', { companyId, isActive: true });

    return res.json({ success: true, plnames: plnames.sort() });
  } catch (error) {
    console.error('Error in getPriceListNames:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch price list names',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
