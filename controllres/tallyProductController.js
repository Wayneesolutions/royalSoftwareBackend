import mongoose from 'mongoose';
import Company from '../models/company/companyModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import { XMLParser } from 'fast-xml-parser';

const normalizeString = (value, fallback = '') => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return value.toString().trim();
  }
  return fallback;
};

const normalizeGuid = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.toString().trim();
  if (!trimmed) {
    return null;
  }
  // GUID is alphanumeric, return as string
  return trimmed;
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

const buildCompanyQueryConditions = (guid, escapedGuid, isNumeric, numericGuid) => {
  const conditions = [
    { guid },
    { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
  ];

  if (isNumeric) {
    conditions.push({ guid: numericGuid }, { guid: String(numericGuid) });
  }

  return conditions;
};

const findCompanyByGuid = async (rawGuid) => {
  const guid = normalizeGuid(rawGuid);
  if (!guid) {
    return {
      error: 'MISSING_GUID',
      message: 'Missing company GUID. Please provide a valid company GUID.',
      guid: null,
      company: null,
    };
  }

  const escapedGuid = guid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numericGuid = Number(guid);
  const isNumeric = !Number.isNaN(numericGuid) && Number.isFinite(numericGuid);
  const queryConditions = buildCompanyQueryConditions(guid, escapedGuid, isNumeric, numericGuid);

  let company = null;
  for (const condition of queryConditions) {
    company = await Company.findOne(condition);
    if (company) break;
  }

  if (!company) {
    company = await Company.findOne({ $or: queryConditions });
  }

  if (!company) {
    try {
      const collection = Company.collection;
      const directQuery = { $or: buildCompanyQueryConditions(guid, escapedGuid, isNumeric, numericGuid) };
      const rawDoc = await collection.findOne(directQuery);
      if (rawDoc) {
        company = await Company.findById(rawDoc._id);
      }
    } catch (error) {
      console.error('Error in direct MongoDB query for GUID:', error);
    }
  }

  if (!company) {
    return {
      error: 'COMPANY_NOT_FOUND',
      message: `Company not found for GUID: ${guid}. Please ensure the company exists.`,
      guid,
      company: null,
    };
  }

  return { company, guid };
};

const buildProductPayload = ({ item, company, partial = false, existingProduct = null }) => {
  const productCode = normalizeString(
    item.productCode ||
      item.ProductCode ||
      item.product_code ||
      item.code ||
      item.Code
  );
  const productName = normalizeString(
    item.productName ||
      item.ProductName ||
      item.product_name ||
      item.Name ||
      item.name
  );
  const resolvedName = productName || normalizeString(item.name || item.Name);
  const derivedPrice =
    item.price !== undefined || item.unitPrice !== undefined
      ? normalizeNumber(item.price ?? item.unitPrice, 0)
      : undefined;
  const derivedStock =
    item.stock !== undefined || item.quantity !== undefined
      ? normalizeNumber(item.stock ?? item.quantity, 0)
      : undefined;
  const derivedGst =
    item.gstRate !== undefined ? normalizeNumber(item.gstRate, 0) :
    item.itemGstPer !== undefined ? normalizeNumber(item.itemGstPer, 0) :
    item.Itemgstper !== undefined ? normalizeNumber(item.Itemgstper, 0) :
    undefined;
  const derivedCategory =
    item.category !== undefined || item.Category !== undefined
      ? normalizeString(item.category || item.Category)
      : undefined;

  const getFieldValue = (fieldVariations, fallback, allowPartial) => {
    for (const field of fieldVariations) {
      if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
        return item[field];
      }
    }
    return allowPartial ? undefined : fallback;
  };

  const payload = {};

  const assignStringField = (key, fieldNames, fallbackValue) => {
    const fallback = partial
      ? existingProduct && existingProduct[key] !== undefined
        ? existingProduct[key]
        : undefined
      : fallbackValue;
    const value = getFieldValue(fieldNames, fallback, partial);
    const normalized = normalizeString(value, fallback);
    if (normalized !== undefined) {
      payload[key] = normalized;
    }
  };

  const assignNumberField = (key, fieldNames, fallbackValue) => {
    const fallback = partial
      ? existingProduct && existingProduct[key] !== undefined
        ? existingProduct[key]
        : undefined
      : fallbackValue;
    const value = getFieldValue(fieldNames, fallback, partial);
    const normalized = normalizeNumber(value, fallback);
    if (normalized !== undefined) {
      payload[key] = normalized;
    }
  };

  const assignBooleanField = (key, fieldNames, fallbackValue) => {
    const fallback = partial
      ? existingProduct && existingProduct[key] !== undefined
        ? existingProduct[key]
        : undefined
      : fallbackValue;
    const value = getFieldValue(fieldNames, fallback, partial);
    const normalized = normalizeBoolean(value, fallback);
    if (normalized !== undefined) {
      payload[key] = normalized;
    }
  };

  assignStringField(
    'name',
    ['Name', 'name', 'NAME', 'productName', 'ProductName', 'PRODUCTNAME'],
    resolvedName
  );
  assignStringField('partNo', ['PArtno', 'partNo', 'PartNo', 'PARTNO', 'partno', 'Part_No'], undefined);
  assignStringField('itemAlias', ['ItemAlias', 'itemAlias', 'ITEMALIAS', 'itemalias'], undefined);
  assignStringField('description', ['Description', 'description', 'DESCRIPTION', 'desc', 'Desc'], undefined);
  assignStringField('parent', ['Parent', 'parent', 'PARENT', 'ParentItem'], undefined);

  const categoryFallback = derivedCategory || 'General';
  assignStringField('category', ['Category', 'category', 'CATEGORY', 'cat', 'Cat'], categoryFallback);

  assignStringField('subCategory', ['subCategory', 'SubCategory'], undefined);
  assignStringField('brand', ['brand', 'Brand'], undefined);
  assignStringField(
    'baseUnits',
    ['Baseunits', 'baseUnits', 'baseunits', 'BASEUNITS', 'BaseUnits', 'unit', 'Unit', 'UNIT'],
    undefined
  );
  assignStringField('additionalUnits', ['additionalunits', 'additionalUnits', 'AdditionalUnits'], undefined);

  assignNumberField(
    'stdPurcRate',
    ['Stdpurcrate', 'stdPurcRate', 'StdPurcRate', 'STDPURCRATE', 'stdPurchaseRate', 'purchaseRate'],
    normalizeNumber(item.stdPurcRate, 0)
  );

  assignNumberField(
    'stdSaleRate',
    ['StdSalerate', 'stdSaleRate', 'StdSaleRate', 'STDSALERATE', 'stdSalesRate', 'saleRate'],
    normalizeNumber(item.stdSaleRate ?? derivedPrice ?? 0, 0)
  );

  assignNumberField(
    'itemGstPer',
    ['Itemgstper', 'itemGstPer', 'ItemGstPer', 'ITEMGSTPER', 'gstRate', 'GstRate', 'gst'],
    normalizeNumber(item.itemGstPer ?? derivedGst ?? 18, 18)
  );

  assignStringField('itemHsn', ['Itemhsn', 'itemHsn', 'ItemHsn', 'ITEMHSN', 'hsn', 'Hsn', 'HSN'], undefined);
  assignStringField('itemHsnDesc', ['Itemhsndesc', 'itemHsnDesc', 'ItemHsnDesc', 'ITEMHSNDESC'], undefined);

  assignNumberField(
    'openingBalance',
    ['OPENINGBALANCE', 'openingBalance', 'OpeningBalance', 'OPENING_BALANCE', 'opening'],
    normalizeNumber(item.openingBalance, 0)
  );

  assignNumberField(
    'itemOpRate',
    ['Itemoprate', 'itemOpRate', 'ItemOpRate', 'ITEMOPRATE', 'openingRate', 'OpeningRate'],
    normalizeNumber(item.itemOpRate, 0)
  );

  assignStringField(
    'companyCode',
    ['CompanyCode', 'companyCode', 'COMPANYCODE'],
    company?.companyCode || ''
  );

  assignBooleanField(
    'isFinishItem',
    ['IsfinishItem', 'isFinishItem', 'IsFinishItem', 'ISFINISHITEM', 'finishItem'],
    normalizeBoolean(item.isFinishItem, false)
  );

  assignStringField('other1', ['Other1', 'other1', 'OTHER1'], item.other1);
  assignStringField('other2', ['Other2', 'other2', 'OTHER2'], item.other2);
  assignStringField('other3', ['Other3', 'other3', 'OTHER3'], item.other3);
  assignStringField('other4', ['Other4', 'other4', 'OTHER4'], item.other4);
  assignStringField('other5', ['Other5', 'other5', 'OTHER5'], item.other5);

  assignNumberField(
    'price',
    ['price', 'Price', 'unitPrice', 'UnitPrice'],
    normalizeNumber(item.price ?? item.unitPrice ?? derivedPrice ?? 0, 0)
  );

  assignNumberField(
    'stock',
    ['stock', 'Stock', 'quantity', 'Quantity'],
    normalizeNumber(item.stock ?? item.quantity ?? derivedStock ?? 0, 0)
  );

  assignNumberField(
    'gstRate',
    ['gstRate', 'GstRate', 'GSTRATE'],
    normalizeNumber(item.gstRate ?? derivedGst ?? 18, 18)
  );

  assignStringField(
    'productCode',
    ['productCode', 'ProductCode', 'product_code', 'code', 'Code'],
    productCode
  );

  assignStringField(
    'productName',
    ['productName', 'ProductName', 'product_name', 'Name', 'name'],
    productName || resolvedName
  );

  assignBooleanField(
    'isActive',
    ['isActive', 'IsActive', 'ISACTIVE'],
    normalizeBoolean(item.isActive, true)
  );

  if (!partial && company?._id) {
    payload.companyId = company._id;
  }

  // Sync price ↔ stdSaleRate based on what Tally explicitly sent
  const hasExplicitPrice = ['price', 'Price', 'unitPrice', 'UnitPrice'].some(f => item[f] !== undefined && item[f] !== null && item[f] !== '');
  const hasExplicitSaleRate = ['StdSalerate', 'stdSaleRate', 'StdSaleRate', 'STDSALERATE', 'stdSalesRate', 'saleRate'].some(f => item[f] !== undefined && item[f] !== null && item[f] !== '');

  if (hasExplicitPrice && !hasExplicitSaleRate && payload.price !== undefined) {
    payload.stdSaleRate = payload.price;
  } else if (hasExplicitSaleRate && !hasExplicitPrice && payload.stdSaleRate !== undefined) {
    payload.price = payload.stdSaleRate;
  }

  // Sync gstRate ↔ itemGstPer based on what Tally explicitly sent
  const hasExplicitGstRate = ['gstRate', 'GstRate', 'GSTRATE'].some(f => item[f] !== undefined && item[f] !== null && item[f] !== '');
  const hasExplicitItemGst = ['Itemgstper', 'itemGstPer', 'ItemGstPer', 'ITEMGSTPER', 'gst'].some(f => item[f] !== undefined && item[f] !== null && item[f] !== '');

  if (hasExplicitGstRate && !hasExplicitItemGst && payload.gstRate !== undefined) {
    payload.itemGstPer = payload.gstRate;
  } else if (hasExplicitItemGst && !hasExplicitGstRate && payload.itemGstPer !== undefined) {
    payload.gstRate = payload.itemGstPer;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === null) {
      delete payload[key];
    }
  });

  return {
    payload,
    derived: {
      productCode,
      productName: productName || resolvedName,
      resolvedName: resolvedName || productName,
    },
  };
};

/**
 * Upsert products from Tally ERP
 * Accepts single product object or array of products for batch processing
 * Each product is processed independently - success/failure of one doesn't affect others
 * Returns results array with status for each product
 */
export const upsertCompanyProductFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    // Support both single product and array of products
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (payload.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    const results = [];

    for (const item of payload) {
      const rawGuid = item.companyGuid || item.guid || item.companyGUID;
      const { company, guid, error, message } = await findCompanyByGuid(rawGuid);
      if (!company) {
        results.push({
          productCode: normalizeString(item.productCode),
          productName: normalizeString(item.productName),
          guid,
          success: false,
          message: message || 'Company not found for provided GUID.',
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const productCode = normalizeString(item.productCode);
      const productName = normalizeString(item.productName);
      const name = normalizeString(item.name || item.Name || item.productName);
      
      if (!productCode || (!productName && !name)) {
        results.push({
          productCode,
          success: false,
          message: 'Product code and product name are required',
        });
        continue;
      }

      const { payload: baseData, derived } = buildProductPayload({
        item,
        company,
        partial: false,
      });
      const resolvedProductCode = derived.productCode || productCode;
      const resolvedName = derived.productName;

      // Check if product already exists (same productCode and companyId)
      const existingProduct = await Product.findOne({
        productCode: resolvedProductCode,
        companyId: company._id,
      });

      if (existingProduct) {
        // Update existing product with new data from Tally
        const { payload: updatePayload } = buildProductPayload({
          item,
          company,
          partial: true,
          existingProduct,
        });

        const updatedProduct = await Product.findByIdAndUpdate(
          existingProduct._id,
          { $set: updatePayload },
          { new: true, runValidators: true, context: 'query' }
        );

        results.push({
          success: true,
          action: 'updated',
          product: updatedProduct ? updatedProduct.toObject() : existingProduct.toObject(),
        });
        continue;
      }

      // For Tally products, createdBy is optional
      let creatorId = null;
      if (item.createdBy) {
        if (mongoose.Types.ObjectId.isValid(item.createdBy)) {
          creatorId = item.createdBy;
        }
      } else if (company.createdBy) {
        creatorId = company.createdBy;
      }

      // Create new product
      const product = await Product.create({
        ...baseData,
        createdBy: creatorId || null,
      });

      const productObj = product.toObject ? product.toObject() : product;

      results.push({
        success: true,
        action: 'created',
        product: productObj,
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

export const updateProductFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (!payload.length) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    const results = [];

    for (const item of payload) {
      const rawGuid = item.companyGuid || item.guid || item.companyGUID;
      const { company, guid, error, message } = await findCompanyByGuid(rawGuid);
      if (!company) {
        results.push({
          productId: item.productId || item._id,
          productCode: normalizeString(item.productCode),
          success: false,
          message: message || 'Company not found for provided GUID.',
          error: error || 'COMPANY_NOT_FOUND',
          guid,
        });
        continue;
      }

      const rawProductId = item.productId || item._id;
      const productId = rawProductId;
      const providedProductCode = normalizeString(
        item.productCode ||
          item.ProductCode ||
          item.product_code ||
          item.code ||
          item.Code
      );
      const productIdLooksLikeCode =
        productId &&
        !mongoose.Types.ObjectId.isValid(productId) &&
        !providedProductCode;
      const productCode = productIdLooksLikeCode
        ? normalizeString(productId)
        : providedProductCode;

      if (!productId && !productCode) {
        results.push({
          success: false,
          message: 'productId or productCode is required for updates',
          error: 'MISSING_PRODUCT_IDENTIFIER',
        });
        continue;
      }

      let product = null;
      if (productId && mongoose.Types.ObjectId.isValid(productId)) {
        product = await Product.findOne({
          _id: productId,
          companyId: company._id,
        });
      }

      if (!product && productCode) {
        product = await Product.findOne({
          productCode,
          companyId: company._id,
        });
      }

      if (!product) {
        results.push({
          success: false,
          productId,
          productCode,
          message: 'Product not found for the provided identifier and company GUID',
          error: 'PRODUCT_NOT_FOUND',
        });
        continue;
      }

      const { payload: updatePayload } = buildProductPayload({
        item,
        company,
        partial: true,
        existingProduct: product,
      });

      if (!Object.keys(updatePayload).length) {
        results.push({
          success: false,
          productId: product._id,
          message: 'No updatable fields were provided in the payload',
          error: 'EMPTY_UPDATE',
        });
        continue;
      }

      const updatedProduct = await Product.findByIdAndUpdate(
        product._id,
        { $set: updatePayload },
        { new: true, runValidators: true, context: 'query' }
      );

      results.push({
        success: true,
        product: updatedProduct ? updatedProduct.toObject() : product.toObject(),
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 400 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    console.error('Error updating products from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update products from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteProductFromTally = async (req, res) => {
  try {
    const { guid } = req.params;
    const parsedBody = parseIncomingPayload(req);
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (!payload.length) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    const { company, message, error } = await findCompanyByGuid(guid);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: message || 'Company not found for provided GUID.',
        error: error || 'COMPANY_NOT_FOUND',
      });
    }

    const results = [];

    for (const item of payload) {
      const normalizedCode = normalizeString(
        item.productCode ||
          item.code ||
          item.productId ||
          item.ProductCode ||
          item.product_code
      );

      if (!normalizedCode) {
        results.push({
          success: false,
          productCode: item.productCode || item.productId,
          message: 'productCode is required for deletion',
          error: 'MISSING_PRODUCT_CODE',
        });
        continue;
      }

      const deletedProduct = await Product.findOneAndDelete({
        companyId: company._id,
        productCode: normalizedCode,
      });

      if (!deletedProduct) {
        results.push({
          success: false,
          productCode: normalizedCode,
          message: 'Product not found for the provided company and code',
          error: 'PRODUCT_NOT_FOUND',
        });
        continue;
      }

      results.push({
        success: true,
        productCode: normalizedCode,
        productId: deletedProduct._id,
      });
    }

    const failures = results.filter((r) => !r.success);
    const status =
      failures.length === results.length
        ? 404
        : failures.length > 0
          ? 207
          : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    console.error('Error deleting product from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete product(s)',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const searchProductsForTally = async (req, res) => {
  try {
    const guid = req.params.guid || req.query.guid;
    const { company, message, error } = await findCompanyByGuid(guid);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: message || 'Company not found for provided GUID.',
        error: error || 'COMPANY_NOT_FOUND',
      });
    }

    const {
      query,
      productCode,
      name,
      partNo,
      limit = 50,
      isActive,
    } = req.query;

    const filter = { companyId: company._id };
    const orFilters = [];

    if (query) {
      const regex = new RegExp(query, 'i');
      orFilters.push(
        { name: regex },
        { productName: regex },
        { productCode: regex },
        { partNo: regex },
        { itemAlias: regex },
        { description: regex },
      );
    }

    if (productCode) {
      orFilters.push({ productCode: new RegExp(productCode, 'i') });
    }

    if (name) {
      orFilters.push({ name: new RegExp(name, 'i') }, { productName: new RegExp(name, 'i') });
    }

    if (partNo) {
      orFilters.push({ partNo: new RegExp(partNo, 'i') });
    }

    if (orFilters.length) {
      filter.$or = orFilters;
    }

    if (isActive !== undefined) {
      filter.isActive = ['true', '1', true].includes(isActive);
    }

    const limitValue = Math.min(Number(limit) || 50, 200);
    const products = await Product.find(filter)
      .sort({ updatedAt: -1 })
      .limit(limitValue);

    return res.json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error('Error searching products for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search products',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

