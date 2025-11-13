import Company from '../models/company/companyModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import { XMLParser } from 'fast-xml-parser';

const normalizeString = (value, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const normalizeNumber = (value, fallback = 0) => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeBoolean = (value, fallback = true) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const lowered = value.toLowerCase();
    if (['true', '1', 'yes'].includes(lowered)) {
      return true;
    }
    if (['false', '0', 'no'].includes(lowered)) {
      return false;
    }
  }
  return fallback;
};

const buildContactlessUser = async () => {
  const existing = await User.findOne({ role: 'superadmin' }).select('_id');
  return existing?._id || null;
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

  if (!raw || raw.trim() === '') {
    return {};
  }

  const trimmed = raw.trim();

  const tryParseJson = (input) => {
    try {
      return JSON.parse(input);
    } catch (error) {
      return null;
    }
  };

  let parsed = tryParseJson(trimmed);
  if (parsed && typeof parsed === 'object') {
    return parsed;
  }

  parsed = tryParseJson(convertJsonLikeString(trimmed));
  if (parsed && typeof parsed === 'object') {
    return parsed;
  }

  if (trimmed.startsWith('<')) {
    try {
      const xmlResult = xmlParser.parse(trimmed);
      if (Array.isArray(xmlResult)) {
        return xmlResult;
      }
      if (xmlResult?.Products) {
        return xmlResult.Products.Product || xmlResult.Products;
      }
      if (xmlResult?.Product) {
        return xmlResult.Product;
      }
      return xmlResult;
    } catch (error) {
      throw new Error('INVALID_XML_PAYLOAD');
    }
  }

  throw new Error('INVALID_TALLY_PAYLOAD');
};

export const upsertCompanyProductFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (payload.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    const results = [];

    for (const item of payload) {
      const guid = normalizeString(item.companyGuid || item.guid || item.companyGUID);

      if (!guid) {
        results.push({
          productCode: item.productCode,
          success: false,
          message: 'Missing company guid',
        });
        continue;
      }

      const company = await Company.findOne({ guid: Number(guid) || guid });
      if (!company) {
        results.push({
          productCode: item.productCode,
          success: false,
          message: 'Company not found for provided guid',
        });
        continue;
      }

      const productCode = normalizeString(item.productCode);
      const productName = normalizeString(item.productName);
      if (!productCode || !productName) {
        results.push({
          productCode,
          success: false,
          message: 'Product code and product name are required',
        });
        continue;
      }

      const price = normalizeNumber(item.price ?? item.unitPrice, 0);
      const stock = normalizeNumber(item.stock ?? item.quantity, 0);
      const gstRate = normalizeNumber(item.gstRate, 18);
      const category = normalizeString(item.category, 'General');

      const baseData = {
        productCode,
        productName,
        description: normalizeString(item.description),
        category,
        subCategory: normalizeString(item.subCategory),
        brand: normalizeString(item.brand),
        price,
        stock,
        gstRate,
        companyId: company._id,
        isActive: normalizeBoolean(item.isActive, true),
      };

      const existingProduct = await Product.findOne({
        productCode,
        companyId: company._id,
      });

      let creatorId = normalizeString(item.createdBy)
        ? item.createdBy
        : company.createdBy;

      if (!creatorId) {
        creatorId = await buildContactlessUser();
      }

      if (!creatorId) {
        results.push({
          productCode,
          success: false,
          message: 'Unable to determine creator for product',
        });
        continue;
      }

      let product;

      if (existingProduct) {
        product = await Product.findByIdAndUpdate(
          existingProduct._id,
          {
            ...baseData,
            updatedBy: creatorId,
          },
          { new: true }
        );
      } else {
        product = await Product.create({
          ...baseData,
          createdBy: creatorId,
        });
      }

      results.push({
        success: true,
        product,
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 400 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Unable to parse Tally payload. Ensure the payload is valid JSON or XML.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    console.error('Error syncing products from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync products from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

