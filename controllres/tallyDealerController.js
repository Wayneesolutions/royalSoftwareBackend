import mongoose from 'mongoose';
import Company from '../models/company/companyModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import SubDealer from '../models/subdealer/subdealerModel.js';
import Group from '../models/group/groupModel.js';
import User from '../models/user/userModel.js';
import { XMLParser } from 'fast-xml-parser';

const isBlank = (value) =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '');

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
  return trimmed;
};

const toNumber = (value, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
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
      if (xmlResult?.Dealers) {
        return xmlResult.Dealers.Dealer || xmlResult.Dealers;
      }
      if (xmlResult?.Dealer) {
        return xmlResult.Dealer;
      }
      if (xmlResult?.SubDealers) {
        return xmlResult.SubDealers.SubDealer || xmlResult.SubDealers;
      }
      if (xmlResult?.SubDealer) {
        return xmlResult.SubDealer;
      }
      return xmlResult;
    } catch (error) {
      throw new Error('INVALID_XML_PAYLOAD');
    }
  }

  throw new Error('INVALID_TALLY_PAYLOAD');
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
  
  const queryConditions = [
    { guid },
    { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
  ];

  if (isNumeric) {
    queryConditions.push({ guid: numericGuid }, { guid: String(numericGuid) });
  }

  let company = null;
  for (const condition of queryConditions) {
    company = await Company.findOne(condition);
    if (company) break;
  }

  if (!company) {
    company = await Company.findOne({ $or: queryConditions });
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

const findGroupByGuid = async (rawGroupGuid, cmpcode) => {
  const groupGuid = normalizeGuid(rawGroupGuid);
  if (!groupGuid) {
    return {
      error: 'MISSING_GROUP_GUID',
      message: 'Missing Group GUID. Please provide a valid Group GUID.',
      groupGuid: null,
      group: null,
    };
  }

  const escapedGuid = groupGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numericGuid = Number(groupGuid);
  const isNumeric = !Number.isNaN(numericGuid) && Number.isFinite(numericGuid);
  
  const queryConditions = [
    { GroupGUID: groupGuid },
    { GroupGUID: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
  ];

  if (isNumeric) {
    queryConditions.push({ GroupGUID: numericGuid }, { GroupGUID: String(numericGuid) });
  }

  const query = cmpcode 
    ? { $or: queryConditions, cmpcode: normalizeString(cmpcode) } 
    : { $or: queryConditions };

  let group = null;
  for (const condition of queryConditions) {
    const tempQuery = cmpcode 
      ? { ...condition, cmpcode: normalizeString(cmpcode) } 
      : condition;
    group = await Group.findOne(tempQuery);
    if (group) break;
  }

  if (!group) {
    group = await Group.findOne(query);
  }

  if (!group) {
    return {
      error: 'GROUP_NOT_FOUND',
      message: `Group not found for GUID: ${groupGuid}. Please ensure the group exists.`,
      groupGuid,
      group: null,
    };
  }

  return { group, groupGuid };
};

const findUserByMobileOrEmail = async (mobile, email, companyId) => {
  const query = {
    $or: [],
    'companies.companyId': companyId,
    isActive: true,
  };

  if (mobile) {
    query.$or.push({ mobile: normalizeString(mobile) });
  }
  if (email) {
    query.$or.push({ email: normalizeString(email).toLowerCase() });
  }

  if (query.$or.length === 0) {
    return null;
  }

  return await User.findOne(query);
};

/**
 * Create or update dealers from Tally ERP
 * Accepts single dealer object or array of dealers for batch processing
 */
export const upsertDealerFromTally = async (req, res) => {
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
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;
      const { company, guid, error, message } = await findCompanyByGuid(guidSource);

      if (!company) {
        results.push({
          LedgerGUID: item.LedgerGUID || item.ledgerGUID || item.ledger_guid,
          success: false,
          message: message || `Company not found for GUID: ${guidSource}. Please ensure the company is registered.`,
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const ledgerGuid = normalizeGuid(item.LedgerGUID || item.ledgerGUID || item.ledger_guid);
      if (!ledgerGuid) {
        results.push({
          guid,
          success: false,
          message: 'LedgerGUID is required for dealer creation',
          error: 'MISSING_LEDGER_GUID',
        });
        continue;
      }

      const ledgerName = normalizeString(item.LedgerName || item.ledgerName || item.name);
      if (!ledgerName) {
        results.push({
          LedgerGUID: ledgerGuid,
          success: false,
          message: 'LedgerName is required',
          error: 'MISSING_LEDGER_NAME',
        });
        continue;
      }

      // Check if dealer already exists
      const existingDealer = await Ledger.findOne({
        LedgerGUID: ledgerGuid,
        cmpcode: company.companyCode,
      });

      // Only check limit if creating a new dealer (not updating existing)
      if (!existingDealer) {
        const { checkCompanyMemberLimit } = await import('./adminController.js');
        const limitCheck = await checkCompanyMemberLimit(company._id, 1);
        if (!limitCheck.allowed) {
          results.push({
            LedgerGUID: ledgerGuid,
            success: false,
            message: limitCheck.message,
            error: 'MEMBER_LIMIT_EXCEEDED',
          });
          continue;
        }
      }

      // Prepare dealer data
      const dealerData = {
        LedgerGUID: ledgerGuid,
        LedgerName: ledgerName,
        LedgerParent: normalizeString(item.LedgerParent || item.ledgerParent) || null,
        LedgerMobile: normalizeString(item.LedgerMobile || item.mobile || item.phone),
        LedgerContact: normalizeString(item.LedgerContact || item.contact),
        Email: normalizeString(item.Email || item.email),
        LedgerGSTIN: normalizeString(item.LedgerGSTIN || item.gstin || item.GSTIN)?.toUpperCase() || '',
        LedgerAddress1: normalizeString(item.LedgerAddress1 || item.address1 || item.address?.street),
        LedgerAddress2: normalizeString(item.LedgerAddress2 || item.address2),
        LedgerState: normalizeString(item.LedgerState || item.state || item.address?.state),
        LedgerOpening: toNumber(item.LedgerOpening || item.openingBalance, 0),
        LedgerOpeningDate: normalizeDate(item.LedgerOpeningDate || item.openingDate),
        LedgerJoinDate: normalizeDate(item.LedgerJoinDate || item.joinDate),
        Remarks: normalizeString(item.Remarks || item.remarks),
        Other1: normalizeString(item.Other1 || item.other1),
        Other2: normalizeString(item.Other2 || item.other2),
        Other3: normalizeString(item.Other3 || item.other3),
        Other4: normalizeString(item.Other4 || item.other4),
        Other5: normalizeString(item.Other5 || item.other5),
        other6: normalizeString(item.other6),
        other7: normalizeString(item.other7),
        other8: normalizeString(item.other8),
        Cmpguid: company.guid,
        cmpcode: company.companyCode,
        cmpCode: company.companyCode,
        companyId: company._id,
        isActive: item.isActive !== undefined ? (item.isActive === true || item.isActive === 'true' || item.isActive === 1) : true,
      };

      // Handle hierarchy users (SalesMan, ASM, RSM, ZSM)
      if (item.SalesMan || item.salesMan || item.salesman) {
        const salesman = await findUserByMobileOrEmail(
          item.SalesMan?.mobile || item.salesMan?.mobile || item.salesman?.mobile,
          item.SalesMan?.email || item.salesMan?.email || item.salesman?.email,
          company._id
        );
        if (salesman) {
          dealerData.SalesMan = salesman._id;
        }
      }

      if (item.ASM || item.asm) {
        const asm = await findUserByMobileOrEmail(
          item.ASM?.mobile || item.asm?.mobile,
          item.ASM?.email || item.asm?.email,
          company._id
        );
        if (asm) {
          dealerData.ASM = asm._id;
        }
      }

      if (item.RSM || item.rsm) {
        const rsm = await findUserByMobileOrEmail(
          item.RSM?.mobile || item.rsm?.mobile,
          item.RSM?.email || item.rsm?.email,
          company._id
        );
        if (rsm) {
          dealerData.RSM = rsm._id;
        }
      }

      if (item.ZSM || item.zsm) {
        const zsm = await findUserByMobileOrEmail(
          item.ZSM?.mobile || item.zsm?.mobile,
          item.ZSM?.email || item.zsm?.email,
          company._id
        );
        if (zsm) {
          dealerData.ZSM = zsm._id;
        }
      }

      // Handle group assignment
      if (item.groupGUID || item.groupGuid || item.GroupGUID) {
        const { group } = await findGroupByGuid(
          item.groupGUID || item.groupGuid || item.GroupGUID,
          company.companyCode
        );
        if (group) {
          dealerData.groupId = group._id;
        }
      }

      // Set createdBy to first admin user of the company if not provided
      if (!dealerData.createdBy) {
        const adminUser = await User.findOne({
          'companies.companyId': company._id,
          role: { $in: ['admin', 'superadmin'] },
          isActive: true,
        });
        if (adminUser) {
          dealerData.createdBy = adminUser._id;
        }
      }

      let dealer;
      if (existingDealer) {
        // Update existing dealer
        Object.assign(existingDealer, dealerData);
        existingDealer.updatedBy = dealerData.createdBy;
        await existingDealer.save();
        dealer = existingDealer;
      } else {
        // Create new dealer
        dealer = await Ledger.create(dealerData);
      }

      // Populate references for response
      await dealer.populate([
        { path: 'SalesMan', select: 'name email mobile role' },
        { path: 'ASM', select: 'name email mobile role' },
        { path: 'RSM', select: 'name email mobile role' },
        { path: 'ZSM', select: 'name email mobile role' },
        { path: 'groupId', select: 'GroupGUID GroupName GroupParent' },
      ]);

      results.push({
        success: true,
        LedgerGUID: ledgerGuid,
        dealer: dealer.toObject(),
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
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in upsertDealerFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing dealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create or update subdealers from Tally ERP
 * Accepts single subdealer object or array of subdealers for batch processing
 */
export const upsertSubDealerFromTally = async (req, res) => {
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
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;
      const { company, guid, error, message } = await findCompanyByGuid(guidSource);

    if (!company) {
        results.push({
          SDName: item.SDName || item.sdName || item.name,
          success: false,
          message: message || `Company not found for GUID: ${guidSource}. Please ensure the company is registered.`,
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const sdName = normalizeString(item.SDName || item.sdName || item.name);
      if (!sdName) {
        results.push({
          guid,
          success: false,
          message: 'SDName is required for subdealer creation',
          error: 'MISSING_SD_NAME',
        });
        continue;
      }

      const sdType = normalizeString(item.SDType || item.sdType || item.type);
      if (!sdType || !['Sub Dealer', 'TSO'].includes(sdType)) {
        results.push({
          SDName: sdName,
          success: false,
          message: 'SDType is required and must be "Sub Dealer" or "TSO"',
          error: 'INVALID_SD_TYPE',
        });
        continue;
      }

      // Check if subdealer already exists (by name and company)
      const existingSubDealer = await SubDealer.findOne({
        SDName: sdName,
        companyId: company._id,
      });

      // Only check limit if creating a new subdealer (not updating existing)
      if (!existingSubDealer) {
        const { checkCompanyMemberLimit } = await import('./adminController.js');
        const limitCheck = await checkCompanyMemberLimit(company._id, 1);
        if (!limitCheck.allowed) {
          results.push({
            SDName: sdName,
            success: false,
            message: limitCheck.message,
            error: 'MEMBER_LIMIT_EXCEEDED',
          });
          continue;
        }
      }

      // Prepare subdealer data
      const subDealerData = {
        SDName: sdName,
        SDType: sdType,
        SDAddress1: normalizeString(item.SDAddress1 || item.address1 || item.address?.street),
        SDAddress2: normalizeString(item.SDAddress2 || item.address2),
        SDAddress3: normalizeString(item.SDAddress3 || item.address3),
        SDState: normalizeString(item.SDState || item.state || item.address?.state),
        SDCountry: normalizeString(item.SDCountry || item.country || item.address?.country, 'India'),
        SDPincode: normalizeString(item.SDPincode || item.pincode || item.address?.pincode),
        SDContactPerson: normalizeString(item.SDContactPerson || item.contactPerson),
        SDMobileNo: normalizeString(item.SDMobileNo || item.mobile || item.phone),
        SDEmail: normalizeString(item.SDEmail || item.email),
        SDGSTNType: normalizeString(item.SDGSTNType || item.gstnType),
        SDGSTNNumber: normalizeString(item.SDGSTNNumber || item.gstnNumber || item.GSTN)?.toUpperCase() || '',
        cmpcode: company.companyCode,
        Cmpguid: company.guid,
        companyId: company._id,
        isActive: item.isActive !== undefined ? (item.isActive === true || item.isActive === 'true' || item.isActive === 1) : true,
      };

      // Handle group assignment
      if (item.groupGUID || item.groupGuid || item.GroupGUID) {
        const { group } = await findGroupByGuid(
          item.groupGUID || item.groupGuid || item.GroupGUID,
          company.companyCode
        );
        if (group) {
          subDealerData.groupId = group._id;
        }
      }

      // Set createdBy to first admin user of the company if not provided
      if (!subDealerData.createdBy) {
        const adminUser = await User.findOne({
          'companies.companyId': company._id,
          role: { $in: ['admin', 'superadmin'] },
          isActive: true,
        });
        if (adminUser) {
          subDealerData.createdBy = adminUser._id;
        }
      }

      let subDealer;
      if (existingSubDealer) {
        // Update existing subdealer
        Object.assign(existingSubDealer, subDealerData);
        existingSubDealer.updatedBy = subDealerData.createdBy;
        await existingSubDealer.save();
        subDealer = existingSubDealer;
      } else {
        // Create new subdealer
        subDealer = await SubDealer.create(subDealerData);
      }

      // Populate references for response
      await subDealer.populate('groupId', 'GroupGUID GroupName GroupParent');

      results.push({
        success: true,
        SDName: sdName,
        subdealer: subDealer.toObject(),
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
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in upsertSubDealerFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while processing subdealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * List dealers by company GUID
 */
export const listDealersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const { company, guid, error, message } = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: message || `Company not found for GUID: ${rawGuid}`,
        error: error || 'COMPANY_NOT_FOUND',
        guid: rawGuid,
      });
    }

    const dealers = await Ledger.find({
      companyId: company._id,
      isActive: true,
    })
      .populate('SalesMan', 'name email mobile role')
      .populate('ASM', 'name email mobile role')
      .populate('RSM', 'name email mobile role')
      .populate('ZSM', 'name email mobile role')
      .populate('groupId', 'GroupGUID GroupName GroupParent')
      .sort({ LedgerName: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.companyName,
          guid: company.guid,
          code: company.companyCode,
        },
        totalDealers: dealers.length,
        dealers: dealers.map(dealer => ({
          _id: dealer._id,
          LedgerGUID: dealer.LedgerGUID,
          LedgerName: dealer.LedgerName,
          LedgerMobile: dealer.LedgerMobile,
          LedgerContact: dealer.LedgerContact,
          Email: dealer.Email,
          LedgerGSTIN: dealer.LedgerGSTIN,
          LedgerAddress1: dealer.LedgerAddress1,
          LedgerAddress2: dealer.LedgerAddress2,
          LedgerState: dealer.LedgerState,
          LedgerOpening: dealer.LedgerOpening,
          LedgerOpeningDate: dealer.LedgerOpeningDate,
          LedgerJoinDate: dealer.LedgerJoinDate,
          SalesMan: dealer.SalesMan,
          ASM: dealer.ASM,
          RSM: dealer.RSM,
          ZSM: dealer.ZSM,
          group: dealer.groupId,
          Remarks: dealer.Remarks,
          isActive: dealer.isActive,
          createdAt: dealer.createdAt,
          updatedAt: dealer.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching dealers for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dealers for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * List subdealers by company GUID
 */
export const listSubDealersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const { company, guid, error, message } = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: message || `Company not found for GUID: ${rawGuid}`,
        error: error || 'COMPANY_NOT_FOUND',
        guid: rawGuid,
      });
    }

    const subdealers = await SubDealer.find({
      companyId: company._id,
      isActive: true,
    })
      .populate('groupId', 'GroupGUID GroupName GroupParent')
      .sort({ SDName: 1 })
      .lean();

    return res.json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.companyName,
          guid: company.guid,
          code: company.companyCode,
        },
        totalSubDealers: subdealers.length,
        subdealers: subdealers.map(subdealer => ({
          _id: subdealer._id,
          SDName: subdealer.SDName,
          SDType: subdealer.SDType,
          SDAddress1: subdealer.SDAddress1,
          SDAddress2: subdealer.SDAddress2,
          SDAddress3: subdealer.SDAddress3,
          SDState: subdealer.SDState,
          SDCountry: subdealer.SDCountry,
          SDPincode: subdealer.SDPincode,
          SDContactPerson: subdealer.SDContactPerson,
          SDMobileNo: subdealer.SDMobileNo,
          SDEmail: subdealer.SDEmail,
          SDGSTNType: subdealer.SDGSTNType,
          SDGSTNNumber: subdealer.SDGSTNNumber,
          group: subdealer.groupId,
          isActive: subdealer.isActive,
          createdAt: subdealer.createdAt,
          updatedAt: subdealer.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching subdealers for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subdealers for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update dealer from Tally
 */
export const updateDealerFromTally = async (req, res) => {
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
      const ledgerGuid = normalizeGuid(item.LedgerGUID || item.ledgerGUID || item.ledger_guid);
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;
      
      if (!ledgerGuid) {
        results.push({
          success: false,
          message: 'LedgerGUID is required for update',
          error: 'MISSING_LEDGER_GUID',
        });
        continue;
      }

      const { company, guid, error, message } = await findCompanyByGuid(guidSource);
      if (!company) {
        results.push({
          LedgerGUID: ledgerGuid,
          success: false,
          message: message || 'Company not found for provided GUID.',
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const dealer = await Ledger.findOne({
        LedgerGUID: ledgerGuid,
        cmpcode: company.companyCode,
      });

      if (!dealer) {
        results.push({
          LedgerGUID: ledgerGuid,
          success: false,
          message: 'Dealer not found for provided LedgerGUID.',
          error: 'DEALER_NOT_FOUND',
        });
        continue;
      }

      // Update fields
      if (!isBlank(item.LedgerName || item.ledgerName || item.name)) {
        dealer.LedgerName = normalizeString(item.LedgerName || item.ledgerName || item.name);
      }
      if (item.LedgerMobile !== undefined) dealer.LedgerMobile = normalizeString(item.LedgerMobile || item.mobile);
      if (item.Email !== undefined) dealer.Email = normalizeString(item.Email || item.email);
      if (item.LedgerGSTIN !== undefined) dealer.LedgerGSTIN = normalizeString(item.LedgerGSTIN || item.gstin)?.toUpperCase() || '';
      if (item.LedgerState !== undefined) dealer.LedgerState = normalizeString(item.LedgerState || item.state);
      if (item.isActive !== undefined) {
        dealer.isActive = item.isActive === true || item.isActive === 'true' || item.isActive === 1;
      }

      // Handle group assignment
      if (item.groupGUID || item.groupGuid || item.GroupGUID) {
        const { group } = await findGroupByGuid(
          item.groupGUID || item.groupGuid || item.GroupGUID,
          company.companyCode
        );
        dealer.groupId = group ? group._id : null;
      }

      await dealer.save();

      results.push({
        success: true,
        LedgerGUID: ledgerGuid,
        message: 'Dealer updated successfully',
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 404 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in updateDealerFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating dealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete dealers from Tally
 */
export const deleteDealerFromTally = async (req, res) => {
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
      const ledgerGuid = normalizeGuid(item.LedgerGUID || item.ledgerGUID || item.ledger_guid);
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;

      if (!ledgerGuid) {
        results.push({
          success: false,
          message: 'LedgerGUID is required for deletion',
          error: 'MISSING_LEDGER_GUID',
        });
        continue;
      }

      const { company } = await findCompanyByGuid(guidSource);
      if (!company) {
        results.push({
          LedgerGUID: ledgerGuid,
          success: false,
          message: 'Company not found for provided GUID.',
          error: 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const dealer = await Ledger.findOne({
        LedgerGUID: ledgerGuid,
        cmpcode: company.companyCode,
      });

      if (!dealer) {
        results.push({
          LedgerGUID: ledgerGuid,
          success: false,
          message: 'Dealer not found for provided LedgerGUID.',
          error: 'DEALER_NOT_FOUND',
        });
        continue;
      }

      await Ledger.findByIdAndDelete(dealer._id);

      results.push({
        success: true,
        LedgerGUID: ledgerGuid,
        message: 'Dealer deleted successfully',
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 404 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in deleteDealerFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting dealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update subdealer from Tally
 */
export const updateSubDealerFromTally = async (req, res) => {
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
      const sdName = normalizeString(item.SDName || item.sdName || item.name);
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;
      
      if (!sdName) {
        results.push({
          success: false,
          message: 'SDName is required for update',
          error: 'MISSING_SD_NAME',
        });
        continue;
      }

      const { company, guid, error, message } = await findCompanyByGuid(guidSource);
      if (!company) {
        results.push({
          SDName: sdName,
          success: false,
          message: message || 'Company not found for provided GUID.',
          error: error || 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const subdealer = await SubDealer.findOne({
        SDName: sdName,
        companyId: company._id,
      });

      if (!subdealer) {
        results.push({
          SDName: sdName,
          success: false,
          message: 'Subdealer not found for provided SDName.',
          error: 'SUBDEALER_NOT_FOUND',
        });
        continue;
      }

      // Update fields
      if (!isBlank(item.SDType || item.sdType || item.type)) {
        const sdType = normalizeString(item.SDType || item.sdType || item.type);
        if (['Sub Dealer', 'TSO'].includes(sdType)) {
          subdealer.SDType = sdType;
        }
      }
      if (item.SDMobileNo !== undefined) subdealer.SDMobileNo = normalizeString(item.SDMobileNo || item.mobile);
      if (item.SDEmail !== undefined) subdealer.SDEmail = normalizeString(item.SDEmail || item.email);
      if (item.SDState !== undefined) subdealer.SDState = normalizeString(item.SDState || item.state);
      if (item.SDGSTNNumber !== undefined) subdealer.SDGSTNNumber = normalizeString(item.SDGSTNNumber || item.gstnNumber)?.toUpperCase() || '';
      if (item.isActive !== undefined) {
        subdealer.isActive = item.isActive === true || item.isActive === 'true' || item.isActive === 1;
      }

      // Handle group assignment
      if (item.groupGUID || item.groupGuid || item.GroupGUID) {
        const { group } = await findGroupByGuid(
          item.groupGUID || item.groupGuid || item.GroupGUID,
          company.companyCode
        );
        subdealer.groupId = group ? group._id : null;
      }

      await subdealer.save();

      results.push({
        success: true,
        SDName: sdName,
        message: 'Subdealer updated successfully',
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 404 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in updateSubDealerFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while updating subdealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete subdealers from Tally
 */
export const deleteSubDealerFromTally = async (req, res) => {
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
      const sdName = normalizeString(item.SDName || item.sdName || item.name);
      const guidSource = item.companyGuid || item.guid || item.companyGUID || item.Cmpguid;

      if (!sdName) {
        results.push({
          success: false,
          message: 'SDName is required for deletion',
          error: 'MISSING_SD_NAME',
        });
        continue;
      }

      const { company } = await findCompanyByGuid(guidSource);
      if (!company) {
        results.push({
          SDName: sdName,
          success: false,
          message: 'Company not found for provided GUID.',
          error: 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      const subdealer = await SubDealer.findOne({
        SDName: sdName,
        companyId: company._id,
      });

      if (!subdealer) {
        results.push({
          SDName: sdName,
          success: false,
          message: 'Subdealer not found for provided SDName.',
          error: 'SUBDEALER_NOT_FOUND',
        });
        continue;
      }

      await SubDealer.findByIdAndDelete(subdealer._id);

      results.push({
        success: true,
        SDName: sdName,
        message: 'Subdealer deleted successfully',
      });
    }

    const failures = results.filter((item) => !item.success);
    const status = failures.length === results.length ? 404 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: failures.length === 0,
      results,
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    console.error('Error in deleteSubDealerFromTally:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while deleting subdealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
