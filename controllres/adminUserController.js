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

    // Build query
    const query = {
      'companies.companyId': targetCompanyId,
      'companies.isActive': true,
      role: { $ne: 'admin' } // Exclude other admins
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

    return res.json({
      success: true,
      data: {
        users,
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

    // Get admin's companies
    const admin = await User.findById(adminId);
    const companyIds = admin.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId);

    const users = await User.find({
      role,
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true
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
 *         description: Bad request
 *       403:
 *         description: Access denied
 */
export const createUser = async (req, res) => {
  try {
    const { email, password, name, mobile, role, companyId, parentUserId } = req.body;
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

    // Create user
    const newUser = await User.create({
      email,
      password: hashedPassword,
      name,
      mobile,
      role,
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
    });

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
