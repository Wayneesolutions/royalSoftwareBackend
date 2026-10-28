import mongoose from 'mongoose';
import Company from '../models/company/companyModel.js';
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
      if (xmlResult?.Groups) {
        return xmlResult.Groups.Group || xmlResult.Groups;
      }
      if (xmlResult?.Group) {
        return xmlResult.Group;
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
      const collection = Company.collection;
      const directQuery = { $or: buildGuidQueryConditions(guid, escapedGuid, isNumeric, numericGuid) };
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

const buildGroupGuidQueryConditions = (groupGuid, escapedGuid, isNumeric, numericGuid) => {
  const conditions = [
    { GroupGUID: groupGuid },
    { GroupGUID: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
  ];

  if (isNumeric) {
    conditions.push({ GroupGUID: numericGuid }, { GroupGUID: String(numericGuid) });
  }

  return conditions;
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
  const queryConditions = buildGroupGuidQueryConditions(groupGuid, escapedGuid, isNumeric, numericGuid);

  // Add cmpcode to query if provided
  const query = cmpcode ? { $or: queryConditions, cmpcode: normalizeString(cmpcode) } : { $or: queryConditions };

  let group = null;
  for (const condition of queryConditions) {
    const searchQuery = cmpcode ? { ...condition, cmpcode: normalizeString(cmpcode) } : condition;
    group = await Group.findOne(searchQuery);
    if (group) break;
  }

  if (!group) {
    group = await Group.findOne(query);
  }

  if (!group) {
    return {
      error: 'GROUP_NOT_FOUND',
      message: `Group not found for GroupGUID: ${groupGuid}${cmpcode ? ` and cmpcode: ${cmpcode}` : ''}`,
      groupGuid,
      group: null,
    };
  }

  return { group, groupGuid };
};

/**
 * Upsert groups from Tally ERP
 * Accepts single group object or array of groups for batch processing
 * Each group is processed independently - success/failure of one doesn't affect others
 * Returns results array with status for each group
 */
export const upsertGroupFromTally = async (req, res) => {
  try {
    const parsedBody = parseIncomingPayload(req);
    // Support both single group and array of groups
    const payload = Array.isArray(parsedBody) ? parsedBody : [parsedBody];

    if (payload.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    // Required fields: GroupGUID, GroupName, and companyGuid (cmpcode will be auto-assigned)
    const requiredFields = ['GroupGUID', 'GroupName', 'companyGuid'];

    const results = [];

    for (const item of payload) {
      const groupGuid = normalizeGuid(item.GroupGUID || item.groupGUID || item.group_guid);
      const groupName = normalizeString(item.GroupName || item.groupName || item.group_name);
      
      // Get companyGuid from item (optional if cmpcode is provided)
      const companyGuidSource = item.companyGuid || item.guid || item.companyGUID || item.GUID;
      const companyGuid = normalizeGuid(companyGuidSource);

      // Get cmpcode from item (fallback when companyGuid is not provided)
      const cmpcodeFromItem = normalizeString(item.cmpcode || item.cmpCode || item.companyCode);

      // Validate required fields
      if (!groupGuid) {
        results.push({
          GroupGUID: normalizeString(item.GroupGUID),
          GroupName: normalizeString(item.GroupName),
          success: false,
          message: 'GroupGUID is required',
          error: 'MISSING_GROUPGUID',
        });
        continue;
      }

      if (!groupName) {
        results.push({
          GroupGUID: groupGuid,
          GroupName: normalizeString(item.GroupName),
          success: false,
          message: 'GroupName is required',
          error: 'MISSING_GROUPNAME',
        });
        continue;
      }

      if (!companyGuid && !cmpcodeFromItem) {
        results.push({
          GroupGUID: groupGuid,
          GroupName: groupName,
          success: false,
          message: 'Either companyGuid or cmpcode is required to identify the company',
          error: 'MISSING_COMPANY_IDENTIFIER',
        });
        continue;
      }

      // Find company by GUID or cmpcode (cmpcode will be derived from company)
      let company = null;
      let companyId = null;
      let cmpcode = null;

      if (companyGuid) {
        // Try to find company by GUID
        company = await Company.findOne({ guid: companyGuid });
        if (!company) {
          // Try case-insensitive search
          company = await Company.findOne({
            guid: { $regex: new RegExp(`^${companyGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
          });
        }
      } else {
        // Fallback: find company by cmpcode
        company = await Company.findOne({
          companyCode: { $regex: new RegExp(`^${cmpcodeFromItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          isActive: true,
        });
      }

      if (!company) {
        results.push({
          GroupGUID: groupGuid,
          GroupName: groupName,
          companyGuid: companyGuid || undefined,
          cmpcode: cmpcodeFromItem || undefined,
          success: false,
          message: companyGuid
            ? `Company not found for GUID: ${companyGuid}. Please ensure the company is registered in the system with this GUID.`
            : `Company not found for cmpcode: ${cmpcodeFromItem}. Please ensure the company is registered in the system.`,
          error: 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      // Get companyId and cmpcode from found company
      companyId = company._id;
      cmpcode = company.companyCode; // Auto-assign cmpcode from company

      // Get parent group GUID (can be provided as GroupParent, parentGroupGUID, or parentGroupGuid)
      const parentGroupGuidSource = item.GroupParent || item.parentGroupGUID || item.parentGroupGuid || item.groupParent || item.group_parent;
      const parentGroupGuid = normalizeGuid(parentGroupGuidSource);
      
      // Validate parent group GUID if provided
      // Note: For the first group in a company, parentGroupGUID should not be provided (or be null)
      // The first group will be created as a root group with GroupParent = null
      // Tally convention: root/predefined groups have parentGroupGUID === their own GroupGUID — treat as root (no parent)
      let parentGroup = null;
      if (parentGroupGuid && parentGroupGuid !== groupGuid) {
        // Find parent group by GroupGUID and cmpcode (must be in same company)
        const parentGroupResult = await findGroupByGuid(parentGroupGuid, cmpcode);
        if (!parentGroupResult.group) {
          results.push({
            GroupGUID: groupGuid,
            GroupName: groupName,
            companyGuid: companyGuid,
            parentGroupGUID: parentGroupGuid,
            success: false,
            message: `Parent group not found for GroupGUID: ${parentGroupGuid} with cmpcode: ${cmpcode}. Please ensure the parent group exists in the same company before creating this group.`,
            error: 'PARENT_GROUP_NOT_FOUND',
          });
          continue;
        }
        parentGroup = parentGroupResult.group;
      }
      
      // Set GroupParent to parent group GUID (or null if not provided)
      // If parentGroupGuid is null/undefined, this will be the first/root group for the company
      // If self-referential (Tally root group convention), store as null (no parent)
      const groupParent = (parentGroupGuid && parentGroupGuid !== groupGuid) ? parentGroupGuid : null;
      const remarks = item.Remarks !== undefined || item.remarks !== undefined ? normalizeString(item.Remarks || item.remarks) : undefined;
      // Handle Other1-Other4: save them if provided, even if empty string
      const other1 = item.Other1 !== undefined || item.other1 !== undefined ? normalizeString(item.Other1 || item.other1) : undefined;
      const other2 = item.Other2 !== undefined || item.other2 !== undefined ? normalizeString(item.Other2 || item.other2) : undefined;
      const other3 = item.Other3 !== undefined || item.other3 !== undefined ? normalizeString(item.Other3 || item.other3) : undefined;
      const other4 = item.Other4 !== undefined || item.other4 !== undefined ? normalizeString(item.Other4 || item.other4) : undefined;

      // Check if group already exists
      const existingGroup = await Group.findOne({
        GroupGUID: groupGuid,
        cmpcode: cmpcode,
      });

      if (existingGroup) {
        // Update existing group - build update object carefully
        const updates = {};
        
        // Always update these fields
        if (groupName && groupName !== existingGroup.GroupName) {
          updates.GroupName = groupName;
        }
        // Update GroupParent if provided (validated above)
        if (parentGroupGuid !== undefined) {
          updates.GroupParent = groupParent;
        }
        updates.tallySyncStatus = 'synced';
        updates.tallySyncAt = new Date();
        
        // Update optional fields if they are provided (even if empty string)
        if (remarks !== undefined) {
          updates.Remarks = remarks || null;
        }
        if (other1 !== undefined) {
          updates.other1 = other1 || null;
        }
        if (other2 !== undefined) {
          updates.other2 = other2 || null;
        }
        if (other3 !== undefined) {
          updates.other3 = other3 || null;
        }
        if (other4 !== undefined) {
          updates.other4 = other4 || null;
        }

        if (companyId) {
          updates.companyId = companyId;
        }

        // Only update if there are changes
        if (Object.keys(updates).length > 0) {
          const updatedGroup = await Group.findByIdAndUpdate(
            existingGroup._id,
            { $set: updates },
            { new: true, runValidators: true }
          );

          results.push({
            success: true,
            group: updatedGroup.toObject(),
            message: 'Group updated successfully',
          });
        } else {
          // No changes needed
          results.push({
            success: true,
            group: existingGroup.toObject(),
            message: 'Group already up to date',
          });
        }
      } else {
        // Create new group
        try {
          // Check if this is the first group for the company (helpful for messaging)
          const existingGroupsCount = await Group.countDocuments({
            cmpcode: cmpcode,
            isActive: true
          });
          const isFirstGroup = existingGroupsCount === 0;
          
          const newGroupData = {
            GroupGUID: groupGuid,
            GroupName: groupName,
            GroupParent: groupParent, // Will be null for first/root groups
            cmpcode: cmpcode,
            companyId: companyId,
            tallySyncStatus: 'synced',
            tallySyncAt: new Date(),
          };
          
          // Add optional fields only if they are provided
          if (remarks !== undefined) {
            newGroupData.Remarks = remarks || null;
          }
          if (other1 !== undefined) {
            newGroupData.other1 = other1 || null;
          }
          if (other2 !== undefined) {
            newGroupData.other2 = other2 || null;
          }
          if (other3 !== undefined) {
            newGroupData.other3 = other3 || null;
          }
          if (other4 !== undefined) {
            newGroupData.other4 = other4 || null;
          }
          
          const newGroup = await Group.create(newGroupData);

          // Provide helpful message for first group or hierarchy creation
          let successMessage = 'Group created successfully';
          if (isFirstGroup && !groupParent) {
            successMessage = 'First group created successfully as root group (no parent)';
          } else if (groupParent) {
            successMessage = `Group created successfully with parent group: ${parentGroupGuid}`;
          } else if (isFirstGroup) {
            successMessage = 'First group created successfully as root group';
          }

          results.push({
            success: true,
            group: newGroup.toObject(),
            message: successMessage,
            isFirstGroup: isFirstGroup,
            hasParent: !!groupParent
          });
        } catch (createError) {
          // Handle duplicate key error (race condition - group was created between check and create)
          if (createError.code === 11000) {
            // Try to fetch and update the group that was just created
            const raceConditionGroup = await Group.findOne({
              GroupGUID: groupGuid,
              cmpcode: cmpcode,
            });

            if (raceConditionGroup) {
              const updates = {
                GroupName: groupName,
                GroupParent: groupParent,
                tallySyncStatus: 'synced',
                tallySyncAt: new Date(),
              };
              
              // Add optional fields if provided
              if (remarks !== undefined) {
                updates.Remarks = remarks || null;
              }
              if (other1 !== undefined) {
                updates.other1 = other1 || null;
              }
              if (other2 !== undefined) {
                updates.other2 = other2 || null;
              }
              if (other3 !== undefined) {
                updates.other3 = other3 || null;
              }
              if (other4 !== undefined) {
                updates.other4 = other4 || null;
              }

              if (companyId) {
                updates.companyId = companyId;
              }

              const updatedGroup = await Group.findByIdAndUpdate(
                raceConditionGroup._id,
                { $set: updates },
                { new: true, runValidators: true }
              );

              results.push({
                success: true,
                group: updatedGroup.toObject(),
                message: 'Group updated successfully (handled race condition)',
              });
            } else {
              results.push({
                GroupGUID: groupGuid,
                GroupName: groupName,
                success: false,
                message: 'Failed to create group due to duplicate key error',
                error: 'DUPLICATE_KEY_ERROR',
              });
            }
          } else {
            // Other error - rethrow
            throw createError;
          }
        }
      }
    }

    const failures = results.filter((item) => !item.success);
    const successes = results.filter((item) => item.success);
    const status = failures.length === results.length ? 400 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: successes.length > 0,
      total: results.length,
      succeeded: successes.length,
      failed: failures.length,
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

    console.error('Error syncing groups from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync groups from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update groups from Tally ERP
 * Accepts single group object or array of groups for batch processing
 * Only provided fields are updated; other fields remain unchanged
 */
export const updateGroupFromTally = async (req, res) => {
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
      const groupGuid = normalizeGuid(item.GroupGUID || item.groupGUID || item.group_guid);

      if (!groupGuid) {
        results.push({
          success: false,
          message: 'GroupGUID is required for updates',
          error: 'MISSING_GROUP_GUID',
        });
        continue;
      }

      // Get companyGuid from item (optional if cmpcode is provided)
      const companyGuidSource = item.companyGuid || item.guid || item.companyGUID || item.GUID;
      const companyGuid = normalizeGuid(companyGuidSource);

      // Get cmpcode from item (fallback when companyGuid is not provided)
      const cmpcodeFromItem = normalizeString(item.cmpcode || item.cmpCode || item.companyCode);

      if (!companyGuid && !cmpcodeFromItem) {
        results.push({
          GroupGUID: groupGuid,
          success: false,
          message: 'Either companyGuid or cmpcode is required to identify the company',
          error: 'MISSING_COMPANY_IDENTIFIER',
        });
        continue;
      }

      // Find company by GUID or cmpcode
      let company = null;
      if (companyGuid) {
        company = await Company.findOne({ guid: companyGuid });
        if (!company) {
          company = await Company.findOne({
            guid: { $regex: new RegExp(`^${companyGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
          });
        }
      } else {
        company = await Company.findOne({
          companyCode: { $regex: new RegExp(`^${cmpcodeFromItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          isActive: true,
        });
      }

      if (!company) {
        results.push({
          GroupGUID: groupGuid,
          companyGuid: companyGuid || undefined,
          cmpcode: cmpcodeFromItem || undefined,
          success: false,
          message: companyGuid
            ? `Company not found for GUID: ${companyGuid}`
            : `Company not found for cmpcode: ${cmpcodeFromItem}`,
          error: 'COMPANY_NOT_FOUND',
        });
        continue;
      }

      // Get cmpcode from company (auto-assigned)
      const cmpcode = company.companyCode;

      // Find the group using GroupGUID and cmpcode
      const group = await Group.findOne({
        GroupGUID: groupGuid,
        cmpcode: cmpcode,
      });

      if (!group) {
        results.push({
          GroupGUID: groupGuid,
          companyGuid: companyGuid,
          cmpcode: cmpcode,
          success: false,
          message: `Group not found with GroupGUID ${groupGuid} and cmpcode ${cmpcode}`,
          error: 'GROUP_NOT_FOUND',
        });
        continue;
      }

      const updates = {};

      if (!isBlank(item.GroupName || item.groupName)) {
        updates.GroupName = normalizeString(item.GroupName || item.groupName);
      }
      
      // Handle GroupParent update with validation
      const parentGroupGuidSource = item.GroupParent || item.parentGroupGUID || item.parentGroupGuid || item.groupParent || item.group_parent;
      const parentGroupGuid = normalizeGuid(parentGroupGuidSource);
      
      if (parentGroupGuid !== undefined && parentGroupGuid !== null) {
        // Validate parent group exists if provided
        // Tally convention: root/predefined groups have parentGroupGUID === their own GroupGUID — treat as root (no parent)
        if (parentGroupGuid && parentGroupGuid !== groupGuid) {
          // Find parent group by GroupGUID and cmpcode (must be in same company)
          const parentGroupResult = await findGroupByGuid(parentGroupGuid, cmpcode);
          if (!parentGroupResult.group) {
            results.push({
              GroupGUID: groupGuid,
              companyGuid: companyGuid,
              parentGroupGUID: parentGroupGuid,
              success: false,
              message: `Parent group not found for GroupGUID: ${parentGroupGuid} with cmpcode: ${cmpcode}. Please ensure the parent group exists in the same company.`,
              error: 'PARENT_GROUP_NOT_FOUND',
            });
            continue;
          }

          updates.GroupParent = parentGroupGuid;
        } else {
          // Setting to null/empty - remove parent relationship
          updates.GroupParent = null;
        }
      }
      
      // Note: cmpcode is auto-assigned from company, so it should not be changed directly
      // If companyGuid changes in the update request, we need to find the new company and update cmpcode accordingly
      const newCompanyGuidSource = item.companyGuid || item.guid || item.companyGUID || item.GUID;
      const newCompanyGuid = normalizeGuid(newCompanyGuidSource);
      
      // If a new companyGuid is provided and it's different from the current one, update company and cmpcode
      if (newCompanyGuid && newCompanyGuid !== companyGuid) {
        // Company is being changed - find new company
        let newCompany = await Company.findOne({ guid: newCompanyGuid });
        if (!newCompany) {
          newCompany = await Company.findOne({
            guid: { $regex: new RegExp(`^${newCompanyGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
          });
        }
        
        if (newCompany) {
          const newCmpcode = newCompany.companyCode;
          // Check for duplicate group with new cmpcode
          const duplicate = await Group.findOne({
            GroupGUID: group.GroupGUID,
            cmpcode: newCmpcode,
            _id: { $ne: group._id },
          });
          if (duplicate) {
            results.push({
              GroupGUID: groupGuid,
              success: false,
              message: `Group with GroupGUID ${groupGuid} and cmpcode ${newCmpcode} already exists`,
              error: 'DUPLICATE_GROUP',
            });
            continue;
          }
          updates.cmpcode = newCmpcode;
          updates.companyId = newCompany._id;
        } else {
          results.push({
            GroupGUID: groupGuid,
            success: false,
            message: `New company not found for GUID: ${newCompanyGuid}`,
            error: 'COMPANY_NOT_FOUND',
          });
          continue;
        }
      }
      if (item.Remarks !== undefined || item.remarks !== undefined) {
        updates.Remarks = normalizeString(item.Remarks || item.remarks);
      }
      if (item.Other1 !== undefined || item.other1 !== undefined) {
        updates.other1 = normalizeString(item.Other1 || item.other1);
      }
      if (item.Other2 !== undefined || item.other2 !== undefined) {
        updates.other2 = normalizeString(item.Other2 || item.other2);
      }
      if (item.Other3 !== undefined || item.other3 !== undefined) {
        updates.other3 = normalizeString(item.Other3 || item.other3);
      }
      if (item.Other4 !== undefined || item.other4 !== undefined) {
        updates.other4 = normalizeString(item.Other4 || item.other4);
      }

      // Update company link (always set from found company)
      if (!updates.companyId) {
        updates.companyId = company._id;
      }

      updates.tallySyncStatus = 'synced';
      updates.tallySyncAt = new Date();

      const updatedGroup = await Group.findByIdAndUpdate(
        group._id,
        updates,
        { new: true, runValidators: true }
      );

      results.push({
        success: true,
        group: updatedGroup.toObject(),
      });
    }

    const failures = results.filter((item) => !item.success);
    const successes = results.filter((item) => item.success);
    const status = failures.length === results.length ? 400 : failures.length > 0 ? 207 : 200;

    return res.status(status).json({
      success: successes.length > 0,
      total: results.length,
      succeeded: successes.length,
      failed: failures.length,
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

    console.error('Error updating groups from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update groups from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete groups from Tally ERP
 * Accepts single group object or array of groups for batch deletion
 */
export const deleteGroupFromTally = async (req, res) => {
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
      const groupGuid = normalizeGuid(item.GroupGUID || item.groupGUID || item.group_guid);
      const cmpcode = normalizeString(item.cmpcode || item.cmpCode || item.companyCode);

      if (!groupGuid) {
        results.push({
          success: false,
          message: 'GroupGUID is required for deletion',
          error: 'MISSING_GROUP_GUID',
        });
        continue;
      }

      const { group, error, message } = await findGroupByGuid(groupGuid, cmpcode);
      if (!group) {
        results.push({
          GroupGUID: groupGuid,
          success: false,
          message: message || 'Group not found for provided GroupGUID.',
          error: error || 'GROUP_NOT_FOUND',
        });
        continue;
      }

      await Group.findByIdAndDelete(group._id);

      results.push({
        success: true,
        GroupGUID: groupGuid,
        message: 'Group deleted successfully',
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
        message: 'Unable to parse Tally payload. Ensure the payload is valid JSON or XML.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }

    console.error('Error deleting groups from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete groups from Tally',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Search groups for Tally ERP
 * Supports search by query, GroupGUID, GroupName, cmpcode, and GroupParent
 */
export const searchGroupsForTally = async (req, res) => {
  try {
    const {
      query: searchQuery,
      GroupGUID,
      GroupName,
      cmpcode,
      GroupParent,
      isActive,
      limit = 50,
    } = req.query;

    const searchConditions = {};

    if (searchQuery) {
      const queryStr = String(searchQuery).trim();
      searchConditions.$or = [
        { GroupGUID: { $regex: queryStr, $options: 'i' } },
        { GroupName: { $regex: queryStr, $options: 'i' } },
        { Remarks: { $regex: queryStr, $options: 'i' } },
        { cmpcode: { $regex: queryStr, $options: 'i' } },
      ];
    }

    if (GroupGUID) {
      const groupGuid = normalizeGuid(GroupGUID);
      if (groupGuid) {
        const escapedGuid = groupGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        searchConditions.$or = [
          ...(searchConditions.$or || []),
          { GroupGUID: groupGuid },
          { GroupGUID: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } },
        ];
      }
    }

    if (GroupName) {
      searchConditions.GroupName = { $regex: String(GroupName).trim(), $options: 'i' };
    }

    if (cmpcode) {
      searchConditions.cmpcode = normalizeString(cmpcode);
    }

    if (GroupParent) {
      searchConditions.GroupParent = normalizeString(GroupParent);
    }

    if (isActive !== undefined) {
      searchConditions.isActive = isActive === 'true' || isActive === true;
    }

    const limitNum = parseInt(limit, 10) || 50;
    const groups = await Group.find(searchConditions)
      .limit(limitNum)
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: groups.length,
      groups,
    });
  } catch (error) {
    console.error('Error searching groups for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to search groups',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * List groups by company GUID
 * Returns all groups for a company identified by GUID
 */
export const listGroupsByCompanyGuid = async (req, res) => {
  try {
    const { guid } = req.params;

    if (!guid) {
      return res.status(400).json({
        success: false,
        message: 'Company GUID is required',
      });
    }

    const { company, error, message } = await findCompanyByGuid(guid);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: message || 'Company not found for provided GUID.',
        error: error || 'COMPANY_NOT_FOUND',
      });
    }

    const groups = await Group.find({
      cmpcode: company.companyCode,
      isActive: true,
    })
      .sort({ GroupName: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: groups.length,
      groups,
    });
  } catch (error) {
    console.error('Error listing groups by company GUID:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list groups',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * List users by group GUID
 * Returns all users assigned to a group identified by GroupGUID
 */
export const listUsersByGroupGuid = async (req, res) => {
  try {
    const { groupGuid } = req.params;

    if (!groupGuid) {
      return res.status(400).json({
        success: false,
        message: 'Group GUID is required',
      });
    }

    // Find the group by GroupGUID
    const group = await Group.findOne({
      GroupGUID: groupGuid,
      isActive: true,
    }).lean();

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found for provided GroupGUID',
        error: 'GROUP_NOT_FOUND',
      });
    }

    // Get the group ID (as ObjectId)
    const groupId = group._id;

    // Find all users that belong to this group
    // groups.groupId is ObjectId reference, groups.groupGUID is string
    const users = await User.find({
      isActive: { $in: [true, false] },
      $or: [
        { 'groups.groupId': groupId },
        { 'groups.groupGUID': groupGuid },
      ],
    })
      .select(
        'name email mobile userName role address isActive defaultCompany companies groups createdAt updatedAt'
      )
      .lean();

    // Format users for Tally response
    const mappedUsers = users.map((user) => {
      // Find the group assignment for this user
      const groupAssignment = (user.groups || []).find(
        (g) => {
          if (!g.groupId && !g.groupGUID) return false;
          // Check by ObjectId
          if (g.groupId) {
            const gId = g.groupId.toString ? g.groupId.toString() : String(g.groupId);
            if (gId === groupId.toString()) return true;
          }
          // Check by GUID
          if (g.groupGUID && g.groupGUID === groupGuid) return true;
          return false;
        }
      );

      // Get company info if available
      const companyAssignment = (user.companies || []).find(
        (c) => c.isActive === true
      );

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email || '',
        mobile: user.mobile,
        userName: user.userName || '',
        role: user.role,
        isActive: user.isActive,
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          pincode: user.address?.pincode || '',
          country: user.address?.country || '',
        },
        group: {
          id: group._id.toString(),
          guid: group.GroupGUID,
          name: group.GroupName,
          parent: group.GroupParent || null,
          cmpcode: group.cmpcode,
          remarks: group.Remarks || '',
        },
        groupAssignment: groupAssignment ? {
          assignedAt: groupAssignment.assignedAt || user.createdAt,
          assignedBy: groupAssignment.assignedBy || null,
          isActive: groupAssignment.isActive !== false,
        } : null,
        company: companyAssignment ? {
          id: companyAssignment.companyId?.toString() || '',
          role: companyAssignment.role || user.role,
          assignedAt: companyAssignment.assignedAt || user.createdAt,
        } : null,
        lastUpdated: user.updatedAt,
      };
    });

    return res.status(200).json({
      success: true,
      group: {
        id: group._id.toString(),
        guid: group.GroupGUID,
        name: group.GroupName,
        parent: group.GroupParent || null,
        cmpcode: group.cmpcode,
        remarks: group.Remarks || '',
      },
      totalUsers: mappedUsers.length,
      users: mappedUsers,
    });
  } catch (error) {
    console.error('Error fetching users by group GUID:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users for group',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

