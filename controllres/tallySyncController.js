import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';
import { XMLParser } from 'fast-xml-parser';

const isBlank = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

const normalizeString = (value, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const toNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

const cleanContactDetails = (contact = {}) => {
  const result = {};

  if (contact.email && String(contact.email).trim() !== '') {
    result.email = String(contact.email).trim().toLowerCase();
  }

  if (contact.phone && String(contact.phone).trim() !== '') {
    result.phone = String(contact.phone).trim();
  }

  if (contact.website && String(contact.website).trim() !== '') {
    result.website = String(contact.website).trim();
  }

  if (contact.address && typeof contact.address === 'object') {
    const address = contact.address;
    const cleanedAddress = {};

    ['street', 'city', 'state', 'country', 'pincode'].forEach((key) => {
      if (address[key] && String(address[key]).trim() !== '') {
        cleanedAddress[key] = String(address[key]).trim();
      }
    });

    if (Object.keys(cleanedAddress).length > 0) {
      result.address = cleanedAddress;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
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
  if (req.body && typeof req.body === 'object') {
    // Support both single object and array
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
      if (xmlResult?.Companies) {
        return xmlResult.Companies.Company || xmlResult.Companies;
      }
      if (xmlResult?.Company) {
        return xmlResult.Company;
      }
      return xmlResult;
    } catch (error) {
      throw new Error('INVALID_XML_PAYLOAD');
    }
  }

  throw new Error('INVALID_TALLY_PAYLOAD');
};

const buildGuidQueryConditions = (guid, escapedGuid, isNumeric, numericGuid) => {
  const conditions = [
    { guid },
    { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
  ];

  if (isNumeric) {
    conditions.push({ guid: numericGuid }, { guid: String(numericGuid) });
  }

  return conditions;
};

const findExistingCompanyByGuid = async (rawGuid) => {
  const guid = rawGuid ? String(rawGuid).trim() : null;
  if (!guid) {
    return {
      guid: null,
      company: null,
      error: 'MISSING_GUID',
      message: 'Company GUID is required.',
    };
  }

  const escapedGuid = guid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numericGuid = Number(guid);
  const isNumeric = Number.isFinite(numericGuid);
  const queryConditions = buildGuidQueryConditions(guid, escapedGuid, isNumeric, numericGuid);

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
      const rawDoc = await Company.collection.findOne({ $or: queryConditions });
      if (rawDoc) {
        company = await Company.findById(rawDoc._id);
      }
    } catch (error) {
      console.error('Direct Mongo query error for GUID lookup:', error);
    }
  }

  if (!company) {
    return {
      guid,
      company: null,
      error: 'COMPANY_NOT_FOUND',
      message: `Company not found for GUID: ${guid}`,
    };
  }

  return { guid, company };
};

/**
 * Create companies from Tally ERP
 * Accepts single company object or array of companies for batch processing
 * Each company is processed independently - success/failure of one doesn't affect others
 * Returns results array with status for each company
 */
export const createCompanyFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    // Support both single company and array of companies
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (payload.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    const requiredFields = [
      'guid',
      'companyCode',
      'companyName',
      'companyEmail',
      'companyMobile',
      'companyState',
      'companyCountry',
      'maxUser',
    ];

    const results = [];

    for (const item of payload) {
      // Validate required fields for this company
      const missingFields = requiredFields.filter((field) =>
        isBlank(item[field])
      );

      if (missingFields.length > 0) {
        results.push({
          companyCode: item.companyCode || normalizeString(item.companyCode),
          companyName: item.companyName || normalizeString(item.companyName),
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          error: 'MISSING_FIELDS',
        });
        continue;
      }

      let creatorId = null;
      if (!isBlank(item.createdBy)) {
        const creator = await User.findById(item.createdBy).select('_id name role');
        if (!creator) {
          results.push({
            companyCode: item.companyCode || normalizeString(item.companyCode),
            companyName: item.companyName || normalizeString(item.companyName),
            success: false,
            message: 'Invalid createdBy: user not found',
            error: 'INVALID_CREATOR',
          });
          continue;
        }
        creatorId = creator._id;
      }

      // GUID is alphanumeric string
      const guid = item.guid ? String(item.guid).trim() : null;
      if (!guid || guid === '') {
        results.push({
          companyCode: item.companyCode || normalizeString(item.companyCode),
          companyName: item.companyName || normalizeString(item.companyName),
          success: false,
          message: 'Invalid guid: GUID is required and must be a non-empty alphanumeric string',
          error: 'INVALID_GUID',
        });
        continue;
      }

      const maxUser = toNumber(item.maxUser);
      if (!Number.isFinite(maxUser) || maxUser < 1) {
        results.push({
          companyCode: item.companyCode || normalizeString(item.companyCode),
          companyName: item.companyName || normalizeString(item.companyName),
          success: false,
          message: 'Invalid maxUser: must be a positive number',
          error: 'INVALID_MAX_USER',
        });
        continue;
      }

      const normalizedEmail = String(item.companyEmail).trim().toLowerCase();
      const normalizedCode = String(item.companyCode).trim().toUpperCase();
      const normalizedMobile = String(item.companyMobile).trim();
      const tallySerialId = !isBlank(item.tallySerialId) ? String(item.tallySerialId).trim() : null;

      // Check for duplicate company - check Tally serial ID, GUID, and company code
      const duplicateConditions = [
        { guid },
        { companyCode: normalizedCode },
      ];

      // Add tallySerialId to duplicate check if provided
      if (tallySerialId) {
        duplicateConditions.push({ tallySerialId });
      }

      const existingCompany = await Company.findOne({
        $or: duplicateConditions,
      });

      if (existingCompany) {
        results.push({
          companyCode: normalizedCode,
          companyName: item.companyName || normalizeString(item.companyName),
          success: false,
          message: 'Company already exists. Duplicate companies are not allowed.',
          error: 'DUPLICATE_COMPANY',
          data: existingCompany,
          meta: {
            duplicate: true,
            matchedOn: {
              guid: existingCompany.guid === guid,
              companyCode: existingCompany.companyCode === normalizedCode,
              tallySerialId: tallySerialId ? existingCompany.tallySerialId === tallySerialId : false,
            },
          },
        });
        continue;
      }

      const companyData = {
        companyName: String(item.companyName).trim(),
        companyState: String(item.companyState).trim(),
        companyCountry: String(item.companyCountry).trim(),
        companyMobile: normalizedMobile,
        companyEmail: normalizedEmail,
        companyCode: normalizedCode,
        maxUser,
        guid,
        createdBy: creatorId,
      };

      if (!isBlank(item.gstin)) {
        companyData.gstin = String(item.gstin).trim();
      }

      if (tallySerialId) {
        companyData.tallySerialId = tallySerialId;
      }

      const contactDetails = cleanContactDetails(item.contactDetails);
      if (contactDetails) {
        companyData.contactDetails = contactDetails;
      }

      try {
        const company = await Company.create(companyData);
        results.push({
          success: true,
          message: 'Company synced from Tally successfully',
          data: company,
        });
      } catch (createError) {
        // Handle duplicate key errors (in case of race conditions)
        if (createError.code === 11000) {
          const duplicateField = Object.keys(createError.keyPattern || {})[0];
          const existingCompany = await Company.findOne({
            $or: duplicateConditions,
          });
          
          if (existingCompany) {
            results.push({
              companyCode: normalizedCode,
              companyName: item.companyName || normalizeString(item.companyName),
              success: false,
              message: 'Company already exists. Duplicate companies are not allowed.',
              error: 'DUPLICATE_COMPANY',
              data: existingCompany,
              meta: {
                duplicate: true,
                matchedOn: {
                  guid: existingCompany.guid === guid,
                  companyCode: existingCompany.companyCode === normalizedCode,
                  tallySerialId: tallySerialId ? existingCompany.tallySerialId === tallySerialId : false,
                },
              },
            });
          } else {
            results.push({
              companyCode: normalizedCode,
              companyName: item.companyName || normalizeString(item.companyName),
              success: false,
              message: `Duplicate ${duplicateField} detected`,
              error: 'DUPLICATE_KEY_ERROR',
            });
          }
        } else {
          results.push({
            companyCode: normalizedCode,
            companyName: item.companyName || normalizeString(item.companyName),
            success: false,
            message: 'Failed to create company',
            error: process.env.NODE_ENV === 'development' ? createError.message : undefined,
          });
        }
      }
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

    console.error('Error syncing companies from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync companies from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const updateCompanyFromTally = async (req, res) => {
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
      const guidSource = item.guid || item.companyGuid || item.companyGUID;
      const { company, guid, error, message } = await findExistingCompanyByGuid(guidSource);
      if (!company) {
        results.push({
          guid,
          success: false,
          message: message || 'Company not found for provided GUID.',
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const updates = {};

      if (!isBlank(item.companyName)) {
        updates.companyName = String(item.companyName).trim();
      }
      if (!isBlank(item.companyState)) {
        updates.companyState = String(item.companyState).trim();
      }
      if (!isBlank(item.companyCountry)) {
        updates.companyCountry = String(item.companyCountry).trim();
      }
      if (!isBlank(item.companyMobile)) {
        updates.companyMobile = String(item.companyMobile).trim();
      }
      if (!isBlank(item.companyEmail)) {
        updates.companyEmail = String(item.companyEmail).trim().toLowerCase();
      }
      if (!isBlank(item.maxUser)) {
        const maxUser = toNumber(item.maxUser);
        if (!Number.isFinite(maxUser) || maxUser < 1) {
          results.push({
            guid,
            success: false,
            message: 'Invalid maxUser: must be a positive number',
            error: 'INVALID_MAX_USER',
          });
          continue;
        }
        updates.maxUser = maxUser;
      }

      if (!isBlank(item.companyCode)) {
        const normalizedCode = String(item.companyCode).trim().toUpperCase();
        if (normalizedCode !== company.companyCode) {
          const duplicateCode = await Company.findOne({
            companyCode: normalizedCode,
            _id: { $ne: company._id },
          });
          if (duplicateCode) {
            results.push({
              guid,
              success: false,
              message: `Company code ${normalizedCode} already exists`,
              error: 'DUPLICATE_COMPANY_CODE',
            });
            continue;
          }
          updates.companyCode = normalizedCode;
        }
      }

      if (!isBlank(item.tallySerialId)) {
        const serial = String(item.tallySerialId).trim();
        if (serial !== company.tallySerialId) {
          const duplicateSerial = await Company.findOne({
            tallySerialId: serial,
            _id: { $ne: company._id },
          });
          if (duplicateSerial) {
            results.push({
              guid,
              success: false,
              message: `Tally serial ID ${serial} already exists`,
              error: 'DUPLICATE_TALLY_SERIAL',
            });
            continue;
          }
          updates.tallySerialId = serial;
        }
      }

      if (!isBlank(item.gstin)) {
        updates.gstin = String(item.gstin).trim();
      }

      if (!isBlank(item.guid) && String(item.guid).trim() !== company.guid) {
        const newGuid = String(item.guid).trim();
        const duplicateGuid = await Company.findOne({
          guid: newGuid,
          _id: { $ne: company._id },
        });
        if (duplicateGuid) {
          results.push({
            guid,
            success: false,
            message: `GUID ${newGuid} already exists`,
            error: 'DUPLICATE_GUID',
          });
          continue;
        }
        updates.guid = newGuid;
      }

      const contactDetails = cleanContactDetails(item.contactDetails);
      if (contactDetails) {
        updates.contactDetails = contactDetails;
      }

      if (item.settings && typeof item.settings === 'object') {
        updates.settings = {
          allowSelfApproval: item.settings.allowSelfApproval ?? company.settings?.allowSelfApproval ?? true,
          requireOrderApproval: item.settings.requireOrderApproval ?? company.settings?.requireOrderApproval ?? true,
          maxOrderAmount: toNumber(item.settings.maxOrderAmount) || company.settings?.maxOrderAmount || 100000,
        };
      }

      if (Object.keys(updates).length === 0) {
        results.push({
          guid,
          success: false,
          message: 'No updatable fields were provided in the payload',
          error: 'EMPTY_UPDATE',
        });
        continue;
      }

      const updatedCompany = await Company.findByIdAndUpdate(
        company._id,
        { $set: updates },
        { new: true }
      );

      results.push({
        success: true,
        data: updatedCompany,
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 400 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    console.error('Error updating companies from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update companies from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteCompanyFromTally = async (req, res) => {
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
      const guidSource = item.guid || item.companyGuid || item.companyGUID;
      const { company, guid, message, error } = await findExistingCompanyByGuid(guidSource);

      if (!company) {
        results.push({
          guid,
          success: false,
          message: message || 'Company not found for provided GUID.',
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      await Company.deleteOne({ _id: company._id });

      results.push({
        success: true,
        guid: company.guid,
        companyId: company._id,
        companyCode: company.companyCode,
      });
    }

    const failures = results.filter((item) => !item.success);
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
    console.error('Error deleting companies from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete companies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const searchCompaniesForTally = async (req, res) => {
  try {
    const {
      query,
      companyCode,
      guid,
      tallySerialId,
      limit = 50,
      isActive,
    } = req.query;

    const filter = {};
    const orFilters = [];

    if (guid) {
      filter.guid = guid;
    }

    if (companyCode) {
      filter.companyCode = new RegExp(`^${companyCode}$`, 'i');
    }

    if (tallySerialId) {
      filter.tallySerialId = tallySerialId;
    }

    if (query) {
      const regex = new RegExp(query, 'i');
      orFilters.push(
        { companyName: regex },
        { companyCode: regex },
        { companyEmail: regex },
        { guid: regex },
        { tallySerialId: regex }
      );
    }

    if (orFilters.length) {
      filter.$or = orFilters;
    }

    if (isActive !== undefined) {
      filter.isActive = ['true', '1', true].includes(isActive);
    }

    const limitValue = Math.min(Number(limit) || 50, 200);
    const companies = await Company.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitValue);

    return res.json({
      success: true,
      count: companies.length,
      data: companies,
    });
  } catch (error) {
    console.error('Error searching companies for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search companies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

