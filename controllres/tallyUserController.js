import bcrypt from 'bcryptjs';
import { XMLParser } from 'fast-xml-parser';
import mongoose from 'mongoose';
import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';
import Group from '../models/group/groupModel.js';

const NORMALIZED_ROLES = new Set([
  'superadmin',
  'admin',
  'groupuser',
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
  if (lower === 'group-user' || lower === 'group user') {
    return 'groupuser';
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

      // Default role to 'groupuser' if not provided
      const role = item.role ? normalizeRole(item.role) : 'groupuser';
      if (role && role !== 'groupuser') {
        results.push({
          userName: item.userName,
          success: false,
          message: 'Only "groupuser" role is supported for Tally integration',
          error: 'INVALID_ROLE',
        });
        continue;
      }

      // Required fields validation
      const name = normalizeString(item.name || item.fullName);
      const mobile = normalizeString(item.mobile || item.phone);
      const email = normalizeString(item.email);
      const userName = normalizeString(item.userName);
      const password = normalizeString(item.password);

      // Validate required fields
      if (!name) {
        results.push({
          userName: userName || email || mobile,
          success: false,
          message: 'Name is required',
          error: 'MISSING_NAME',
        });
        continue;
      }

      if (!mobile) {
        results.push({
          userName: userName || email || name,
          success: false,
          message: 'Mobile is required',
          error: 'MISSING_MOBILE',
        });
        continue;
      }

      if (!email) {
        results.push({
          userName: userName || mobile || name,
          success: false,
          message: 'Email is required',
          error: 'MISSING_EMAIL',
        });
        continue;
      }

      if (!userName) {
        results.push({
          email: email || mobile || name,
          success: false,
          message: 'Username is required',
          error: 'MISSING_USERNAME',
        });
        continue;
      }

      if (!password) {
        results.push({
          userName: userName || email || mobile,
          success: false,
          message: 'Password is required',
          error: 'MISSING_PASSWORD',
        });
        continue;
      }

      // Check if this is a new user (not existing) - only check limit for new users
      const uniquenessCriteria = [];
      
      if (userName) uniquenessCriteria.push({ userName });
      if (email) uniquenessCriteria.push({ email });
      if (mobile) uniquenessCriteria.push({ mobile });

      const existingUser = uniquenessCriteria.length > 0
        ? await User.findOne({ $or: uniquenessCriteria })
        : null;

      // Only check limit if creating a new user (not updating existing)
      if (!existingUser) {
        const { checkCompanyMemberLimit } = await import('./adminController.js');
        const limitCheck = await checkCompanyMemberLimit(company._id, 1);
        if (!limitCheck.allowed) {
          results.push({
            userName: userName || item.userName,
            success: false,
            message: limitCheck.message,
            error: 'MEMBER_LIMIT_EXCEEDED',
          });
          continue;
        }
      }


      // Simplified user payload - only required fields
      const userPayload = {
        name,
        mobile,
        email,
        userName,
        role: 'groupuser', // Always groupuser for Tally
        isActive: normalizeBoolean(item.isActive, true),
        address: mapAddress(item.address || {}),
        defaultCompany: company._id,
        companies: [
          {
            companyId: company._id,
            role: 'groupuser',
            isActive: true,
            assignedBy: null,
            assignedAt: new Date(),
          },
        ],
      };

      // Note: Uniqueness check and limit check already done above
      // If user exists, update instead of creating new
      if (existingUser) {
        // Update existing user - simplified fields only
        const updateData = {
          name,
          mobile,
          email,
          userName,
          role: 'groupuser', // Always groupuser for Tally
          isActive: normalizeBoolean(item.isActive, existingUser.isActive),
          address: mapAddress(item.address || {}),
          defaultCompany: company._id,
        };

        // Update or add company assignment
        const existingCompanyIndex = existingUser.companies?.findIndex(
          c => c.companyId?.toString() === company._id.toString()
        );

        if (existingCompanyIndex >= 0) {
          // Update existing company assignment
          existingUser.companies[existingCompanyIndex].role = 'groupuser';
          existingUser.companies[existingCompanyIndex].isActive = true;
        } else {
          // Add new company assignment
          if (!existingUser.companies) existingUser.companies = [];
          existingUser.companies.push({
            companyId: company._id,
            role: 'groupuser',
            isActive: true,
            assignedBy: null,
            assignedAt: new Date(),
          });
        }
        updateData.companies = existingUser.companies;

        // Update password
        updateData.password = await bcrypt.hash(password, 10);

        await User.findByIdAndUpdate(existingUser._id, { $set: updateData });

        const updatedUser = await User.findById(existingUser._id)
          .select('-password')
          .lean();

        results.push({
          success: true,
          user: updatedUser,
          message: 'User updated successfully',
        });
        continue;
      }

      // Check user limit for the company (only for non-admin/superadmin roles)
      if (company.maxUser && role !== 'admin' && role !== 'superadmin') {
        // Count current active users for this company (excluding admin and superadmin)
        const currentUserCount = await User.countDocuments({
          'companies.companyId': company._id,
          'companies.isActive': true,
          isActive: true,
          role: { $nin: ['admin', 'superadmin'] }
        });

        if (currentUserCount >= company.maxUser) {
          results.push({
            userName: item.userName,
            guid: normalizedGuid,
            success: false,
            message: `Company has reached its user limit. Maximum allowed users: ${company.maxUser}. Current users: ${currentUserCount}. Cannot create more users.`,
            error: 'USER_LIMIT_REACHED',
          });
          continue;
        }
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
    const queryGuid = normalizeGuid(req.query.companyGuid || req.query.guid || req.query.companyGUID);

    if (!payload.length) {
      return res.status(400).json({
        success: false,
        message: 'Payload cannot be empty',
      });
    }

    // Support companyGuid from query parameter, path parameter, or body
    // Priority: query parameter > path parameter > body (first item)
    let companyGuid = queryGuid || pathGuid;
    if (!companyGuid && payload.length > 0) {
      // Try to get from first item in payload
      companyGuid = normalizeGuid(payload[0].companyGuid || payload[0].guid || payload[0].companyGUID);
    }

    if (!companyGuid) {
      return res.status(400).json({
        success: false,
        message: 'Company GUID is required (provide in query parameter ?companyGuid=XXX, path parameter, or in request body)',
        error: 'MISSING_COMPANY_GUID',
      });
    }

    const { company, guid: normalizedGuid } =
      await findCompanyByGuidFlexible(companyGuid);

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
      
      // Support companyGuid per item (overrides path/global)
      let itemCompanyGuid = guid;
      const itemGuidSource = item.companyGuid || item.guid || item.companyGUID;
      if (itemGuidSource) {
        const itemCompanyResult = await findCompanyByGuidFlexible(itemGuidSource);
        if (itemCompanyResult.company) {
          itemCompanyGuid = itemCompanyResult.guid;
          // Use item's company if provided
          const itemCompany = itemCompanyResult.company;
          if (itemCompany._id.toString() !== company._id.toString()) {
            // Different company - use item's company for this user
            const email = normalizeEmail(item.email || item.userEmail);
            const mobile = normalizeString(item.mobile);
            const userName = normalizeString(item.userName);
            
            if (!email && !mobile && !userName) {
              results.push({
                guid: itemCompanyGuid,
                success: false,
                message: 'User identifier is required for updates (email, mobile, or userName)',
                error: 'MISSING_USER_IDENTIFIER',
              });
              continue;
            }

            const itemUserQuery = {
              'companies.companyId': itemCompany._id,
            };
            
            if (email) itemUserQuery.email = email;
            else if (mobile) itemUserQuery.mobile = mobile;
            else if (userName) itemUserQuery.userName = userName;

            const itemUser = await User.findOne(itemUserQuery);
            
            if (!itemUser) {
              results.push({
                guid: itemCompanyGuid,
                success: false,
                message: 'User not found for provided company and identifiers',
                error: 'USER_NOT_FOUND',
              });
              continue;
            }
            
            // Process update for this user with item's company
            // (Reuse the update logic below, but with itemCompany and itemUser)
            // For now, skip and use main company logic - will be handled in next iteration
            // Actually, let's process it here
            const itemUpdates = {};
            const itemCompanyUpdates = {};

            if (Object.prototype.hasOwnProperty.call(item, 'name')) {
              const name = normalizeString(item.name);
              if (name) itemUpdates.name = name;
            }

            if (Object.prototype.hasOwnProperty.call(item, 'mobile')) {
              const mobileVal = normalizeString(item.mobile);
              if (!mobileVal) {
                results.push({
                  guid: itemCompanyGuid,
                  success: false,
                  message: 'Mobile cannot be empty when provided',
                  error: 'INVALID_MOBILE',
                });
                continue;
              }
              const existingMobile = await User.findOne({
                mobile: mobileVal,
                _id: { $ne: itemUser._id },
              });
              if (existingMobile) {
                results.push({
                  guid: itemCompanyGuid,
                  success: false,
                  message: 'Another user already uses this mobile number',
                  error: 'MOBILE_IN_USE',
                });
                continue;
              }
              itemUpdates.mobile = mobileVal;
            }

            if (Object.prototype.hasOwnProperty.call(item, 'role')) {
              const role = normalizeRole(item.role);
              if (!role) {
                results.push({
                  guid: itemCompanyGuid,
                  success: false,
                  message: 'Invalid role provided',
                  error: 'INVALID_ROLE',
                });
                continue;
              }
              itemUpdates.role = role;
              itemCompanyUpdates.role = role;
            }

            if (Object.prototype.hasOwnProperty.call(item, 'isActive')) {
              const isActive = normalizeBoolean(item.isActive, itemUser.isActive);
              itemUpdates.isActive = isActive;
              itemCompanyUpdates.isActive = isActive;
            }

            if (Object.prototype.hasOwnProperty.call(item, 'address')) {
              itemUpdates.address = mapAddress(item.address);
            }

            if (Object.prototype.hasOwnProperty.call(item, 'userName')) {
              const newUserName = normalizeString(item.userName);
              if (newUserName && newUserName !== itemUser.userName) {
                const existingUserName = await User.findOne({
                  userName: newUserName,
                  _id: { $ne: itemUser._id },
                });
                if (existingUserName) {
                  results.push({
                    guid: itemCompanyGuid,
                    success: false,
                    message: 'Another user already uses this username',
                    error: 'USERNAME_IN_USE',
                  });
                  continue;
                }
                itemUpdates.userName = newUserName;
              }
            }

            // Handle groups, hierarchy, subdealerDetails (similar to main logic)
            // ... (groups, hierarchy, subdealerDetails logic would go here)
            
            if (item.password) {
              itemUpdates.password = await bcrypt.hash(item.password, 10);
            }

            if (Object.keys(itemUpdates).length === 0 && Object.keys(itemCompanyUpdates).length === 0) {
              results.push({
                guid: itemCompanyGuid,
                success: false,
                message: 'No updatable fields provided',
                error: 'EMPTY_UPDATE',
              });
              continue;
            }

            // Update user fields
            if (Object.keys(itemUpdates).length > 0) {
              await User.findByIdAndUpdate(itemUser._id, { $set: itemUpdates }, { new: false });
            }

            // Update company-specific fields
            if (Object.keys(itemCompanyUpdates).length > 0) {
              const itemCompanyUpdateQuery = {};
              if (itemCompanyUpdates.role) {
                itemCompanyUpdateQuery['companies.$[elem].role'] = itemCompanyUpdates.role;
              }
              if (Object.prototype.hasOwnProperty.call(itemCompanyUpdates, 'isActive')) {
                itemCompanyUpdateQuery['companies.$[elem].isActive'] = itemCompanyUpdates.isActive;
              }
              
              await User.updateOne(
                { _id: itemUser._id },
                { $set: itemCompanyUpdateQuery },
                { arrayFilters: [{ 'elem.companyId': itemCompany._id }] }
              );
            }

            const updatedItemUser = await User.findById(itemUser._id).select('-password').lean();

            results.push({
              success: true,
              user: updatedItemUser,
            });
            continue; // Skip main company logic for this item
          }
        }
      }

      // Support multiple identifiers: email (preferred), mobile, or userName
      // Email is the primary identifier as requested
      const email = normalizeEmail(item.email || item.userEmail);
      const mobile = normalizeString(item.mobile);
      const userName = normalizeString(item.userName);
      
      if (!email && !mobile && !userName) {
        results.push({
          guid,
          success: false,
          message: 'User identifier is required for updates (email preferred, or mobile, or userName)',
          error: 'MISSING_USER_IDENTIFIER',
        });
        continue;
      }

      // Build user query - prioritize email as the primary identifier
      const userQuery = {
        'companies.companyId': company._id,
      };
      
      // Email is the primary identifier - use it if available
      if (email) {
        userQuery.email = email;
      } else if (mobile) {
        userQuery.mobile = mobile;
      } else if (userName) {
        userQuery.userName = userName;
      }

      const user = await User.findOne(userQuery);

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

      // Role is always 'groupuser' for Tally - no need to update
      // But if role is provided and not 'groupuser', reject it
      if (Object.prototype.hasOwnProperty.call(item, 'role')) {
        const providedRole = normalizeRole(item.role);
        if (providedRole && providedRole !== 'groupuser') {
          results.push({
            guid,
            email: email || mobile || userName,
            success: false,
            message: 'Only "groupuser" role is supported for Tally integration',
            error: 'INVALID_ROLE',
          });
          continue;
        }
        // If role is 'groupuser' or not provided, keep it as 'groupuser'
        updates.role = 'groupuser';
        companyUpdates.role = 'groupuser';
      }

      if (Object.prototype.hasOwnProperty.call(item, 'isActive')) {
        const isActive = normalizeBoolean(item.isActive, user.isActive);
        updates.isActive = isActive;
        companyUpdates.isActive = isActive;
      }

      if (Object.prototype.hasOwnProperty.call(item, 'address')) {
        updates.address = mapAddress(item.address);
      }

      if (Object.prototype.hasOwnProperty.call(item, 'userName')) {
        const newUserName = normalizeString(item.userName);
        if (newUserName && newUserName !== user.userName) {
          const existingUserName = await User.findOne({
            userName: newUserName,
            _id: { $ne: user._id },
          });
          if (existingUserName) {
            results.push({
              guid,
              email: email || mobile || userName,
              success: false,
              message: 'Another user already uses this username',
              error: 'USERNAME_IN_USE',
            });
            continue;
          }
          updates.userName = newUserName;
        }
      }

      // Simplified update - no groups, hierarchy, or subdealerDetails for Tally

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

      // Update user fields
      if (Object.keys(updates).length > 0) {
        await User.findByIdAndUpdate(user._id, { $set: updates }, { new: false });
      }

      // Update company-specific fields in companies array
      if (Object.keys(companyUpdates).length > 0) {
        const companyUpdateQuery = {};
        if (companyUpdates.role) {
          companyUpdateQuery['companies.$[elem].role'] = companyUpdates.role;
        }
        if (Object.prototype.hasOwnProperty.call(companyUpdates, 'isActive')) {
          companyUpdateQuery['companies.$[elem].isActive'] = companyUpdates.isActive;
        }
        
        await User.updateOne(
          { _id: user._id },
          { $set: companyUpdateQuery },
          { arrayFilters: [{ 'elem.companyId': company._id }] }
        );
      }

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

    // Support companyGuid from body or path parameter
    let companyGuid = pathGuid;
    if (!companyGuid && payload.length > 0) {
      // Try to get from first item in payload
      companyGuid = normalizeGuid(payload[0].companyGuid || payload[0].guid || payload[0].companyGUID);
    }

    if (!companyGuid) {
      return res.status(400).json({
        success: false,
        message: 'Company GUID is required (provide in path parameter or in request body)',
        error: 'MISSING_COMPANY_GUID',
      });
    }

    const { company, guid: normalizedGuid } =
      await findCompanyByGuidFlexible(companyGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided GUID.',
        error: 'COMPANY_NOT_FOUND',
      });
    }

    const results = [];

    for (const item of payload) {
      let guid = normalizedGuid;
      
      // Support companyGuid per item (overrides path/global)
      const itemGuidSource = item.companyGuid || item.guid || item.companyGUID;
      if (itemGuidSource) {
        const itemCompanyResult = await findCompanyByGuidFlexible(itemGuidSource);
        if (itemCompanyResult.company) {
          guid = itemCompanyResult.guid;
          // Use item's company if provided
          const itemCompany = itemCompanyResult.company;
          if (itemCompany._id.toString() !== company._id.toString()) {
            // Different company - use item's company for this deletion
            const email = normalizeEmail(item.email || item.userEmail);
            const mobile = normalizeString(item.mobile);
            const userName = normalizeString(item.userName);
            
            if (!email && !mobile && !userName) {
              results.push({
                guid,
                success: false,
                message: 'User identifier is required for deletion (email, mobile, or userName)',
                error: 'MISSING_USER_IDENTIFIER',
              });
              continue;
            }

            const userQuery = {
              'companies.companyId': itemCompany._id,
            };
            
            if (email) userQuery.email = email;
            else if (mobile) userQuery.mobile = mobile;
            else if (userName) userQuery.userName = userName;

            const itemUser = await User.findOne(userQuery);
            
            if (!itemUser) {
              results.push({
                guid,
                success: false,
                message: 'User not found for provided company and identifiers',
                error: 'USER_NOT_FOUND',
              });
              continue;
            }

            await User.deleteOne({ _id: itemUser._id });

            results.push({
              success: true,
              guid,
              email: email || mobile || userName,
              userId: itemUser._id,
            });
            continue;
          }
        }
      }

      // Support multiple identifiers: email, mobile, or userName
      const email = normalizeEmail(item.email || item.userEmail);
      const mobile = normalizeString(item.mobile);
      const userName = normalizeString(item.userName);
      
      if (!email && !mobile && !userName) {
        results.push({
          guid,
          success: false,
          message: 'User identifier is required for deletion (email, mobile, or userName)',
          error: 'MISSING_USER_IDENTIFIER',
        });
        continue;
      }

      const userQuery = {
        'companies.companyId': company._id,
      };
      
      if (email) userQuery.email = email;
      else if (mobile) userQuery.mobile = mobile;
      else if (userName) userQuery.userName = userName;

      const user = await User.findOne(userQuery);

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
        email: email || mobile || userName,
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

