import User from "../models/user/userModel.js"
import Company from "../models/company/companyModel.js"
import bcrypt from 'bcryptjs'

export const getUserById = async (req,res) =>{
    try {
        const { id } = req.params 
        const user = await User.findById(id)
        return res.json({
            success:true,
            message:"user details",
            data:user
        })
    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}
/**
 * @swagger
 * /api/v1/admin/users-by-company:
 *   get:
 *     summary: Get all users in admin's company
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Company ID (optional, uses default if not provided)
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
    const adminId = req.user.userId;
    const { companyId, role, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Get admin's companies
    const admin = await User.findById(adminId);
    const targetCompanyId = companyId || admin.defaultCompany;

    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'No company selected'
      });
    }

    // Verify admin has access to this company
    const hasAccess = admin.companies.some(
      comp => comp.companyId.toString() === targetCompanyId && comp.isActive
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    // Build query - exclude superadmin and admin users, only active users
    const query = {
      'companies.companyId': targetCompanyId,
      'companies.isActive': true,
      isActive: true, // Only show active users
      role: { $nin: ['admin', 'superadmin'] } // Exclude superadmin and admin users
    };

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);

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

    return res.json({
      success: true,
      data: {
        users: formattedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error getting users by company:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const adminId = req.user.userId;

    // Validate the role against unified roles list
    const allowedRoles = ['zonal', 'rsm', 'asm', 'salesman', 'dealers', 'subdealer', 'distibutors'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role'
      });
    }

    // Get admin's current default company (not all companies)
    const admin = await User.findById(adminId);
    const currentCompanyId = admin.defaultCompany;

    if (!currentCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'No company selected'
      });
    }

    // Filter by current default company only, only active users
    const users = await User.find({
      role,
      'companies.companyId': currentCompanyId,
      'companies.isActive': true,
      isActive: true // Only show active users
    })
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role');

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error getting users by role:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users by role',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/create-user:
 *   post:
 *     summary: Create a new user in the hierarchy
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - mobile
 *               - role
 *               - companyId
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               mobile:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: ['zonal', 'rsm', 'asm', 'salesman', 'dealers', 'subdealer', 'distibutors']
 *               companyId:
 *                 type: string
 *                 description: Company ID to assign user to
 *               parentUserId:
 *                 type: string
 *                 description: Parent user ID in hierarchy (optional)
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Bad request (validation error, user already exists, or company user limit reached)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Company has reached its user limit. Maximum allowed users: 10. Current users: 10. Cannot create more users."
 *       403:
 *         description: Access denied
 */
export const createUser = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      name, 
      mobile, 
      role, 
      companyId, 
      parentUserId,
      address,
      subdealerDetails
    } = req.body;
    const adminId = req.user.userId;

    // Validate required fields
    if (!email || !password || !name || !mobile || !role || !companyId) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: email, password, name, mobile, role, companyId'
      });
    }

    // Validate role
    const allowedRoles = ['zonal', 'rsm', 'asm', 'salesman', 'dealers', 'subdealer', 'distibutors'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Allowed roles: ' + allowedRoles.join(', ')
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { mobile }]
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or mobile already exists'
      });
    }

    // Verify admin has access to this company
    const admin = await User.findById(adminId);
    const hasAccess = admin.companies.some(
      comp => comp.companyId.toString() === companyId && comp.isActive
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this company'
      });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check user limit for the company
    if (company.maxUser) {
      // Count current active users for this company (excluding admin and superadmin)
      const currentUserCount = await User.countDocuments({
        'companies.companyId': companyId,
        'companies.isActive': true,
        isActive: true,
        role: { $nin: ['admin', 'superadmin'] }
      });

      if (currentUserCount >= company.maxUser) {
        return res.status(400).json({
          success: false,
          message: `Company has reached its user limit. Maximum allowed users: ${company.maxUser}. Current users: ${currentUserCount}. Cannot create more users.`
        });
      }
    }

    // Set hierarchy level based on role
    const roleLevels = {
      'zonal': 2,
      'rsm': 3,
      'asm': 4,
      'salesman': 5,
      'dealers': 6,
      'subdealer': 7,
      'distibutors': 6
    };

    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare address data with defaults
    const addressData = {
      street: address?.street || '',
      city: address?.city || '',
      state: address?.state || '',
      pincode: address?.pincode || '',
      country: address?.country || 'India'
    };

    // Prepare subdealer details if role is subdealer
    let subdealerData = undefined;
    if (role === 'subdealer' && subdealerDetails) {
      subdealerData = {
        SDName: subdealerDetails.SDName || subdealerDetails.sdName || '',
        SDType: subdealerDetails.SDType || subdealerDetails.sdType || '',
        SDAddress1: subdealerDetails.SDAddress1 || subdealerDetails.sdAddress1 || '',
        SDAddress2: subdealerDetails.SDAddress2 || subdealerDetails.sdAddress2 || '',
        SDAddress3: subdealerDetails.SDAddress3 || subdealerDetails.sdAddress3 || '',
        SDState: subdealerDetails.SDState || subdealerDetails.sdState || '',
        SDCountry: subdealerDetails.SDCountry || subdealerDetails.sdCountry || 'India',
        SDPincode: subdealerDetails.SDPincode || subdealerDetails.sdPincode || '',
        SDContactPerson: subdealerDetails.SDContactPerson || subdealerDetails.sdContactPerson || '',
        SDMobileNo: subdealerDetails.SDMobileNo || subdealerDetails.sdMobileNo || '',
        SDEmail: subdealerDetails.SDEmail || subdealerDetails.sdEmail || '',
        SDGSTNType: subdealerDetails.SDGSTNType || subdealerDetails.sdGSTNType || '',
        SDGSTNNumber: subdealerDetails.SDGSTNNumber || subdealerDetails.sdGSTNNumber || ''
      };
    }

    // Create user
    const userData = {
      email,
      password: hashedPassword,
      name,
      mobile,
      role,
      address: addressData,
      companies: [{
        companyId: companyId,
        role: role,
        isActive: true,
        assignedBy: adminId
      }],
      hierarchy: {
        parentUser: parentUserId || adminId,
        level: roleLevels[role] || 5
      },
      createdBy: adminId
    };

    // Add subdealer details if role is subdealer
    if (role === 'subdealer' && subdealerData) {
      userData.subdealerDetails = subdealerData;
    }

    const newUser = await User.create(userData);

    // Return user without password
    const userResponse = await User.findById(newUser._id)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    return res.status(201).json({
      success: true,
      message: `${role} created successfully`,
      data: userResponse
    });
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/edit-user/{userId}:
 *   put:
 *     summary: Edit a user (admin only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID to edit
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
 *                 format: email
 *               mobile:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: ['zonal', 'rsm', 'asm', 'salesman', 'dealers', 'subdealer', 'distibutors']
 *               isActive:
 *                 type: boolean
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   pincode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 */
export const editUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      name, 
      email, 
      mobile, 
      role, 
      isActive,
      address,
      subdealerDetails
    } = req.body;
    const adminId = req.user.userId;

    // Validate required fields
    if (!name || !mobile || !role) {
      return res.status(400).json({
        success: false,
        message: 'Required fields: name, mobile, role'
      });
    }

    // Validate role
    const allowedRoles = ['zonal', 'rsm', 'asm', 'salesman', 'dealers', 'subdealer', 'distibutors'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Allowed roles: ' + allowedRoles.join(', ')
      });
    }

    // Find the user to edit
    const userToEdit = await User.findById(userId);
    if (!userToEdit) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify admin has access to this user's company
    const admin = await User.findById(adminId);
    const userCompanyIds = userToEdit.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId.toString());

    const hasAccess = admin.companies.some(comp => 
      comp.isActive && userCompanyIds.includes(comp.companyId.toString())
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to edit this user'
      });
    }

    // Check if email or mobile already exists for other users
    if (email) {
      const existingUser = await User.findOne({ 
        email, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists for another user'
        });
      }
    }

    if (mobile) {
      const existingUser = await User.findOne({ 
        mobile, 
        _id: { $ne: userId } 
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Mobile number already exists for another user'
        });
      }
    }

    // Prepare update data
    const updateData = {
      name,
      mobile,
      role,
      isActive: isActive !== undefined ? isActive : userToEdit.isActive
    };

    // Add email if provided
    if (email) {
      updateData.email = email;
      updateData.userName = email; // Update username as well
    }

    // Add address if provided
    if (address) {
      updateData.address = {
        street: address.street || userToEdit.address?.street || '',
        city: address.city || userToEdit.address?.city || '',
        state: address.state || userToEdit.address?.state || '',
        pincode: address.pincode || userToEdit.address?.pincode || '',
        country: address.country || userToEdit.address?.country || 'India'
      };
    }

    // Update subdealer details if role is subdealer
    if (role === 'subdealer' && subdealerDetails) {
      updateData.subdealerDetails = {
        SDName: subdealerDetails.SDName !== undefined ? subdealerDetails.SDName : (userToEdit.subdealerDetails?.SDName || ''),
        SDType: subdealerDetails.SDType !== undefined ? subdealerDetails.SDType : (userToEdit.subdealerDetails?.SDType || ''),
        SDAddress1: subdealerDetails.SDAddress1 !== undefined ? subdealerDetails.SDAddress1 : (userToEdit.subdealerDetails?.SDAddress1 || ''),
        SDAddress2: subdealerDetails.SDAddress2 !== undefined ? subdealerDetails.SDAddress2 : (userToEdit.subdealerDetails?.SDAddress2 || ''),
        SDAddress3: subdealerDetails.SDAddress3 !== undefined ? subdealerDetails.SDAddress3 : (userToEdit.subdealerDetails?.SDAddress3 || ''),
        SDState: subdealerDetails.SDState !== undefined ? subdealerDetails.SDState : (userToEdit.subdealerDetails?.SDState || ''),
        SDCountry: subdealerDetails.SDCountry !== undefined ? subdealerDetails.SDCountry : (userToEdit.subdealerDetails?.SDCountry || 'India'),
        SDPincode: subdealerDetails.SDPincode !== undefined ? subdealerDetails.SDPincode : (userToEdit.subdealerDetails?.SDPincode || ''),
        SDContactPerson: subdealerDetails.SDContactPerson !== undefined ? subdealerDetails.SDContactPerson : (userToEdit.subdealerDetails?.SDContactPerson || ''),
        SDMobileNo: subdealerDetails.SDMobileNo !== undefined ? subdealerDetails.SDMobileNo : (userToEdit.subdealerDetails?.SDMobileNo || ''),
        SDEmail: subdealerDetails.SDEmail !== undefined ? subdealerDetails.SDEmail : (userToEdit.subdealerDetails?.SDEmail || ''),
        SDGSTNType: subdealerDetails.SDGSTNType !== undefined ? subdealerDetails.SDGSTNType : (userToEdit.subdealerDetails?.SDGSTNType || ''),
        SDGSTNNumber: subdealerDetails.SDGSTNNumber !== undefined ? subdealerDetails.SDGSTNNumber : (userToEdit.subdealerDetails?.SDGSTNNumber || '')
      };
    } else if (role !== 'subdealer') {
      // Clear subdealer details if role changed from subdealer to something else
      updateData.subdealerDetails = undefined;
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    )
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });

  } catch (error) {
    console.error('User edit error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
