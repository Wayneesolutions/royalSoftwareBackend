import User from '../models/user/userModel.js'
import Company from '../models/company/companyModel.js'
import SubDealer from '../models/subdealer/subdealerModel.js'
import Group from '../models/group/groupModel.js'
import Ledger from '../models/ledger/ledgerModel.js'
import mongoose from 'mongoose'

/**
 * Helper function to recursively find all child groups
 * Based on the user hierarchy:
 * - Group B is a child of Group A if Group B's GroupParent equals the ID of a user in Group A
 * 
 * @param {string} groupGUID - The parent group GUID
 * @param {string} cmpcode - The company code
 * @param {mongoose.Types.ObjectId} companyId - The company ID
 * @param {Set} visited - Set of already visited group GUIDs to prevent infinite loops
 * @returns {Promise<Array>} - Array of child group objects with _id, GUID, and Name
 */
const findAllChildGroups = async (groupGUID, cmpcode, companyId, visited = new Set()) => {
  const childGroups = [];
  
  // ✅ Prevent infinite loops by checking if we've already visited this group
  if (visited.has(groupGUID)) {
    console.log(`⚠️ findAllChildGroups - Already visited group GUID: ${groupGUID}, skipping to prevent infinite loop`);
    return childGroups;
  }
  
  // ✅ Mark this group as visited
  visited.add(groupGUID);
  
  // Step 1: Find the group document to get its _id
  const parentGroup = await Group.findOne({
    GroupGUID: groupGUID,
    cmpcode: cmpcode,
    isActive: true
  }).select('_id GroupGUID GroupName');
  
  if (!parentGroup) {
    return childGroups;
  }
  
  // Step 2: Find all users who belong to this parent group
  const usersInParentGroup = await User.find({
    'groups.groupId': parentGroup._id,
    'groups.isActive': true,
    'companies.companyId': companyId,
    'companies.isActive': true,
    isActive: true
  }).select('_id name').lean();
  
  // Step 3: Get user IDs
  const userIds = usersInParentGroup.map(u => u._id.toString());
  
  // Step 4: Find all groups where GroupParent equals any of these user IDs OR the parent group's GUID
  // This handles both cases:
  // - Correct case: GroupParent = user ID
  // - Fallback case: GroupParent = Group GUID (for groups created before users were assigned)
  
  // ⚠️ REMOVED: Excessive logging of all groups in company
  // Build query to find children with either user IDs OR group GUID as parent
  const parentSearchCriteria = [groupGUID]; // Always include the Group GUID
  if (userIds.length > 0) {
    parentSearchCriteria.push(...userIds); // Also include user IDs if they exist
  }
  
  const directChildren = await Group.find({
    GroupParent: { $in: parentSearchCriteria },
    cmpcode: cmpcode,
    companyId: companyId,
    isActive: true
  }).select('_id GroupGUID GroupName');
  
  // Add direct children to the list
  for (const child of directChildren) {
    childGroups.push({
      _id: child._id,
      GroupGUID: child.GroupGUID,
      GroupName: child.GroupName
    });
    
    // Recursively find children of this child (pass the SAME visited Set)
    const grandChildren = await findAllChildGroups(child.GroupGUID, cmpcode, companyId, visited);
    childGroups.push(...grandChildren);
  }
  
  return childGroups;
};

/**
 * @swagger
 * /api/v1/user/switch-company:
 *   post:
 *     summary: Switch the active company for the current user and update their active role
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company ID to switch to
 *     responses:
 *       200:
 *         description: Company switched successfully
 *       400:
 *         description: Missing required parameters
 *       403:
 *         description: User does not have access to the requested company
 *       404:
 *         description: User or company not found
 */
export const switchCompany = async (req, res) => {
  try {
    // Accept companyId from body or query params
    const companyId = req.body?.companyId || req.query?.companyId
    const userId = req.user?.userId

    console.log('Switch Company Request:', {
      body: req.body,
      query: req.query,
      companyId: companyId,
      userId: userId
    })

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      })
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      })
    }

    const companyIdStr = companyId.toString()

    // Fetch user with company assignments
    const user = await User.findById(userId)
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails')

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    let targetCompanyEntry = null

    if (user.role === 'superadmin') {
      // Super admin can switch to any active company
      const targetCompany = await Company.findById(companyIdStr)
        .select('companyName companyCode companyEmail companyMobile contactDetails isActive')

      if (!targetCompany) {
        return res.status(404).json({
          success: false,
          message: 'Company not found'
        })
      }

      if (!targetCompany.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Company is not active'
        })
      }

      targetCompanyEntry = {
        companyId: targetCompany,
        role: user.role,
        isActive: true
      }
    } else {
      // Other roles must have the company assigned and active
      targetCompanyEntry = user.companies.find(
        (comp) =>
          comp.companyId &&
          comp.companyId._id.toString() === companyIdStr &&
          comp.isActive
      )

      if (!targetCompanyEntry) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this company or the assignment is inactive'
        })
      }
    }

    // Update default company
    // Handle both populated and non-populated companyId
    const targetCompanyId = targetCompanyEntry.companyId._id 
      ? targetCompanyEntry.companyId._id 
      : targetCompanyEntry.companyId
    
    user.defaultCompany = targetCompanyId

    // Update active role to match the assignment
    if (targetCompanyEntry.role && user.role !== targetCompanyEntry.role) {
      user.role = targetCompanyEntry.role
    }

    await user.save()

    const updatedUser = await User.findById(userId)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('hierarchy.parentUserId', 'name email role mobile')
      .populate({
        path: 'groups.groupId',
        select: 'GroupGUID GroupName GroupParent cmpcode',
        model: 'Group',
        options: { strictPopulate: false }
      })
      .populate('createdBy', 'name email')

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found after update'
      })
    }

    // Filter out inactive companies and companies with deleted/inactive companyId
    const activeCompanies = updatedUser.companies.filter(company => {
      // Skip if company assignment itself is inactive
      if (company.isActive === false) return false;
      
      // Skip if the companyId reference doesn't exist (deleted company)
      if (!company.companyId) return false;
      
      // Skip if the company itself is inactive
      if (company.companyId.isActive === false) return false;
      
      return true;
    });

    // Create a filtered user object
    const filteredUser = {
      ...updatedUser.toObject(),
      companies: activeCompanies // Only return active companies
    };

    return res.json({
      success: true,
      message: 'Company switched successfully',
      data: {
        user: filteredUser,
        activeRole: updatedUser.role
      }
    })
  } catch (error) {
    console.error('Error switching company:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to switch company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

/**
 * @swagger
 * /api/v1/user/users-by-company:
 *   get:
 *     summary: Get users by company (accessible by all roles)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Company ID (optional, uses user's default company if not provided)
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Filter by role
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
export const getUsersByCompany = async (req, res) => {
  try {
    const { companyId, role, page = 1, limit = 10 } = req.query
    const user = req.user.userDetails
    const userId = req.user.userId

    // Determine which company to query
    let targetCompanyId = companyId

    // If no companyId provided, use user's default company
    if (!targetCompanyId) {
      if (user.defaultCompany) {
        targetCompanyId = user.defaultCompany._id || user.defaultCompany
      } else {
        return res.status(400).json({
          success: false,
          message: 'No company specified and user has no default company'
        })
      }
    }

    // Convert to string for consistent comparison
    const targetCompanyIdStr = targetCompanyId.toString()

    // Check if user has access to this company
    let hasAccess = false

    // Super admin has access to all companies
    if (user.role === 'superadmin') {
      hasAccess = true
    } else {
      // Check if user has access to this company
      hasAccess = user.companies.some(comp => 
        comp.companyId._id.toString() === targetCompanyIdStr && comp.isActive
      ) || (user.defaultCompany && user.defaultCompany._id.toString() === targetCompanyIdStr)
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to access this company'
      })
    }

    // Build query based on user role and hierarchy - only active users
    let query = {
      'companies.companyId': targetCompanyId,
      'companies.isActive': true,
      isActive: true, // Only show active users
      _id: { $ne: userId } // Exclude the current user
    }

    // Add role filter if specified
    if (role) {
      query.role = role
    }

    // Helper function to get all child user IDs recursively
    const getAllChildUserIdsRecursive = async (parentUserId, companyId) => {
      const childUserIds = [];
      
      // Get direct children
      const directChildren = await User.find({
        'hierarchy.parentUser': parentUserId,
        'companies.companyId': companyId,
        'companies.isActive': true,
        isActive: true
      }).select('_id');
      
      const directChildIds = directChildren.map(child => child._id.toString());
      childUserIds.push(...directChildIds);
      
      // Recursively get children of children
      for (const childId of directChildIds) {
        const nestedChildren = await getAllChildUserIdsRecursive(childId, companyId);
        childUserIds.push(...nestedChildren);
      }
      
      return childUserIds;
    };

    // Apply hierarchy-based filtering based on actual parent-child relationships
    if (user.role !== 'superadmin') {
      if (user.role === 'admin') {
        // Admin can see all users in their company (except superadmin)
        query.role = { $nin: ['superadmin'] };
      } else {
        // For other roles, only show their child users (based on actual parent-child relationship)
        const childUserIds = await getAllChildUserIdsRecursive(userId, targetCompanyId);
        
        if (childUserIds.length === 0) {
          // No child users, return empty result
          return res.json({
            success: true,
            message: 'Users retrieved successfully',
            data: {
              users: [],
              pagination: {
                currentPage: parseInt(page),
                totalPages: 0,
                totalUsers: 0,
                hasNextPage: false,
                hasPrevPage: false
              }
            }
          });
        }
        
        // Filter to only show child users
        query._id = { $in: childUserIds };
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit)

    // Get users with pagination
    const users = await User.find(query)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))

    // Get total count for pagination
    const totalUsers = await User.countDocuments(query)

    // Calculate pagination info
    const totalPages = Math.ceil(totalUsers / parseInt(limit))
    const hasNextPage = parseInt(page) < totalPages
    const hasPrevPage = parseInt(page) > 1

    // Format users to ensure hierarchy is always included
    const formattedUsers = users.map(user => {
      const userObj = user.toObject ? user.toObject() : user;
      // Ensure hierarchy field is always present
      if (!userObj.hierarchy) {
        userObj.hierarchy = {
          parentUser: null,
          level: null
        };
      }
      return userObj;
    });

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: {
        users: formattedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit)
        }
      }
    })

  } catch (error) {
    console.error('Error fetching users by company:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    })
  }
}

/**
 * @swagger
 * /api/v1/user/role/{role}:
 *   get:
 *     summary: Get users by role (accessible by all roles)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *         description: User role to filter by
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params
    const user = req.user.userDetails
    const userId = req.user.userId

    // Check if user has permission to view this role
    let hasPermission = false

    if (user.role === 'superadmin') {
      hasPermission = true
    } else if (user.role === 'admin') {
      hasPermission = true
    } else if (user.role === 'zonal' && ['rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer'].includes(role)) {
      hasPermission = true
    } else if (user.role === 'rsm' && ['asm', 'salesman', 'dealers', 'distibutors', 'subdealer'].includes(role)) {
      hasPermission = true
    } else if (user.role === 'asm' && ['salesman', 'dealers', 'distibutors', 'subdealer'].includes(role)) {
      hasPermission = true
    } else if (user.role === 'salesman' && ['dealers', 'distibutors', 'subdealer'].includes(role)) {
      hasPermission = true
    } else if (user.role === 'distibutors' && ['dealers', 'subdealer'].includes(role)) {
      hasPermission = true
    } else if (user.role === 'dealers' && ['subdealer'].includes(role)) {
      hasPermission = true
    }

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this role'
      })
    }

    // Get user's current default company ID only
    const currentCompanyId = user.defaultCompany?._id || user.defaultCompany;

    if (!currentCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'No company selected'
      });
    }

    console.log('getUsersByRole - User:', user.name, 'Role:', user.role, 'Mobile:', user.mobile);
    console.log('getUsersByRole - Current Company ID:', currentCompanyId);
    console.log('getUsersByRole - Requested role:', role);
    console.log('getUsersByRole - User groups from token:', user.groups);

    // Fetch full user details with groups to ensure we have complete information
    const fullUser = await User.findById(userId).select('groups');
    console.log('getUsersByRole - Full user groups from DB:', fullUser?.groups);

    // Build query - filter by current company only, only active users
    const query = {
      role: role,
      companies: {
        $elemMatch: {
          companyId: currentCompanyId,
          isActive: true
        }
      },
      isActive: true, // Only show active users
      _id: { $ne: userId }
    }

    console.log('getUsersByRole - Query:', JSON.stringify(query, null, 2));

    // Debug: Count all subdealers vs matching ones
    if (role === 'subdealer') {
      const allSubDealersCount = await User.countDocuments({ role: 'subdealer', isActive: true });
      const matchingCount = await User.countDocuments(query);
      console.log(`getUsersByRole - Total active subdealers in DB: ${allSubDealersCount}`);
      console.log(`getUsersByRole - Active subdealers matching query: ${matchingCount}`);
      
      // Also check which subdealers don't match
      const allSubDealers = await User.find({ role: 'subdealer', isActive: true })
        .select('name email companies.companyId companies.isActive isActive');
      console.log('getUsersByRole - All active subdealers:', allSubDealers.map(sd => ({
        name: sd.name,
        companies: sd.companies,
        isActive: sd.isActive
      })));
    }

    // Get users from current query (users in same group or accessible groups)
    let users = await User.find(query)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .sort({ createdAt: -1 })

    console.log(`getUsersByRole - Found ${users.length} users with role ${role} in base query`);

    // Special handling for dealers: include child group dealers based on group hierarchy
    // Use fullUser.groups instead of user.groups to ensure we have the latest data
    const userGroups = fullUser?.groups || user.groups || [];
    
    if (role === 'dealers' && userGroups && userGroups.length > 0) {
      console.log('getUsersByRole - Checking for child group dealers...');
      console.log('getUsersByRole - User has', userGroups.length, 'groups');
      
      // Get user's active groups
      const userActiveGroups = userGroups.filter(g => g.isActive);
      console.log('getUsersByRole - User active groups:', userActiveGroups.map(g => ({
        groupGUID: g.groupGUID,
        groupName: g.groupName,
        cmpcode: g.cmpcode
      })));
      
      // Find all child groups for each of user's groups
      const allChildGroupGUIDs = [];
      const groupMapping = new Map(); // Map GroupGUID to GroupName
      
      for (const userGroup of userActiveGroups) {
        if (userGroup.groupGUID) {
          // Add user's own group to mapping
          groupMapping.set(userGroup.groupGUID, userGroup.groupName);
          
          // Find all child groups recursively
          const childGroups = await findAllChildGroups(userGroup.groupGUID, userGroup.cmpcode, currentCompanyId);
          console.log(`getUsersByRole - Found ${childGroups.length} child groups for ${userGroup.groupName} (${userGroup.groupGUID})`);
          
          for (const childGroup of childGroups) {
            allChildGroupGUIDs.push(childGroup.GroupGUID);
            groupMapping.set(childGroup.GroupGUID, childGroup.GroupName);
          }
        }
      }
      
      console.log('getUsersByRole - Total child group GUIDs:', allChildGroupGUIDs);
      
      if (allChildGroupGUIDs.length > 0) {
        // Find dealers that belong to child groups
        const childGroupDealers = await User.find({
          role: 'dealers',
          companies: {
            $elemMatch: {
              companyId: currentCompanyId,
              isActive: true
            }
          },
          isActive: true,
          _id: { $ne: userId },
          'groups.groupGUID': { $in: allChildGroupGUIDs },
          'groups.isActive': true
        })
          .select('-password')
          .populate('companies.companyId', 'companyName companyCode')
          .populate('hierarchy.parentUser', 'name email role')
          .sort({ createdAt: -1 });
        
        console.log(`getUsersByRole - Found ${childGroupDealers.length} dealers from child groups`);
        
        // Merge with existing dealers, avoiding duplicates
        const existingIds = new Set(users.map(u => u._id.toString()));
        const newDealers = childGroupDealers.filter(d => !existingIds.has(d._id.toString()));
        
        users = [...users, ...newDealers];
        console.log(`getUsersByRole - Total dealers after adding child group dealers: ${users.length}`);
      }
      
      // Add group information to each dealer
      const usersWithGroupInfo = users.map(dealerUser => {
        const userObj = dealerUser.toObject ? dealerUser.toObject() : dealerUser;
        
        // Get the first active group for display
        const primaryGroup = userObj.groups?.find(g => g.isActive);
        
        if (primaryGroup && primaryGroup.groupGUID) {
          // Use the group name from groupMapping if available, otherwise use stored name
          const groupName = groupMapping.get(primaryGroup.groupGUID) || primaryGroup.groupName;
          
          return {
            ...userObj,
            groupInfo: {
              groupGUID: primaryGroup.groupGUID,
              groupName: groupName,
              groupParentUser: primaryGroup.groupParentUser
            }
          };
        }
        
        return {
          ...userObj,
          groupInfo: null
        };
      });
      
      console.log(`getUsersByRole - Returning ${usersWithGroupInfo.length} dealers with group info`);
      
      return res.json({
        success: true,
        message: `Users with role ${role} retrieved successfully`,
        data: {
          users: usersWithGroupInfo,
          role,
          count: usersWithGroupInfo.length
        }
      });
    }

    // For non-dealer roles, return users as-is
    res.json({
      success: true,
      message: `Users with role ${role} retrieved successfully`,
      data: {
        users,
        role,
        count: users.length
      }
    })

  } catch (error) {
    console.error('Error fetching users by role:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users by role'
    })
  }
}

/**
 * @swagger
 * /api/v1/user/group-hierarchy:
 *   get:
 *     summary: Get group hierarchy with users and dealers
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Group hierarchy retrieved successfully
 */
export const getGroupHierarchy = async (req, res) => {
  try {
    const user = req.user.userDetails
    const userId = req.user.userId
    const currentCompanyId = user.defaultCompany?._id || user.defaultCompany

    if (!currentCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'No company selected'
      })
    }

    console.log('getGroupHierarchy - User:', user.name, 'Role:', user.role)

    // Fetch full user details with groups
    const fullUser = await User.findById(userId).select('groups')
    const userGroups = fullUser?.groups || user.groups || []

    if (!userGroups || userGroups.length === 0) {
      return res.json({
        success: true,
        data: {
          hierarchy: [],
          totalGroups: 0,
          totalUsers: 0
        }
      })
    }
    const company = await Company.findById(currentCompanyId)
    // Get user's active groups for the current company only
    const userActiveGroups = userGroups.filter(g => {
      return g.isActive && g.cmpcode === company.companyCode
    })
    console.log('getGroupHierarchy - User active groups for current company:', userActiveGroups.length)

    // Get company for cmpcode
   
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      })
    }

    // Helper function to build hierarchy for a group
    const buildGroupHierarchy = async (groupGUID, groupName, level = 0, visitedGroups = new Set()) => {
      // Prevent infinite loops by tracking visited groups
      if (visitedGroups.has(groupGUID)) {
        return null
      }
      
      visitedGroups.add(groupGUID)
      
      const hierarchy = {
        groupGUID,
        groupName,
        level,
        users: [],
        dealers: [],
        childGroups: []
      }

      // Find users in this group
      const usersInGroup = await User.find({
        'groups.groupGUID': groupGUID,
        'groups.isActive': true,
        'companies.companyId': currentCompanyId,
        'companies.isActive': true,
        isActive: true,
        _id: { $ne: userId }
      }).select('name email mobile role groups').lean()

      hierarchy.users = usersInGroup.map(u => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        role: u.role
      }))

      // Find dealers in this group (both User dealers and Ledger dealers)
      try {
        const groupDoc = await Group.findOne({
          GroupGUID: groupGUID,
          cmpcode: company.companyCode,
          isActive: true
        })

        if (groupDoc) {
          // Find User dealers with this group
          const userDealersInGroup = await User.find({
            role: 'dealers',
            'groups.groupId': groupDoc._id,
            'groups.isActive': true,
            'companies.companyId': currentCompanyId,
            'companies.isActive': true,
            isActive: true
          }).select('name email mobile').lean()

          // Find Ledger dealers with this group
          const ledgerDealersInGroup = await Ledger.find({
            groupId: groupDoc._id,
            companyId: currentCompanyId,
            isActive: true
          }).select('LedgerGUID LedgerName Email LedgerMobile').lean()

          // Combine both types of dealers
          hierarchy.dealers = [
            ...userDealersInGroup.map(d => ({
              _id: d._id,
              name: d.name,
              email: d.email,
              mobile: d.mobile,
              type: 'user'
            })),
            ...ledgerDealersInGroup.map(d => ({
              _id: d._id,
              name: d.LedgerName,
              email: d.Email || '',
              mobile: d.LedgerMobile || '',
              type: 'ledger',
              LedgerGUID: d.LedgerGUID  // ✅ Added for voucher fetching
            }))
          ]
          
          // Dealers fetched successfully
        } else {
          console.log(`⚠️ Group "${groupName}" (${groupGUID}): Group document not found in database`)
          hierarchy.dealers = [] // Ensure it's an array
        }
      } catch (error) {
        console.log('Error fetching dealers for group:', error)
        hierarchy.dealers = [] // Ensure it's an array even on error
      }

      // ⚠️ REMOVED redundant findAllChildGroups call here - we do direct query below
      
      // Build hierarchy for each direct child
      // Now use the user-based hierarchy instead of GroupParent GUID matching
      // Get users in current group (INCLUDING the current logged-in user)
      const usersInCurrentGroup = usersInGroup.map(u => u._id.toString())
      
      // IMPORTANT: Also include the current logged-in user's ID
      // because they might be the only user in this group
      const allUsersInGroup = [...usersInCurrentGroup, userId.toString()]
      
      // ALSO include the current group's GUID to handle groups created before users were assigned
      const parentSearchCriteria = [groupGUID, ...allUsersInGroup]
      
      // Find the current group's document to get its _id
      const currentGroupDoc = await Group.findOne({
        GroupGUID: groupGUID,
        cmpcode: company.companyCode,
        isActive: true
      }).select('_id')
      
      // Find groups where GroupParent equals user IDs OR the current group's GUID
      // IMPORTANT: Exclude the current group itself to prevent infinite loops
      const directChildren = await Group.find({
        GroupParent: { $in: parentSearchCriteria }, // ✅ Check user IDs AND Group GUID
        _id: { $ne: currentGroupDoc?._id }, // Exclude current group
        cmpcode: company.companyCode,
        companyId: currentCompanyId,
        isActive: true
      }).select('GroupGUID GroupName')

      for (const child of directChildren) {
        const childHierarchy = await buildGroupHierarchy(
          child.GroupGUID,
          child.GroupName,
          level + 1,
          visitedGroups // ✅ Pass the SAME Set, not a copy
        )
        // Only add if not null (null means already visited)
        if (childHierarchy) {
          hierarchy.childGroups.push(childHierarchy)
        }
      }

      return hierarchy
    }

    // Build hierarchy for each user's group
    const hierarchies = []
    const processedGroups = new Set()

    for (const userGroup of userActiveGroups) {
      if (userGroup.groupGUID && !processedGroups.has(userGroup.groupGUID)) {
        processedGroups.add(userGroup.groupGUID)
        const groupHierarchy = await buildGroupHierarchy(
          userGroup.groupGUID,
          userGroup.groupName
        )
        // Only add if not null (could be null if already visited)
        if (groupHierarchy) {
          hierarchies.push(groupHierarchy)
        }
      }
    }

    // Count totals
    const countTotals = (hierarchy) => {
      let totalUsers = hierarchy.users.length
      let totalDealers = hierarchy.dealers.length
      let totalGroups = 1

      for (const child of hierarchy.childGroups) {
        const childTotals = countTotals(child)
        totalUsers += childTotals.users
        totalDealers += childTotals.dealers
        totalGroups += childTotals.groups
      }

      return { users: totalUsers, dealers: totalDealers, groups: totalGroups }
    }

    let totalUsers = 0
    let totalDealers = 0
    let totalGroups = 0

    hierarchies.forEach(h => {
      const totals = countTotals(h)
      totalUsers += totals.users
      totalDealers += totals.dealers
      totalGroups += totals.groups
    })

    console.log('📤 Returning group hierarchy:', {
      totalGroups,
      totalUsers,
      totalDealers,
      rootGroups: hierarchies.length,
      hierarchySummary: hierarchies.map(h => ({
        name: h.groupName,
        users: h.users.length,
        dealers: h.dealers.length,
        children: h.childGroups.length
      }))
    })

    // Prepare response data
    const responseData = {
      success: true,
      data: {
        hierarchy: hierarchies,
        totalGroups,
        totalUsers,
        totalDealers
      }
    }
    
    console.log('✅ Sending response to frontend...')
    
    try {
      // Try to send the response
      res.status(200).json(responseData)
      console.log('✅ Response sent successfully!')
    } catch (sendError) {
      console.error('❌ Error sending response:', sendError)
      // Try to send a simpler error response
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error serializing hierarchy data'
        })
      }
    }

  } catch (error) {
    console.error('❌ Error fetching group hierarchy:', error)
    console.error('Error stack:', error.stack)
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Server error while fetching group hierarchy',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    }
  }
}

/**
 * @swagger
 * /api/v1/user/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
 */
export const getUserProfile = async (req, res) => {
  try {
    console.log('=== getUserProfile called ===');
    console.log('Request user:', req.user);
    
    const userId = req.user?.userId;
    console.log('User ID:', userId);

    if (!userId) {
      console.error('No userId found in req.user');
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    console.log('Fetching user from database...');
    const user = await User.findById(userId)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('hierarchy.parentUserId', 'name email role')
      .populate('createdBy', 'name email');

    console.log('User found:', user ? 'Yes' : 'No');
    
    if (!user) {
      console.error('User not found for ID:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get profile image - return as-is for now
    // Signed URL generation can be added later once AWS SDK is properly configured
    const profileImageUrl = user.profileImage || null;
    console.log('Profile image URL:', profileImageUrl ? 'Present' : 'Not set');

    // Convert user to plain object safely
    console.log('Converting user to object...');
    let userObject;
    try {
      userObject = user.toObject ? user.toObject() : user;
      console.log('User object converted successfully');
    } catch (convertError) {
      console.error('Error converting user to object:', convertError);
      console.error('Convert error stack:', convertError.stack);
      throw convertError;
    }
    
    console.log('Sending response...');
    res.json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user: {
          ...userObject,
          profileImage: profileImageUrl
        }
      }
    });
    console.log('Response sent successfully');

  } catch (error) {
    console.error('========== ERROR IN getUserProfile ==========');
    console.error('Error message:', error.message);
    console.error('Error name:', error.name);
    console.error('Error stack:', error.stack);
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error('=============================================');
    
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user profile',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        name: error.name,
        stack: error.stack
      } : undefined
    });
  }
}

/**
 * @swagger
 * /api/v1/user/profile:
 *   put:
 *     summary: Update current user profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               mobile:
 *                 type: string
 *     responses:
 *       200:
 *         description: User profile updated successfully
 */
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.userId
    const { name, email, mobile, profileImage } = req.body

    // Check if email or mobile already exists for other users
    if (email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: userId } 
      })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists for another user'
        })
      }
    }

    if (mobile) {
      const existingUser = await User.findOne({ 
        mobile, 
        _id: { $ne: userId } 
      })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number already exists for another user'
        })
      }
    }

    // Update user
    const updateData = {}
    if (name) updateData.name = name
    if (email) updateData.email = email
    if (mobile) updateData.mobile = mobile
    if (profileImage !== undefined) updateData.profileImage = profileImage

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-password')
      .populate('defaultCompany', 'companyName companyCode')
      .populate('companies.companyId', 'companyName companyCode')

    res.json({
      success: true,
      message: 'User profile updated successfully',
      data: {
        user: updatedUser
      }
    })

  } catch (error) {
    console.error('Error updating user profile:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while updating user profile'
    })
  }
}

/**
 * @swagger
 * /api/v1/user/delete/{userId}:
 *   delete:
 *     summary: Delete a user (accessible by admin and superadmin)
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params
    const currentUser = req.user.userDetails
    const currentUserId = req.user.userId

    // Check if user is trying to delete themselves
    if (userId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      })
    }

    // Check permissions
    let hasPermission = false

    if (currentUser.role === 'superadmin') {
      hasPermission = true
    } else if (currentUser.role === 'admin') {
      // Admin can only delete users from their own company
      hasPermission = true
    } else {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Only admins and super admins can delete users'
      })
    }

    // Find the user to delete
    const userToDelete = await User.findById(userId)
      .populate('companies.companyId', 'companyName companyCode')

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // For admin users, check if the user belongs to their company
    if (currentUser.role === 'admin') {
      const userCompanyIds = userToDelete.companies
        .filter(comp => comp.isActive)
        .map(comp => comp.companyId._id.toString())

      const currentUserCompanyIds = currentUser.companies
        .filter(comp => comp.isActive)
        .map(comp => comp.companyId._id.toString())

      const hasAccessToUser = userCompanyIds.some(companyId => 
        currentUserCompanyIds.includes(companyId)
      )

      if (!hasAccessToUser) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only delete users from your own company'
        })
      }
    }

    // Check if user has any active orders or important data
    // This is a basic check - you might want to add more comprehensive checks
    const userCompanies = userToDelete.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId.companyName)
      .join(', ')

    // Delete the user
    await User.findByIdAndDelete(userId)

    // Log the deletion for audit purposes
    console.log(`User ${userToDelete.name} (${userToDelete.email}) deleted by ${currentUser.name} (${currentUser.role})`)

    res.json({
      success: true,
      message: 'User deleted successfully',
      data: {
        deletedUser: {
          id: userToDelete._id,
          name: userToDelete.name,
          email: userToDelete.email,
          role: userToDelete.role,
          companies: userCompanies
        }
      }
    })

  } catch (error) {
    console.error('Error deleting user:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    })
  }
}

/**
 * @swagger
 * /api/v1/user/subdealers/by-dealer/{dealerId}:
 *   get:
 *     summary: Get subdealers created by a specific dealer
 *     description: Returns all active subdealers that were created by the specified dealer. This endpoint is used in order creation/editing to show subdealers when a dealer is selected.
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Dealer ID (can be from Ledger or User model)
 *     responses:
 *       200:
 *         description: Subdealers retrieved successfully
 *       400:
 *         description: Missing dealer ID
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const getSubDealersByDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!dealerId) {
      return res.status(400).json({
        success: false,
        message: 'Dealer ID is required'
      });
    }

    console.log('getSubDealersByDealer - Dealer ID:', dealerId);
    console.log('getSubDealersByDealer - Company ID:', companyId);

    // Get subdealers that are:
    // 1. Assigned to this dealer (via dealerId field) OR
    // 2. Created by this dealer (via createdBy field) - for backward compatibility
    const subDealers = await SubDealer.find({
      $or: [
        { dealerId: dealerId },      // Assigned to this dealer
        { createdBy: dealerId }       // Created by this dealer (backward compatibility)
      ],
      companyId: companyId,
      isActive: true
    })
      .select('_id SDName SDType SDAddress1 SDAddress2 SDAddress3 SDState SDCountry SDPincode SDContactPerson SDMobileNo SDEmail SDGSTNType SDGSTNNumber dealerId groupId isActive createdAt')
      .populate('dealerId', 'LedgerGUID LedgerName LedgerMobile Email')
      .populate('groupId', 'GroupName GroupGUID')
      .sort({ SDName: 1 })
      .lean();

    // Format subdealers for frontend compatibility
    const formattedSubDealers = subDealers.map(subdealer => ({
      _id: subdealer._id.toString(),
      SDName: subdealer.SDName,
      name: subdealer.SDName, // For backward compatibility
      SDType: subdealer.SDType,
      SDAddress1: subdealer.SDAddress1 || '',
      SDAddress2: subdealer.SDAddress2 || '',
      SDAddress3: subdealer.SDAddress3 || '',
      SDState: subdealer.SDState || '',
      SDCountry: subdealer.SDCountry || 'India',
      SDPincode: subdealer.SDPincode || '',
      SDContactPerson: subdealer.SDContactPerson || '',
      SDMobileNo: subdealer.SDMobileNo || '',
      mobile: subdealer.SDMobileNo || '', // For backward compatibility
      SDEmail: subdealer.SDEmail || '',
      email: subdealer.SDEmail || '', // For backward compatibility
      SDGSTNType: subdealer.SDGSTNType || '',
      SDGSTNNumber: subdealer.SDGSTNNumber || '',
      address: {
        street: subdealer.SDAddress1 || '',
        city: subdealer.SDAddress2 || '',
        state: subdealer.SDState || '',
        pincode: subdealer.SDPincode || '',
        country: subdealer.SDCountry || 'India',
      },
      dealerId: subdealer.dealerId,      // Include dealer assignment
      groupId: subdealer.groupId,
      isActive: subdealer.isActive,
      createdAt: subdealer.createdAt
    }));

    console.log('getSubDealersByDealer - Found subdealers:', formattedSubDealers.length);

    return res.json({
      success: true,
      data: {
        subdealers: formattedSubDealers,
        totalSubDealers: formattedSubDealers.length
      }
    });
  } catch (error) {
    console.error('Error getting subdealers by dealer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get subdealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};