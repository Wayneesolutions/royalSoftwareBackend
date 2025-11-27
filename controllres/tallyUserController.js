import bcrypt from 'bcryptjs';
import { XMLParser } from 'fast-xml-parser';
import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';

const NORMALIZED_ROLES = new Set([
  'superadmin',
  'admin',
  'dealers',
  'subdealer',
  'asm',
  'rsm',
  'distibutors',
  'suppliers',
  'salesman',
  'zonal',
]);

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

const normalizeString = (value, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const normalizeEmail = (value) =>
  value ? value.toString().trim().toLowerCase() : '';

const normalizeRole = (value) => {
  if (!value) return '';
  const lower = value.toString().trim().toLowerCase();
  if (NORMALIZED_ROLES.has(lower)) {
    return lower;
  }
  if (lower === 'distributor' || lower === 'distributors') {
    return 'distibutors';
  }
  if (lower === 'dealer') {
    return 'dealers';
  }
  if (lower === 'sub-dealer') {
    return 'subdealer';
  }
  return '';
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

const normalizeDate = (value) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date;
};

const mapAddress = (input = {}) => ({
  street: normalizeString(input.street),
  city: normalizeString(input.city),
  state: normalizeString(input.state),
  pincode: normalizeString(input.pincode),
  country: normalizeString(input.country, 'India'),
});

const findCompanyByGuidFlexible = async (rawGuid) => {
  const normalizedGuid = normalizeGuid(rawGuid);
  if (!normalizedGuid) {
    return { company: null, guid: null };
  }

  let company = await Company.findOne({ guid: normalizedGuid }).lean();
  if (!company) {
    company = await Company.findOne({
      guid: {
        $regex: new RegExp(
          `^${normalizedGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
          'i'
        ),
      },
    }).lean();
  }

  return { company, guid: normalizedGuid };
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
      if (xmlResult?.Users) {
        return xmlResult.Users.User || xmlResult.Users;
      }
      if (xmlResult?.User) {
        return xmlResult.User;
      }
      return xmlResult;
    } catch (error) {
      throw new Error('INVALID_XML_PAYLOAD');
    }
  }

  throw new Error('INVALID_TALLY_PAYLOAD');
};

export const upsertUserFromTally = async (req, res) => {
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
      const guidSource = item.companyGuid || item.guid || item.companyGUID;
      const { company, guid: normalizedGuid } =
        await findCompanyByGuidFlexible(guidSource);

      if (!company) {
        results.push({
          userName: item.userName || normalizeString(item.userName),
          guid: normalizedGuid,
          success: false,
          message: `Company not found for GUID: ${normalizedGuid}. Please ensure the company is registered in the system with this GUID.`,
          error: 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const role = normalizeRole(item.role);
      if (!role) {
        results.push({
          userName: item.userName,
          success: false,
          message: 'Invalid or missing role',
        });
        continue;
      }

      const name = normalizeString(item.name || item.fullName);
      const mobile = normalizeString(item.mobile || item.phone);
      const email = normalizeString(item.email);

      const password = normalizeString(item.password);

      if (!name || !mobile) {
        results.push({
          userName: item.userName,
          success: false,
          message: 'Name and mobile are required',
        });
        continue;
      }

      if (!password) {
        results.push({
          userName: item.userName,
          success: false,
          message: 'Password is required',
        });
        continue;
      }

      const userPayload = {
        name,
        mobile,
        email: email || undefined,
        userName: normalizeString(item.userName),
        role,
        isActive: normalizeBoolean(item.isActive, true),
        address: mapAddress(item.address),
        defaultCompany: company._id,
        companies: [
          {
            companyId: company._id,
            role,
            isActive: true,
            assignedBy: null,
            assignedAt: normalizeDate(item.assignedAt) || new Date(),
          },
        ],
      };

      const uniquenessCriteria = [];
      if (userPayload.userName) {
        uniquenessCriteria.push({ userName: userPayload.userName });
      }
      if (userPayload.email) {
        uniquenessCriteria.push({ email: userPayload.email });
      }
      if (userPayload.mobile) {
        uniquenessCriteria.push({ mobile: userPayload.mobile });
      }

      const existingUser =
        uniquenessCriteria.length > 0
          ? await User.findOne({ $or: uniquenessCriteria })
          : null;

      if (existingUser) {
        results.push({
          userName: item.userName,
          success: false,
          message: 'User already exists with provided identifiers',
        });
        continue;
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const createdUser = await User.create({
        ...userPayload,
        password: hashedPassword,
      });

      const user = await User.findById(createdUser._id)
        .select('-password')
        .lean();

      results.push({
        success: true,
        user,
      });
    }

    const failures = results.filter((item) => !item.success);
    const status =
      failures.length === results.length
        ? 400
        : failures.length > 0
          ? 207
          : 200;

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

    console.error('Error syncing users from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync users from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const updateUsersFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    const pathGuid = normalizeGuid(req.params.guid);

    if (!payload.length) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    if (!pathGuid) {
      return res.status(400).json({
        success: false,
        message: 'Company GUID in path is required',
        error: 'MISSING_COMPANY_GUID',
      });
    }

    const { company, guid: normalizedGuid } =
      await findCompanyByGuidFlexible(pathGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided GUID.',
        error: 'COMPANY_NOT_FOUND',
      });
    }

    const results = [];

    for (const item of payload) {
      const guid = normalizedGuid;

      const email = normalizeEmail(item.email || item.userEmail);
      if (!email) {
        results.push({
          guid,
          success: false,
          message: 'User email is required for updates',
          error: 'MISSING_EMAIL',
        });
        continue;
      }

      const user = await User.findOne({
        email,
        'companies.companyId': company._id,
      });

      if (!user) {
        results.push({
          guid,
          email,
          success: false,
          message: 'User not found for provided company and email',
          error: 'USER_NOT_FOUND',
        });
        continue;
      }

      const updates = {};
      let companyUpdates = {};

      if (Object.prototype.hasOwnProperty.call(item, 'name')) {
        const name = normalizeString(item.name);
        if (name) {
          updates.name = name;
        }
      }

      if (Object.prototype.hasOwnProperty.call(item, 'mobile')) {
        const mobile = normalizeString(item.mobile);
        if (!mobile) {
          results.push({
            guid,
            email,
            success: false,
            message: 'Mobile cannot be empty when provided',
            error: 'INVALID_MOBILE',
          });
          continue;
        }

        const existingMobile = await User.findOne({
          mobile,
          _id: { $ne: user._id },
        });
        if (existingMobile) {
          results.push({
            guid,
            email,
            success: false,
            message: 'Another user already uses this mobile number',
            error: 'MOBILE_IN_USE',
          });
          continue;
        }
        updates.mobile = mobile;
      }

      if (Object.prototype.hasOwnProperty.call(item, 'role')) {
        const role = normalizeRole(item.role);
        if (!role) {
          results.push({
            guid,
            email,
            success: false,
            message: 'Invalid role provided',
            error: 'INVALID_ROLE',
          });
          continue;
        }
        updates.role = role;
        companyUpdates.role = role;
      }

      if (Object.prototype.hasOwnProperty.call(item, 'isActive')) {
        const isActive = normalizeBoolean(item.isActive, user.isActive);
        updates.isActive = isActive;
        companyUpdates.isActive = isActive;
      }

      if (Object.prototype.hasOwnProperty.call(item, 'address')) {
        updates.address = mapAddress(item.address);
      }

      if (item.password) {
        updates.password = await bcrypt.hash(item.password, 10);
      }

      if (Object.keys(updates).length === 0 && Object.keys(companyUpdates).length === 0) {
        results.push({
          guid,
          email,
          success: false,
          message: 'No updatable fields provided',
          error: 'EMPTY_UPDATE',
        });
        continue;
      }

      const updateQuery = { $set: { ...updates } };
      if (companyUpdates.role) {
        updateQuery.$set['companies.$.role'] = companyUpdates.role;
      }
      if (Object.prototype.hasOwnProperty.call(companyUpdates, 'isActive')) {
        updateQuery.$set['companies.$.isActive'] = companyUpdates.isActive;
      }

      await User.updateOne(
        { _id: user._id, 'companies.companyId': company._id },
        updateQuery
      );

      const updatedUser = await User.findById(user._id).select('-password').lean();

      results.push({
        success: true,
        user: updatedUser,
      });
    }

    const failures = results.filter((item) => !item.success);
    const status =
      failures.length === results.length
        ? 400
        : failures.length > 0
          ? 207
          : 200;

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

    console.error('Error updating users from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update users from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const deleteUsersFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
    const pathGuid = normalizeGuid(req.params.guid);

    if (!payload.length) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    if (!pathGuid) {
      return res.status(400).json({
        success: false,
        message: 'Company GUID in path is required',
        error: 'MISSING_COMPANY_GUID',
      });
    }

    const { company, guid: normalizedGuid } =
      await findCompanyByGuidFlexible(pathGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided GUID.',
        error: 'COMPANY_NOT_FOUND',
      });
    }

    const results = [];

    for (const item of payload) {
      const guid = normalizedGuid;

      if (!company) {
        results.push({
          guid,
          success: false,
          message: 'Company not found for provided GUID.',
          error: 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const email = normalizeEmail(item.email || item.userEmail);
      if (!email) {
        results.push({
          guid,
          success: false,
          message: 'User email is required for deletion',
          error: 'MISSING_EMAIL',
        });
        continue;
      }

      const user = await User.findOne({
        email,
        'companies.companyId': company._id,
      });

      if (!user) {
        results.push({
          guid,
          email,
          success: false,
          message: 'User not found for provided company and email',
          error: 'USER_NOT_FOUND',
        });
        continue;
      }

      await User.deleteOne({ _id: user._id });

      results.push({
        success: true,
        guid,
        email,
        userId: user._id,
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
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Unable to parse Tally payload. Ensure the payload is valid JSON or XML.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    console.error('Error deleting users from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete users from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

