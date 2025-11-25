import Company from '../models/company/companyModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import { XMLParser } from 'fast-xml-parser';

const normalizeString = (value, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

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
      const guid = normalizeGuid(rawGuid);

      if (!guid) {
        results.push({
          productCode: item.productCode || normalizeString(item.productCode),
          productName: item.productName || normalizeString(item.productName),
          success: false,
          message: 'Missing company GUID. Please provide a valid company GUID.',
          error: 'MISSING_GUID',
        });
        continue;
      }

      // Try to find company by GUID (alphanumeric string)
      // Escape special regex characters in GUID
      const escapedGuid = guid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Build query conditions to handle both string and numeric GUIDs (backward compatibility)
      const numericGuid = Number(guid);
      const isNumeric = !Number.isNaN(numericGuid) && Number.isFinite(numericGuid);
      
      // Try multiple query strategies
      const queryConditions = [
        { guid: guid }, // Exact string match
        { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } } // Case-insensitive string match
      ];
      
      // If GUID is numeric, also try as number (for backward compatibility with old data)
      if (isNumeric) {
        queryConditions.push(
          { guid: numericGuid }, // Number match
          { guid: String(numericGuid) } // String representation of number
        );
      }
      
      // Try all conditions
      let company = null;
      for (const condition of queryConditions) {
        company = await Company.findOne(condition);
        if (company) break;
      }
      
      // Final attempt: Use $or query to search all possibilities at once
      if (!company) {
        company = await Company.findOne({ $or: queryConditions });
      }
      
      // Last resort: Direct MongoDB query to bypass Mongoose type coercion
      // This handles cases where GUID might be stored as number in DB but schema expects string
      if (!company) {
        try {
          const collection = Company.collection;
          const directQuery = {
            $or: [
              { guid: guid },
              { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } }
            ]
          };
          
          if (isNumeric) {
            directQuery.$or.push(
              { guid: numericGuid },
              { guid: String(numericGuid) }
            );
          }
          
          const rawDoc = await collection.findOne(directQuery);
          if (rawDoc) {
            company = await Company.findById(rawDoc._id);
          }
          
        } catch (error) {
          console.error('Error in direct MongoDB query for GUID:', error);
        }
      }

      if (!company) {
        results.push({
          productCode: item.productCode || normalizeString(item.productCode),
          productName: item.productName || normalizeString(item.productName),
          guid: guid,
          success: false,
          message: `Company not found for GUID: ${guid}. Please ensure the company is registered in the system with this GUID.`,
          error: 'COMPANY_NOT_FOUND',
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

      const price = normalizeNumber(item.price ?? item.unitPrice, 0);
      const stock = normalizeNumber(item.stock ?? item.quantity, 0);
      const gstRate = normalizeNumber(item.gstRate, 18);
      const category = normalizeString(item.category || item.Category, 'General');

      // Helper function to get value with multiple field name variations
      const getFieldValue = (fieldVariations, defaultValue = '') => {
        for (const field of fieldVariations) {
          if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
            return item[field];
          }
        }
        return defaultValue;
      };

      // Helper function to get number value with multiple field name variations
      const getNumberValue = (fieldVariations, defaultValue = 0) => {
        for (const field of fieldVariations) {
          if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
            return normalizeNumber(item[field], defaultValue);
          }
        }
        return defaultValue;
      };

      // Helper function to get boolean value with multiple field name variations
      const getBooleanValue = (fieldVariations, defaultValue = false) => {
        for (const field of fieldVariations) {
          if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
            return normalizeBoolean(item[field], defaultValue);
          }
        }
        return defaultValue;
      };

      // Stockitem Master Fields - Accepts ALL fields from Tally
      // This mapping accepts exact Tally field names as specified in Stockitem Master:
      // Name, PArtno, ItemAlias, Description, Parent, Category, Baseunits, additionalunits,
      // Stdpurcrate, StdSalerate, Itemgstper, Itemhsn, Itemhsndesc, OPENINGBALANCE,
      // Itemoprate, CompanyCode, IsfinishItem, Other1, Other2, Other3, Other4, Other5
      // Priority: Exact Tally field names first, then common variations for flexibility
      const baseData = {
        // Name - exact Tally field name
        name: normalizeString(
          getFieldValue(['Name', 'name', 'NAME', 'productName', 'ProductName', 'PRODUCTNAME']) || 
          name || productName
        ),
        
        // PArtno - exact Tally field name (note the capital P and A)
        partNo: normalizeString(
          getFieldValue(['PArtno', 'partNo', 'PartNo', 'PARTNO', 'partno', 'Part_No', 'PART_NO'])
        ),
        
        // ItemAlias - exact Tally field name
        itemAlias: normalizeString(
          getFieldValue(['ItemAlias', 'itemAlias', 'ITEMALIAS', 'itemalias', 'Item_Alias', 'ITEM_ALIAS'])
        ),
        
        // Description - exact Tally field name
        description: normalizeString(
          getFieldValue(['Description', 'description', 'DESCRIPTION', 'desc', 'Desc', 'DESC'])
        ),
        
        // Parent - exact Tally field name
        parent: normalizeString(
          getFieldValue(['Parent', 'parent', 'PARENT', 'ParentItem', 'parentItem', 'parent_item'])
        ),
        
        // Category - exact Tally field name
        category: normalizeString(
          getFieldValue(['Category', 'category', 'CATEGORY', 'cat', 'Cat', 'CAT']) || category || 'General'
        ),
        
        // Baseunits - exact Tally field name
        baseUnits: normalizeString(
          getFieldValue(['Baseunits', 'baseUnits', 'baseunits', 'BASEUNITS', 'BaseUnits', 'unit', 'Unit', 'UNIT', 'Base_Units'])
        ),
        
        // additionalunits - exact Tally field name (lowercase 'a')
        additionalUnits: normalizeString(
          getFieldValue(['additionalunits', 'additionalUnits', 'AdditionalUnits', 'ADDITIONALUNITS', 'Additional_Units'])
        ),
        
        // Stdpurcrate - exact Tally field name
        stdPurcRate: getNumberValue(
          ['Stdpurcrate', 'stdPurcRate', 'StdPurcRate', 'STDPURCRATE', 'stdPurchaseRate', 'StandardPurchaseRate', 'purchaseRate', 'PurchaseRate']
        ),
        
        // StdSalerate - exact Tally field name
        stdSaleRate: (() => {
          const value = getNumberValue(
            ['StdSalerate', 'stdSaleRate', 'StdSaleRate', 'STDSALERATE', 'stdSalesRate', 'StandardSaleRate', 'saleRate', 'SaleRate']
          );
          return value || price || 0;
        })(),
        
        // Itemgstper - exact Tally field name
        itemGstPer: (() => {
          const value = getNumberValue(
            ['Itemgstper', 'itemGstPer', 'ItemGstPer', 'ITEMGSTPER', 'gstRate', 'GstRate', 'GSTRATE', 'gst', 'GST', 'GSTPercent', 'gstPercent']
          );
          return value || gstRate || 0;
        })(),
        
        // Itemhsn - exact Tally field name
        itemHsn: normalizeString(
          getFieldValue(['Itemhsn', 'itemHsn', 'ItemHsn', 'ITEMHSN', 'hsn', 'Hsn', 'HSN', 'HSNCode', 'hsnCode', 'HSN_Code'])
        ),
        
        // Itemhsndesc - exact Tally field name
        itemHsnDesc: normalizeString(
          getFieldValue(['Itemhsndesc', 'itemHsnDesc', 'ItemHsnDesc', 'ITEMHSNDESC', 'hsnDesc', 'HsnDesc', 'HSNDESC', 'hsnDescription', 'HsnDescription'])
        ),
        
        // OPENINGBALANCE - exact Tally field name (all caps)
        openingBalance: getNumberValue(
          ['OPENINGBALANCE', 'openingBalance', 'OpeningBalance', 'OPENING_BALANCE', 'opening', 'Opening', 'Opening_Balance']
        ),
        
        // Itemoprate - exact Tally field name
        itemOpRate: getNumberValue(
          ['Itemoprate', 'itemOpRate', 'ItemOpRate', 'ITEMOPRATE', 'openingRate', 'OpeningRate', 'Opening_Rate']
        ),
        
        // CompanyCode - exact Tally field name
        companyCode: normalizeString(
          getFieldValue(['CompanyCode', 'companyCode', 'COMPANYCODE', 'company_code']) || company.companyCode || ''
        ),
        
        // IsfinishItem - exact Tally field name
        isFinishItem: getBooleanValue(
          ['IsfinishItem', 'isFinishItem', 'IsFinishItem', 'ISFINISHITEM', 'finishItem', 'FinishItem', 'is_finish_item']
        ),
        
        // Other1 - exact Tally field name
        other1: normalizeString(
          getFieldValue(['Other1', 'other1', 'OTHER1', 'otherOne', 'OtherOne', 'other_1'])
        ),
        
        // Other2 - exact Tally field name
        other2: normalizeString(
          getFieldValue(['Other2', 'other2', 'OTHER2', 'otherTwo', 'OtherTwo', 'other_2'])
        ),
        
        // Other3 - exact Tally field name
        other3: normalizeString(
          getFieldValue(['Other3', 'other3', 'OTHER3', 'otherThree', 'OtherThree', 'other_3'])
        ),
        
        // Other4 - exact Tally field name
        other4: normalizeString(
          getFieldValue(['Other4', 'other4', 'OTHER4', 'otherFour', 'OtherFour', 'other_4'])
        ),
        
        // Other5 - exact Tally field name
        other5: normalizeString(
          getFieldValue(['Other5', 'other5', 'OTHER5', 'otherFive', 'OtherFive', 'other_5'])
        ),
        
        // Legacy fields for backward compatibility
        productCode,
        productName,
        partNo: normalizeString(item.partNo),
        itemAlias: normalizeString(item.itemAlias),
        description: normalizeString(item.description),
        parent: normalizeString(item.parent),
        category,
        subCategory: normalizeString(item.subCategory),
        brand: normalizeString(item.brand),
        baseUnits: normalizeString(item.baseUnits),
        additionalUnits: normalizeString(item.additionalUnits),
        price,
        stdPurcRate: normalizeNumber(item.stdPurcRate),
        stdSaleRate: normalizeNumber(item.stdSaleRate),
        stock,
        gstRate,
        itemGstPer: normalizeNumber(item.itemGstPer),
        itemHsn: normalizeString(item.itemHsn),
        itemHsnDesc: normalizeString(item.itemHsnDesc),
        openingBalance: normalizeNumber(item.openingBalance),
        itemOpRate: normalizeNumber(item.itemOpRate),
        companyId: company._id,
        isActive: normalizeBoolean(item.isActive, true),
        isFinishItem: normalizeBoolean(item.isFinishItem, false),
        other1: normalizeString(item.other1),
        other2: normalizeString(item.other2),
        other3: normalizeString(item.other3),
        other4: normalizeString(item.other4),
        other5: normalizeString(item.other5),
      };

      // Check for duplicate product (same productCode and companyId)
      const existingProduct = await Product.findOne({
        productCode,
        companyId: company._id,
      });

      if (existingProduct) {
        results.push({
          productCode,
          productName: productName || name,
          success: false,
          message: `Product with code "${productCode}" already exists for this company. Duplicate products are not allowed.`,
          error: 'DUPLICATE_PRODUCT',
          existingProductId: existingProduct._id,
        });
        continue;
      }

      let creatorId = normalizeString(item.createdBy)
        ? item.createdBy
        : company.createdBy;

      // if (!creatorId) {
      //   creatorId = await buildContactlessUser();
      // }

      // if (!creatorId) {
      //   results.push({
      //     productCode,
      //     success: false,
      //     message: 'Unable to determine creator for product',
      //   });
      //   continue;
      // }

      // Create new product only if it doesn't exist
      const product = await Product.create({
        ...baseData,
        createdBy: creatorId,
      });

      // Convert to plain object to ensure all fields (including non-schema fields) are included
      const productObj = product.toObject ? product.toObject() : product;

      results.push({
        success: true,
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

