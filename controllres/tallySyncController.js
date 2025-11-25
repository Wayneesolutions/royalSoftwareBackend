import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';
import { XMLParser } from 'fast-xml-parser';

const isBlank = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

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

export const createCompanyFromTally = async (req, res) => {
  try {
    const payload = parseIncomingPayload(req);

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

    const missingFields = requiredFields.filter((field) =>
      isBlank(payload[field])
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    let creatorId = null;
    if (!isBlank(payload.createdBy)) {
      const creator = await User.findById(payload.createdBy).select('_id name role');
      if (!creator) {
        return res.status(400).json({
          success: false,
          message: 'Invalid createdBy: user not found',
        });
      }
      creatorId = creator._id;
    }

    // GUID is alphanumeric string
    const guid = payload.guid ? String(payload.guid).trim() : null;
    if (!guid || guid === '') {
      return res.status(400).json({
        success: false,
        message: 'Invalid guid: GUID is required and must be a non-empty alphanumeric string',
      });
    }

    const maxUser = toNumber(payload.maxUser);
    if (!Number.isFinite(maxUser) || maxUser < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid maxUser: must be a positive number',
      });
    }

    const normalizedEmail = String(payload.companyEmail).trim().toLowerCase();
    const normalizedCode = String(payload.companyCode).trim().toUpperCase();
    const normalizedMobile = String(payload.companyMobile).trim();

    const existingCompany = await Company.findOne({
      $or: [
        { guid },
        { companyEmail: normalizedEmail },
      ],
    });

    if (existingCompany) {
      return res.status(200).json({
        success: true,
        message: 'Company already exists. Returning existing record.',
        data: existingCompany,
        meta: {
          duplicate: true,
          matchedOn: {
            guid: existingCompany.guid === guid,
            companyEmail: existingCompany.companyEmail === normalizedEmail,
          },
        },
      });
    }

    const companyData = {
      companyName: String(payload.companyName).trim(),
      companyState: String(payload.companyState).trim(),
      companyCountry: String(payload.companyCountry).trim(),
      companyMobile: normalizedMobile,
      companyEmail: normalizedEmail,
      companyCode: normalizedCode,
      maxUser,
      guid,
      createdBy: creatorId,
    };

    if (!isBlank(payload.gstin)) {
      companyData.gstin = String(payload.gstin).trim();
    }

    const contactDetails = cleanContactDetails(payload.contactDetails);
    if (contactDetails) {
      companyData.contactDetails = contactDetails;
    }

    const company = await Company.create(companyData);

    return res.status(201).json({
      success: true,
      message: 'Company synced from Tally successfully',
      data: company,
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Unable to parse Tally payload. Ensure the payload is valid JSON or XML.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    console.error('Error syncing company from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync company from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

