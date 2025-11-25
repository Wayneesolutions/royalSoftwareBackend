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

