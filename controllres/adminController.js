import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user/userModel.js";
import Company from "../models/company/companyModel.js";
// Admin Signup
export const adminCreation = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password || !role || !name) {
      return res.json({success:false, message: "All fields are required" });
    }
    
    // Check if user already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.json({success:false, message: "Admin already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const newAdmin = await User.create({
      email,
      password: hashedPassword,
      role,
      name,
    });

    res.json({
        success:true,
      message: "Admin created successfully",
      admin: {
        _id: newAdmin._id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error("Admin creation error:", error);
    res.json({success:false ,message: "Server error" });
  }
};

/**
 * @swagger
 * /api/v1/admin/login:
 *   post:
 *     summary: Admin login with company details (email or mobile)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - emailOrMobile
 *               - password
 *             properties:
 *               emailOrMobile:
 *                 type: string
 *                 description: Admin email address or mobile number
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful with company details
 *       400:
 *         description: Invalid credentials
 */
// Admin Login
export const adminLogin = async (req, res) => {
  try {
    const { emailOrMobile, email, mobile, password } = req.body;

    // Support both old format (email) and new format (emailOrMobile)
    const identifier = emailOrMobile || email || mobile;

    if (!identifier || !password) {
      return res.status(400).json({
        success: false, 
        message: "Email/Mobile and password required" 
      });
    }

    // Determine if identifier is email or mobile
    const isEmail = identifier.includes('@');
    const isMobile = /^[0-9]{10,}$/.test(identifier.replace(/[\s\-+()]/g, ''));

    // Build query to find admin by email or mobile
    let adminQuery = { role: "admin" };
    if (isEmail) {
      adminQuery.email = identifier.toLowerCase().trim();
    } else if (isMobile) {
      adminQuery.mobile = identifier.replace(/[\s\-+()]/g, '');
    } else {
      // Try both email and mobile
      adminQuery.$or = [
        { email: identifier.toLowerCase().trim() },
        { mobile: identifier.replace(/[\s\-+()]/g, '') }
      ];
    }

    const admin = await User.findOne(adminQuery)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails');

    if (!admin) {
      return res.status(401).json({
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // Verify password
    const adminWithPassword = await User.findOne({ _id: admin._id, role: "admin" });
    const isPasswordCorrect = await bcrypt.compare(password, adminWithPassword.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // Update last login
    await User.findByIdAndUpdate(admin._id, { lastLogin: new Date() });

    // Generate token
    const token = jwt.sign(
      { userId: admin._id, role: admin.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        admin: {
          _id: admin._id,
          email: admin.email,
          name: admin.name,
          mobile: admin.mobile,
          role: admin.role,
          defaultCompany: admin.defaultCompany,
          companies: admin.companies
        },
        token
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false, 
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
/**
 * @swagger
 * /api/v1/admin/switch-company:
 *   post:
 *     summary: Switch admin's default company
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
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: Company ID to switch to
 *     responses:
 *       200:
 *         description: Company switched successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 */
export const switchCompany = async (req, res) => {
  try {
    const { companyId } = req.body;
    const adminId = req.user.userId;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    // Verify admin has access to this company
    const admin = await User.findById(adminId)
      .populate('companies.companyId', '_id companyName companyCode');

    // Convert companyId to string for consistent comparison
    const companyIdStr = companyId.toString();

    const hasAccess = admin.companies.some(
      comp => comp.companyId._id.toString() === companyIdStr && comp.isActive
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this company'
      });
    }

    // Update default company
    await User.findByIdAndUpdate(adminId, { defaultCompany: companyId });

    // Return updated admin data
    const updatedAdmin = await User.findById(adminId)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails');

    return res.json({
      success: true,
      message: 'Company switched successfully',
      data: {
        admin: {
          _id: updatedAdmin._id,
          email: updatedAdmin.email,
          name: updatedAdmin.name,
          mobile: updatedAdmin.mobile,
          role: updatedAdmin.role,
          defaultCompany: updatedAdmin.defaultCompany,
          companies: updatedAdmin.companies
        }
      }
    });
  } catch (error) {
    console.error('Error switching company:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/company-data:
 *   get:
 *     summary: Get current company data and statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Company ID (optional, uses default if not provided)
 *     responses:
 *       200:
 *         description: Company data retrieved successfully
 */
export const getCompanyData = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const { companyId } = req.query;

    // Get admin with company details
    const admin = await User.findById(adminId)
      .populate('defaultCompany')
      .populate('companies.companyId');

    const targetCompanyId = companyId || admin.defaultCompany?._id;

    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'No company selected'
      });
    }

    // Convert targetCompanyId to string for consistent comparison
    const targetCompanyIdStr = targetCompanyId.toString();

    // Debug logging
    console.log('Admin ID:', adminId);
    console.log('Target Company ID:', targetCompanyIdStr);
    console.log('Admin companies:', admin.companies.map(comp => ({
      companyId: comp.companyId._id.toString(),
      isActive: comp.isActive
    })));
    console.log('Default company:', admin.defaultCompany?._id?.toString());

    // Verify access to company - check both direct company access and default company
    const hasAccess = admin.companies.some(
      comp => comp.companyId._id.toString() === targetCompanyIdStr && comp.isActive
    ) || admin.defaultCompany?._id.toString() === targetCompanyIdStr;

    console.log('Has access:', hasAccess);

    if (!hasAccess) {
      // If admin has no companies assigned, return a helpful message
      if (!admin.companies || admin.companies.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'No companies assigned to this admin. Please contact super admin to assign companies.'
        });
      }
      
      return res.status(403).json({
        success: false,
        message: 'Access denied to this company'
      });
    }

    // Get company details
    const company = await Company.findById(targetCompanyId)
      .populate('createdBy', 'name email')
      .populate('assignedAdmins.adminId', 'name email');

    // Get user statistics for this company (exclude superadmin and admin, only active users)
    const userStats = await User.aggregate([
      {
        $match: {
          'companies.companyId': targetCompanyId,
          'companies.isActive': true,
          isActive: true, // Only count active users
          role: { $nin: ['admin', 'superadmin'] }
        }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get total users in company (exclude superadmin and admin, only active users)
    const totalUsers = await User.countDocuments({
      'companies.companyId': targetCompanyId,
      'companies.isActive': true,
      isActive: true, // Only count active users
      role: { $nin: ['admin', 'superadmin'] }
    });

    return res.json({
      success: true,
      data: {
        company: {
          _id: company._id,
          companyName: company.companyName,
          companyCode: company.companyCode,
          companyEmail: company.companyEmail,
          companyMobile: company.companyMobile,
          maxUser: company.maxUser,
          contactDetails: company.contactDetails,
          settings: company.settings,
          tallySettings: company.tallySettings,
          createdBy: company.createdBy,
          assignedAdmins: company.assignedAdmins,
          createdAt: company.createdAt
        },
        statistics: {
          totalUsers,
          userByRole: userStats,
          maxUsersAllowed: company.maxUser,
          usagePercentage: Math.round((totalUsers / company.maxUser) * 100)
        }
      }
    });
  } catch (error) {
    console.error('Error getting company data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get company data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create User for Company
export const createUser = async (req, res) => {
  try {
    const { name, email, mobile, password, role, userName, address } = req.body;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Validate required fields
    if (!name || !mobile || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, mobile, password, and role are required"
      });
    }

    // Check if admin has access to the company
    const admin = await User.findById(adminId).populate('defaultCompany');
    if (!admin || !admin.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this admin"
      });
    }

    // Convert companyId to string for comparison
    const adminCompanyId = admin.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    console.log('Create User Debug:', {
      adminId,
      adminCompanyId,
      targetCompanyId,
      adminHasCompany: !!admin.defaultCompany,
      companyMatch: adminCompanyId === targetCompanyId
    });

    if (adminCompanyId !== targetCompanyId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this company"
      });
    }

    // Get company to check user limit
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: "Company not found"
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

    // Check if user already exists with same mobile or email
    const existingUser = await User.findOne({
      $or: [
        { mobile: mobile },
        ...(email ? [{ email: email }] : [])
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this mobile number or email already exists"
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare address with safe defaults
    const addressData = {
      street: address?.street || '',
      city: address?.city || '',
      state: address?.state || '',
      pincode: address?.pincode || '',
      country: address?.country || 'India'
    };

    // Create new user
    const newUser = await User.create({
      name,
      email: email || undefined,
      mobile,
      password: hashedPassword,
      role,
      userName: userName || undefined,
      address: addressData,
      defaultCompany: companyId,
      companies: [{
        companyId: companyId,
        role: role,
        isActive: true,
        assignedBy: adminId,
        assignedAt: new Date()
      }],
      hierarchy: {
        parentUser: adminId,
        level: getRoleLevel(role)
      },
      createdBy: adminId
    });

    // Update company's user count
    await Company.findByIdAndUpdate(companyId, {
      $inc: { currentUsers: 1 }
    });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        role: newUser.role,
        userName: newUser.userName,
        address: newUser.address,
        isActive: newUser.isActive
      }
    });

  } catch (error) {
    console.error("Create user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Get Users by Company
export const getUsersByCompany = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { role, page = 1, limit = 10 } = req.query;

    // Check if admin has access to the company
    const admin = await User.findById(adminId).populate('defaultCompany');
    if (!admin || !admin.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this admin"
      });
    }

    // Convert companyId to string for comparison
    const adminCompanyId = admin.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (adminCompanyId !== targetCompanyId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this company"
      });
    }

    // Build query - only active users, exclude admin and superadmin
    const query = {
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true, // Only show active users
      role: { $nin: ['admin', 'superadmin'] }, // Exclude admin and superadmin users
      _id: { $ne: adminId } // Exclude the admin user
    };

    if (role) {
      query.role = role;
    }

    // Get users with pagination
    const skip = (page - 1) * limit;
    const users = await User.find(query)
      .select('name email mobile role userName isActive address companies.$ lastLogin createdAt')
      .populate('companies.companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalUsers = await User.countDocuments(query);

    // Get company details
    const company = await Company.findById(companyId).select('companyName companyCode maxUser currentUsers');

    res.json({
      success: true,
      data: {
        users,
        company,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalUsers / limit),
          totalUsers,
          hasNext: page * limit < totalUsers,
          hasPrev: page > 1
        }
      }
    });

  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Update User Status
export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Check if admin has access to the company
    const admin = await User.findById(adminId).populate('defaultCompany');
    if (!admin || !admin.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this admin"
      });
    }

    // Convert companyId to string for comparison
    const adminCompanyId = admin.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (adminCompanyId !== targetCompanyId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this company"
      });
    }

    // Find and update user
    const user = await User.findOne({
      _id: userId,
      'companies.companyId': companyId
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Update user status
    user.isActive = isActive;
    await user.save();

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isActive: user.isActive
      }
    });

  } catch (error) {
    console.error("Update user status error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Edit User
export const editUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, mobile, role, userName, isActive, address } = req.body;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    console.log('🔍 Edit User - Received data:', {
      userId,
      name,
      email,
      mobile,
      role,
      userName,
      isActive,
      address
    });

    // Validate required fields
    if (!name || !mobile || !role) {
      return res.status(400).json({
        success: false,
        message: "Name, mobile, and role are required"
      });
    }

    // Check if admin has access to the company
    const admin = await User.findById(adminId).populate('defaultCompany');
    if (!admin || !admin.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this admin"
      });
    }

    // Convert companyId to string for comparison
    const adminCompanyId = admin.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (adminCompanyId !== targetCompanyId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this company"
      });
    }

    // Find the user to edit
    const userToEdit = await User.findOne({
      _id: userId,
      'companies.companyId': companyId
    });

    if (!userToEdit) {
      return res.status(404).json({
        success: false,
        message: "User not found in your company"
      });
    }

    console.log('🔍 User before update:', {
      _id: userToEdit._id,
      name: userToEdit.name,
      email: userToEdit.email,
      mobile: userToEdit.mobile,
      role: userToEdit.role,
      address: userToEdit.address
    });

    // Check if mobile or email already exists for another user
    const existingUser = await User.findOne({
      _id: { $ne: userId },
      $or: [
        { mobile: mobile },
        ...(email ? [{ email: email }] : [])
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User with this mobile number or email already exists"
      });
    }

    // Update user details
    userToEdit.name = name;
    userToEdit.mobile = mobile;
    userToEdit.role = role;
    userToEdit.isActive = isActive !== undefined ? isActive : userToEdit.isActive;
    
    if (email) {
      userToEdit.email = email;
    }
    
    if (userName) {
      userToEdit.userName = userName;
    }

    // Update address if provided
    if (address) {
      userToEdit.address = {
        street: address.street || userToEdit.address?.street || '',
        city: address.city || userToEdit.address?.city || '',
        state: address.state || userToEdit.address?.state || '',
        pincode: address.pincode || userToEdit.address?.pincode || '',
        country: address.country || userToEdit.address?.country || 'India'
      };
    }

    // Update the role in the companies array
    const companyIndex = userToEdit.companies.findIndex(
      comp => comp.companyId.toString() === companyId.toString()
    );
    
    if (companyIndex !== -1) {
      userToEdit.companies[companyIndex].role = role;
    }

    // Update hierarchy level if role changed
    if (userToEdit.role !== role) {
      userToEdit.hierarchy.level = getRoleLevel(role);
    }

    await userToEdit.save();

    console.log('🔍 User after update:', {
      _id: userToEdit._id,
      name: userToEdit.name,
      email: userToEdit.email,
      mobile: userToEdit.mobile,
      role: userToEdit.role,
      address: userToEdit.address
    });

    res.json({
      success: true,
      message: "User updated successfully",
      user: {
        _id: userToEdit._id,
        name: userToEdit.name,
        email: userToEdit.email,
        mobile: userToEdit.mobile,
        role: userToEdit.role,
        userName: userToEdit.userName,
        address: userToEdit.address,
        isActive: userToEdit.isActive
      }
    });

  } catch (error) {
    console.error("Edit user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Delete User
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Check if admin has access to the company
    const admin = await User.findById(adminId).populate('defaultCompany');
    if (!admin || !admin.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this admin"
      });
    }

    // Convert companyId to string for comparison
    const adminCompanyId = admin.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (adminCompanyId !== targetCompanyId) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this company"
      });
    }

    // Find the user to delete
    const userToDelete = await User.findOne({
      _id: userId,
      'companies.companyId': companyId
    });

    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        message: "User not found in your company"
      });
    }

    // Prevent admin from deleting themselves
    if (userId === adminId) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account"
      });
    }

    // Remove the company from user's companies array
    userToDelete.companies = userToDelete.companies.filter(
      comp => comp.companyId.toString() !== companyId.toString()
    );

    // If user has no companies left, deactivate the user
    if (userToDelete.companies.length === 0) {
      userToDelete.isActive = false;
      userToDelete.defaultCompany = null;
    } else {
      // Set a new default company if the deleted one was the default
      if (userToDelete.defaultCompany && userToDelete.defaultCompany.toString() === companyId.toString()) {
        userToDelete.defaultCompany = userToDelete.companies[0].companyId;
      }
    }

    await userToDelete.save();

    // Update company's user count
    await Company.findByIdAndUpdate(companyId, {
      $inc: { currentUsers: -1 }
    });

    res.json({
      success: true,
      message: "User removed from company successfully",
      user: {
        _id: userToDelete._id,
        name: userToDelete.name,
        email: userToDelete.email,
        mobile: userToDelete.mobile,
        role: userToDelete.role
      }
    });

  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

// Helper function to get role level
const getRoleLevel = (role) => {
  const roleLevels = {
    'superadmin': 0,
    'admin': 1,
    'zonal': 2,
    'rsm': 3,
    'asm': 4,
    'salesman': 5,
    'dealers': 6,
    'subdealer': 7,
    'distibutors': 8,
    'suppliers': 9
  };
  return roleLevels[role] || 10;
};
