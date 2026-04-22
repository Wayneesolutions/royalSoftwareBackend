import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
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

      // Simple check: if dealer exists with this LedgerGUID for this company, return error
      console.log('Checking for existing dealer:', {
        LedgerGUID: ledgerGuid,
        companyId: company._id,
        cmpcode: company.companyCode,
        companyGuid: company.guid
      });

      const existingDealer = await Ledger.findOne({
        LedgerGUID: ledgerGuid,
        $or: [
          { companyId: company._id },
          { cmpcode: company.companyCode }
        ]
      });

      console.log('Existing dealer found:', existingDealer ? {
        _id: existingDealer._id,
        LedgerGUID: existingDealer.LedgerGUID,
        LedgerName: existingDealer.LedgerName,
        companyId: existingDealer.companyId,
        cmpcode: existingDealer.cmpcode,
        isActive: existingDealer.isActive
      } : null);

      // Also check all dealers with this LedgerGUID (for debugging)
      const allDealersWithGuid = await Ledger.find({ LedgerGUID: ledgerGuid });
      console.log(`Total dealers found with LedgerGUID "${ledgerGuid}":`, allDealersWithGuid.length);
      if (allDealersWithGuid.length > 0) {
        console.log('All dealers with this GUID:', allDealersWithGuid.map(d => ({
          _id: d._id,
          LedgerGUID: d.LedgerGUID,
          companyId: d.companyId,
          cmpcode: d.cmpcode,
          isActive: d.isActive
        })));
      }

      if (existingDealer) {
        // Update existing dealer
        try {
          // Update fields - only update provided fields
          if (!isBlank(item.LedgerName || item.ledgerName || item.name)) {
            existingDealer.LedgerName = normalizeString(item.LedgerName || item.ledgerName || item.name);
          }
          if (item.LedgerMobile !== undefined) {
            existingDealer.LedgerMobile = normalizeString(item.LedgerMobile);
          }
          if (item.Email !== undefined) {
            existingDealer.Email = normalizeString(item.Email);
          }
          if (item.password !== undefined && item.password) {
            existingDealer.password = await bcrypt.hash(normalizeString(item.password), 10);
          }
          if (item.LedgerGSTIN !== undefined) {
            existingDealer.LedgerGSTIN = normalizeString(item.LedgerGSTIN)?.toUpperCase() || '';
          }
          if (item.LedgerAddress1 !== undefined) {
            existingDealer.LedgerAddress1 = normalizeString(item.LedgerAddress1);
          }
          if (item.LedgerAddress2 !== undefined) {
            existingDealer.LedgerAddress2 = normalizeString(item.LedgerAddress2);
          }
          if (item.LedgerState !== undefined) {
            existingDealer.LedgerState = normalizeString(item.LedgerState);
          }
          if (item.LedgerOpening !== undefined) {
            existingDealer.LedgerOpening = toNumber(item.LedgerOpening, 0);
          }
          if (item.LedgerOpeningDate !== undefined) {
            existingDealer.LedgerOpeningDate = normalizeDate(item.LedgerOpeningDate);
          }
          if (item.LedgerJoinDate !== undefined) {
            existingDealer.LedgerJoinDate = normalizeDate(item.LedgerJoinDate);
          }
          if (item.Remarks !== undefined) {
            existingDealer.Remarks = normalizeString(item.Remarks);
          }
          if (item.Other1 !== undefined) {
            existingDealer.Other1 = normalizeString(item.Other1);
          }
          if (item.Other2 !== undefined) {
            existingDealer.Other2 = normalizeString(item.Other2);
          }
          if (item.Other3 !== undefined) {
            existingDealer.Other3 = normalizeString(item.Other3);
          }
          if (item.Other4 !== undefined) {
            existingDealer.Other4 = normalizeString(item.Other4);
          }
          if (item.Other5 !== undefined) {
            existingDealer.Other5 = normalizeString(item.Other5);
          }
          if (item.other6 !== undefined) {
            existingDealer.other6 = normalizeString(item.other6);
          }
          if (item.other7 !== undefined) {
            existingDealer.other7 = normalizeString(item.other7);
          }
          if (item.other8 !== undefined) {
            existingDealer.other8 = normalizeString(item.other8);
          }
          if (item.isActive !== undefined) {
            existingDealer.isActive = item.isActive === true || item.isActive === 'true' || item.isActive === 1;
          }

          // Handle group assignment
          if (item.groupGUID || item.groupGuid || item.GroupGUID) {
            try {
              const { group, error: groupError, message: groupMessage } = await findGroupByGuid(
                item.groupGUID || item.groupGuid || item.GroupGUID,
                company.companyCode
              );
              if (group) {
                existingDealer.groupId = group._id;
              }
            } catch (groupError) {
              // Log but don't fail - group assignment is optional
              console.warn(`Failed to find group for update: ${groupError.message}`);
            }
          }

          await existingDealer.save();

          // Add update message to results
          results.push({
            LedgerGUID: ledgerGuid,
            message: 'Dealer already exists, updated',
          });
        } catch (updateError) {
          results.push({
            LedgerGUID: ledgerGuid,
            success: false,
            message: `Failed to update dealer: ${updateError.message}`,
            error: 'UPDATE_FAILED',
          });
        }
        continue;
      }

      // Prepare dealer data - simplified fields only
      const dealerData = {
        LedgerGUID: ledgerGuid,
        LedgerName: ledgerName,
        LedgerMobile: item.LedgerMobile !== undefined ? normalizeString(item.LedgerMobile) : undefined,
        Email: item.Email !== undefined ? normalizeString(item.Email) : undefined,
        password: item.password !== undefined ? normalizeString(item.password) : undefined,
        LedgerGSTIN: item.LedgerGSTIN !== undefined ? normalizeString(item.LedgerGSTIN)?.toUpperCase() || '' : undefined,
        LedgerAddress1: item.LedgerAddress1 !== undefined ? normalizeString(item.LedgerAddress1) : undefined,
        LedgerAddress2: item.LedgerAddress2 !== undefined ? normalizeString(item.LedgerAddress2) : undefined,
        LedgerState: item.LedgerState !== undefined ? normalizeString(item.LedgerState) : undefined,
        LedgerOpening: item.LedgerOpening !== undefined ? toNumber(item.LedgerOpening, 0) : undefined,
        LedgerOpeningDate: item.LedgerOpeningDate !== undefined ? normalizeDate(item.LedgerOpeningDate) : undefined,
        LedgerJoinDate: item.LedgerJoinDate !== undefined ? normalizeDate(item.LedgerJoinDate) : undefined,
        Remarks: item.Remarks !== undefined ? normalizeString(item.Remarks) : undefined,
        Other1: item.Other1 !== undefined ? normalizeString(item.Other1) : undefined,
        Other2: item.Other2 !== undefined ? normalizeString(item.Other2) : undefined,
        Other3: item.Other3 !== undefined ? normalizeString(item.Other3) : undefined,
        Other4: item.Other4 !== undefined ? normalizeString(item.Other4) : undefined,
        Other5: item.Other5 !== undefined ? normalizeString(item.Other5) : undefined,
        other6: item.other6 !== undefined ? normalizeString(item.other6) : undefined,
        other7: item.other7 !== undefined ? normalizeString(item.other7) : undefined,
        other8: item.other8 !== undefined ? normalizeString(item.other8) : undefined,
        // Auto-assign company details from companyGuid
        Cmpguid: company.guid,
        cmpcode: company.companyCode,
        cmpCode: company.companyCode,
        companyId: company._id,
        isActive: item.isActive !== undefined ? (item.isActive === true || item.isActive === 'true' || item.isActive === 1) : true,
      };

      // Remove undefined fields
      Object.keys(dealerData).forEach(key => {
        if (dealerData[key] === undefined) {
          delete dealerData[key];
        }
      });

      // Hash password if provided
      if (dealerData.password) {
        dealerData.password = await bcrypt.hash(dealerData.password, 10);
      }

      // Handle group assignment - if groupGUID provided, group must exist
      if (item.groupGUID || item.groupGuid || item.GroupGUID) {
        try {
          const { group, error: groupError, message: groupMessage } = await findGroupByGuid(
            item.groupGUID || item.groupGuid || item.GroupGUID,
            company.companyCode
          );
          if (!group) {
            results.push({
              LedgerGUID: ledgerGuid,
              success: false,
              message: groupMessage || `Group not found for GUID: ${item.groupGUID || item.groupGuid || item.GroupGUID}`,
              error: groupError || 'GROUP_NOT_FOUND',
            });
            continue;
          }
          dealerData.groupId = group._id;
        } catch (groupError) {
          results.push({
            LedgerGUID: ledgerGuid,
            success: false,
            message: `Failed to find group: ${groupError.message}`,
            error: 'GROUP_LOOKUP_FAILED',
          });
          continue;
        }
      }

      // Handle createdBy if provided in payload (optional)
      // If provided, try to resolve it from user ID, email, or mobile
      if (item.createdBy || item.createdByEmail || item.createdByMobile) {
        try {
          let creatorUser = null;

          if (item.createdBy) {
            // Try as ObjectId first
            if (mongoose.Types.ObjectId.isValid(item.createdBy)) {
              creatorUser = await User.findById(item.createdBy);
            }
          }
          if (!creatorUser && item.createdByEmail) {
            creatorUser = await User.findOne({ 
              email: normalizeString(item.createdByEmail).toLowerCase(),
              isActive: true 
            });
          }
          if (!creatorUser && item.createdByMobile) {
            creatorUser = await User.findOne({ 
              mobile: normalizeString(item.createdByMobile),
              isActive: true 
            });
          }

          if (creatorUser) {
            dealerData.createdBy = creatorUser._id;
          }
          // If not found, silently skip - createdBy is optional
        } catch (userError) {
          // Log but don't fail - createdBy is optional
          console.warn(`Failed to resolve createdBy user: ${userError.message}`);
        }
      }

      // Create new dealer (only if not exists)
      console.log('Attempting to create dealer with data:', {
        LedgerGUID: dealerData.LedgerGUID,
        LedgerName: dealerData.LedgerName,
        companyId: dealerData.companyId,
        cmpcode: dealerData.cmpcode,
        groupId: dealerData.groupId
      });

      let dealer;
      try {
        dealer = await Ledger.create(dealerData);
        console.log('Dealer created successfully:', {
          _id: dealer._id,
          LedgerGUID: dealer.LedgerGUID,
          companyId: dealer.companyId,
          cmpcode: dealer.cmpcode
        });

        // Populate references for logging (not needed for response since we don't return success)
        try {
          await dealer.populate([
            { path: 'SalesMan', select: 'name email mobile role' },
            { path: 'ASM', select: 'name email mobile role' },
            { path: 'RSM', select: 'name email mobile role' },
            { path: 'ZSM', select: 'name email mobile role' },
            { path: 'groupId', select: 'GroupGUID GroupName GroupParent' },
          ]);
        } catch (populateError) {
          // Log but don't fail - population is for logging only
          console.warn('Failed to populate dealer references:', populateError.message);
        }

        // Silent success - don't add to results for newly created dealers
      } catch (dbError) {
        // Handle database validation errors
        let errorMessage = 'Failed to create dealer';
        let errorCode = 'DATABASE_ERROR';
        let handledSuccessfully = false;

        if (dbError.name === 'ValidationError') {
          errorMessage = `Validation error: ${Object.values(dbError.errors).map(e => e.message).join(', ')}`;
          errorCode = 'VALIDATION_ERROR';
        } else if (dbError.code === 11000 || (dbError.name === 'MongoServerError' && dbError.code === 11000)) {
          // Duplicate entry - check which index caused the error
          console.error('Duplicate key error caught:', {
            LedgerGUID: ledgerGuid,
            cmpcode: company.companyCode,
            companyId: company._id,
            error: dbError.message,
            keyPattern: dbError.keyPattern,
            keyValue: dbError.keyValue
          });

          // Check if it's the old ledgerId index issue
          if (dbError.keyPattern && dbError.keyPattern.ledgerId !== undefined) {
            // This is the old ledgerId index issue - try to drop it automatically
            console.warn('Attempting to drop old ledgerId_1 index...');
            try {
              const collection = Ledger.collection;
              await collection.dropIndex('ledgerId_1');
              console.log('✅ Successfully dropped old ledgerId_1 index');
              
              // Retry creating the dealer after dropping the index
              try {
                dealer = await Ledger.create(dealerData);
                console.log('Dealer created successfully after dropping index:', {
                  _id: dealer._id,
                  LedgerGUID: dealer.LedgerGUID
                });

                // Populate for logging (not needed for response since we don't return success)
                try {
                  await dealer.populate([
                    { path: 'SalesMan', select: 'name email mobile role' },
                    { path: 'ASM', select: 'name email mobile role' },
                    { path: 'RSM', select: 'name email mobile role' },
                    { path: 'ZSM', select: 'name email mobile role' },
                    { path: 'groupId', select: 'GroupGUID GroupName GroupParent' },
                  ]);
                } catch (populateError) {
                  console.warn('Failed to populate dealer references:', populateError.message);
                }

                // Silent success - don't add to results for newly created dealers
                handledSuccessfully = true; // Mark as handled - don't push error
              } catch (retryError) {
                errorMessage = `Failed to create dealer after dropping index: ${retryError.message}`;
                errorCode = 'CREATE_FAILED_AFTER_INDEX_DROP';
              }
            } catch (dropError) {
              // If we can't drop the index, provide helpful error message
              errorMessage = `Database index error: Old 'ledgerId' index exists in database but field is not in schema. Failed to drop index automatically: ${dropError.message}. Please run the script manually: node backend/scripts/drop-old-ledger-index.js`;
              errorCode = 'INDEX_ERROR';
            }
          } else {
            // Real duplicate on LedgerGUID + cmpcode
            const duplicateCheck = await Ledger.findOne({
              LedgerGUID: ledgerGuid,
              cmpcode: company.companyCode
            });
            console.log('Duplicate dealer found after error:', duplicateCheck ? {
              _id: duplicateCheck._id,
              LedgerGUID: duplicateCheck.LedgerGUID,
              cmpcode: duplicateCheck.cmpcode,
              companyId: duplicateCheck.companyId,
              isActive: duplicateCheck.isActive
            } : 'NOT FOUND');

            errorMessage = `Dealer with LedgerGUID "${ledgerGuid}" already exists for this company`;
            errorCode = 'DUPLICATE_ENTRY';
          }
        } else if (dbError.message) {
          errorMessage = dbError.message;
        }

        // Only push error if we didn't successfully handle it
        if (!handledSuccessfully) {
          results.push({
            LedgerGUID: ledgerGuid,
            success: false,
            message: errorMessage,
            error: errorCode,
          });
        }
      }
    }

    // Filter results to only include errors and update messages
    // Errors have success: false, update messages have message field without success
    const failures = results.filter((item) => item.success === false);
    const hasErrors = failures.length > 0;
    const status = failures.length === results.length ? 400 : hasErrors ? 207 : 200;

    return res.status(status).json({
      success: !hasErrors,
      results, // Only contains errors and update messages, no success entries for new creations
    });
  } catch (error) {
    if (error.message === 'INVALID_TALLY_PAYLOAD' || error.message === 'INVALID_XML_PAYLOAD') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload format. Expected JSON or XML.',
        error: error.message,
      });
    }

    // Enhanced error logging
    console.error('Error in upsertDealerFromTally:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
    });

    // Provide more helpful error information even in production
    const errorResponse = {
      success: false,
      message: 'Server error while processing dealers',
      error: error.name || 'UNKNOWN_ERROR',
    };

    // Include error details in production for better debugging
    if (error.name === 'ValidationError') {
      errorResponse.message = 'Validation error occurred while processing dealers';
      errorResponse.details = Object.values(error.errors || {}).map(e => e.message);
    } else if (error.code === 11000) {
      errorResponse.message = 'Duplicate entry detected';
    } else if (error.message) {
      // Include error message in production for critical errors
      errorResponse.message = `Server error: ${error.message}`;
    }

    return res.status(500).json(errorResponse);
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

      // Handle ledger GUID connection (optional but recommended)
      // If ledgerGUID is provided, validate it exists and connect subdealer to dealer
      let ledger = null;
      let ledgerId = null;
      const ledgerGuidSource = item.ledgerGUID || item.LedgerGUID || item.ledgerGuid || item.ledger_guid;
      const ledgerGuid = normalizeGuid(ledgerGuidSource);
      
      if (ledgerGuid) {
        // Validate ledger exists in the same company
        ledger = await Ledger.findOne({
          LedgerGUID: ledgerGuid,
          cmpcode: company.companyCode,
          companyId: company._id,
          isActive: true
        });

        if (!ledger) {
          results.push({
            SDName: sdName,
            ledgerGUID: ledgerGuid,
            success: false,
            message: `Ledger not found for LedgerGUID: ${ledgerGuid} with cmpcode: ${company.companyCode}. Please ensure the ledger exists in the same company before creating this subdealer.`,
            error: 'LEDGER_NOT_FOUND',
          });
          continue;
        }
        ledgerId = ledger._id;
      }

      // Check if subdealer already exists (by name and company)
      const existingSubDealer = await SubDealer.findOne({
        SDName: sdName,
        companyId: company._id,
      });

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
      // Priority: 1) Explicitly provided groupGUID, 2) Ledger's groupId, 3) None
      if (item.groupGUID || item.groupGuid || item.GroupGUID) {
        const { group } = await findGroupByGuid(
          item.groupGUID || item.groupGuid || item.GroupGUID,
          company.companyCode
        );
        if (group) {
          subDealerData.groupId = group._id;
        }
      } else if (ledger && ledger.groupId) {
        // If no groupGUID provided but ledger has a group, use ledger's group
        subDealerData.groupId = ledger.groupId;
      }

      // Set createdBy: Priority: 1) Ledger ID (if ledgerGUID provided), 2) First admin user of the company
      if (ledgerId) {
        // Connect subdealer to the dealer/ledger
        subDealerData.createdBy = ledgerId;
      } else if (!subDealerData.createdBy) {
        // Fallback to first admin user if no ledger connection
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
      
      // Handle createdBy population - it could be a User or Ledger
      // If it's a Ledger (ledgerId exists), populate from Ledger model
      // Otherwise, try to populate from User model
      if (ledgerId) {
        // createdBy is a Ledger ID, populate from Ledger model
        await subDealer.populate({
          path: 'createdBy',
          model: 'Ledger',
          select: 'LedgerGUID LedgerName LedgerMobile Email LedgerContact'
        });
      } else {
        // createdBy is a User ID, populate from User model
        await subDealer.populate({
          path: 'createdBy',
          model: 'User',
          select: 'name email mobile role'
        });
      }

      // Provide helpful message for ledger connection
      let successMessage = 'Subdealer created successfully';
      if (ledgerId) {
        successMessage = `Subdealer created successfully and connected to dealer: ${ledger.LedgerName} (${ledgerGuid})`;
      }

      results.push({
        success: true,
        SDName: sdName,
        subdealer: subDealer.toObject(),
        message: successMessage,
        connectedToDealer: !!ledgerId,
        ledgerGUID: ledgerGuid || null
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

      // Update fields - simplified fields only
      if (!isBlank(item.LedgerName || item.ledgerName || item.name)) {
        dealer.LedgerName = normalizeString(item.LedgerName || item.ledgerName || item.name);
      }
      if (item.LedgerMobile !== undefined) {
        dealer.LedgerMobile = normalizeString(item.LedgerMobile);
      }
      if (item.Email !== undefined) {
        dealer.Email = normalizeString(item.Email);
      }
      if (item.password !== undefined && item.password) {
        dealer.password = await bcrypt.hash(normalizeString(item.password), 10);
      }
      if (item.LedgerGSTIN !== undefined) {
        dealer.LedgerGSTIN = normalizeString(item.LedgerGSTIN)?.toUpperCase() || '';
      }
      if (item.LedgerAddress1 !== undefined) {
        dealer.LedgerAddress1 = normalizeString(item.LedgerAddress1);
      }
      if (item.LedgerAddress2 !== undefined) {
        dealer.LedgerAddress2 = normalizeString(item.LedgerAddress2);
      }
      if (item.LedgerState !== undefined) {
        dealer.LedgerState = normalizeString(item.LedgerState);
      }
      if (item.LedgerOpening !== undefined) {
        dealer.LedgerOpening = toNumber(item.LedgerOpening, 0);
      }
      if (item.LedgerOpeningDate !== undefined) {
        dealer.LedgerOpeningDate = normalizeDate(item.LedgerOpeningDate);
      }
      if (item.LedgerJoinDate !== undefined) {
        dealer.LedgerJoinDate = normalizeDate(item.LedgerJoinDate);
      }
      if (item.Remarks !== undefined) {
        dealer.Remarks = normalizeString(item.Remarks);
      }
      if (item.Other1 !== undefined) {
        dealer.Other1 = normalizeString(item.Other1);
      }
      if (item.Other2 !== undefined) {
        dealer.Other2 = normalizeString(item.Other2);
      }
      if (item.Other3 !== undefined) {
        dealer.Other3 = normalizeString(item.Other3);
      }
      if (item.Other4 !== undefined) {
        dealer.Other4 = normalizeString(item.Other4);
      }
      if (item.Other5 !== undefined) {
        dealer.Other5 = normalizeString(item.Other5);
      }
      if (item.other6 !== undefined) {
        dealer.other6 = normalizeString(item.other6);
      }
      if (item.other7 !== undefined) {
        dealer.other7 = normalizeString(item.other7);
      }
      if (item.other8 !== undefined) {
        dealer.other8 = normalizeString(item.other8);
      }
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
