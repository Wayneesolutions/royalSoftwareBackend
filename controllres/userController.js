import User from '../models/user/userModel.js'
import Company from '../models/company/companyModel.js'

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

    return res.json({
      success: true,
      message: 'Company switched successfully',
      data: {
        user: updatedUser,
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

    console.log('getUsersByRole - User:', user.name, 'Role:', user.role);
    console.log('getUsersByRole - Current Company ID:', currentCompanyId);
    console.log('getUsersByRole - Requested role:', role);

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

    // Get users
    const users = await User.find(query)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .sort({ createdAt: -1 })

    console.log(`getUsersByRole - Found ${users.length} users with role ${role}`);

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
    const userId = req.user.userId

    const user = await User.findById(userId)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email')

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    res.json({
      success: true,
      message: 'User profile retrieved successfully',
      data: {
        user
      }
    })

  } catch (error) {
    console.error('Error fetching user profile:', error)
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user profile'
    })
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
    const { name, email, mobile } = req.body

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