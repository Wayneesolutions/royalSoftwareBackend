import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user/userModel.js";
import Company from "../models/company/companyModel.js";
import Group from "../models/group/groupModel.js";
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

/**
 * @swagger
 * /api/v1/admin/create-user:
 *   post:
 *     summary: Create a new user with automatic group creation/assignment based on parent user
 *     description: |
 *       Creates a new user and automatically handles group assignment:
 *       1. If parentUserId is provided, the system checks if a group exists for that parent (GroupParent = parentUserId)
 *       2. If a group exists, the user is assigned to that existing group
 *       3. If no group exists, a new group is automatically created with GroupParent = parentUserId
 *       4. GroupParent in the group model is set to the UserId of the selected parent user
 *       5. Group fields (GroupGUID, GroupName, etc.) can be optionally provided, otherwise auto-generated
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
 *               - name
 *               - mobile
 *               - password
 *               - role
 *               - parentUserId
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's full name
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address (optional)
 *                 example: "john.doe@example.com"
 *               mobile:
 *                 type: string
 *                 description: User's mobile number
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: "password123"
 *               role:
 *                 type: string
 *                 enum: [zonal, rsm, asm, dealers, distibutors, subdealer, salesman]
 *                 description: User's role in the hierarchy
 *                 example: "dealers"
 *               userName:
 *                 type: string
 *                 description: Username (optional, defaults to email if provided)
 *                 example: "johndoe"
 *               parentUserId:
 *                 type: string
 *                 description: ID of the parent user (REQUIRED). A Group will be automatically created/assigned based on this parent user selection. The system will: 1) Check if a group exists for this parent (GroupParent = parentUserId), 2) If found, assign user to that group, 3) If not found, create a new group with GroupParent = parentUserId. GroupParent in the group model will be set to this UserId.
 *                 example: "692d35820e76283c26ea3050"
 *               groupId:
 *                 type: string
 *                 description: Optional - Direct group ID assignment (takes precedence over auto-creation). If provided, user will be assigned to this specific group.
 *                 example: "692ffae73b27c3bcb77698bc"
 *               groupGUID:
 *                 type: string
 *                 description: Optional - Direct group GUID assignment (takes precedence over auto-creation). If provided, user will be assigned to this specific group.
 *                 example: "GRP010"
 *               GroupGUID:
 *                 type: string
 *                 description: Optional - Group GUID for new group creation (only used if groupId/groupGUID not provided and no group exists for parent)
 *                 example: "GRP010"
 *               GroupName:
 *                 type: string
 *                 description: Optional - Group name for new group creation (defaults to "{name} - {Role}" if not provided)
 *                 example: "John Doe - Dealers"
 *               GroupParent:
 *                 type: string
 *                 description: Optional - Will be automatically set to parentUserId. This is the UserId of the selected parent user.
 *                 example: "692d35820e76283c26ea3050"
 *               cmpcode:
 *                 type: string
 *                 description: Optional - Company code (defaults to admin's company code)
 *                 example: "COM--001"
 *               Remarks:
 *                 type: string
 *                 description: Optional - Remarks for the group (defaults to "Group for {name} ({role})" if not provided)
 *                 example: "Group for John Doe (dealers)"
 *               Other1:
 *                 type: string
 *                 description: Optional - Extra field (defaults to user email if not provided)
 *                 example: "john.doe@example.com"
 *               Other2:
 *                 type: string
 *                 description: Optional - Extra field (defaults to user mobile if not provided)
 *                 example: "9876543210"
 *               Other3:
 *                 type: string
 *                 description: Optional - Extra field (defaults to user role if not provided)
 *                 example: "dealers"
 *               Other4:
 *                 type: string
 *                 description: Optional - Extra field (defaults to parent user name if not provided)
 *                 example: "Parent User Name"
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: "123 Main Street"
 *                   city:
 *                     type: string
 *                     example: "Mumbai"
 *                   state:
 *                     type: string
 *                     example: "Maharashtra"
 *                   pincode:
 *                     type: string
 *                     example: "400001"
 *                   country:
 *                     type: string
 *                     default: "India"
 *                     example: "India"
 *               subdealerDetails:
 *                 type: object
 *                 description: Required only if role is 'subdealer'
 *                 properties:
 *                   SDName:
 *                     type: string
 *                     example: "Sub Dealer Name"
 *                   SDType:
 *                     type: string
 *                     example: "Sub Dealer"
 *                   SDAddress1:
 *                     type: string
 *                   SDAddress2:
 *                     type: string
 *                   SDAddress3:
 *                     type: string
 *                   SDState:
 *                     type: string
 *                   SDCountry:
 *                     type: string
 *                     default: "India"
 *                   SDPincode:
 *                     type: string
 *                   SDContactPerson:
 *                     type: string
 *                   SDMobileNo:
 *                     type: string
 *                   SDEmail:
 *                     type: string
 *                   SDGSTNType:
 *                     type: string
 *                   SDGSTNNumber:
 *                     type: string
 *     responses:
 *       201:
 *         description: User created successfully with group assignment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User created successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "692ffae73b27c3bcb77698be"
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       example: "john.doe@example.com"
 *                     mobile:
 *                       type: string
 *                       example: "9876543210"
 *                     role:
 *                       type: string
 *                       example: "dealers"
 *                     userName:
 *                       type: string
 *                       example: "johndoe"
 *                     address:
 *                       type: object
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     groups:
 *                       type: array
 *                       description: Array of groups assigned to the user. Automatically created/assigned based on parentUserId. Empty array [] if no group assigned.
 *                       items:
 *                         type: object
 *                         properties:
 *                           groupId:
 *                             type: string
 *                             description: MongoDB ObjectId of the group
 *                             example: "692ffae73b27c3bcb77698bc"
 *                           groupGUID:
 *                             type: string
 *                             description: Group GUID (unique identifier)
 *                             example: "GRP010"
 *                           groupName:
 *                             type: string
 *                             description: Group name (e.g., "John Doe - Dealers")
 *                             example: "John Doe - Dealers"
 *                           groupParentUser:
 *                             type: string
 *                             nullable: true
 *                             description: Parent user's ID (UserId of the selected parent user). This is the GroupParent value.
 *                             example: "692d35820e76283c26ea3050"
 *                           cmpcode:
 *                             type: string
 *                             description: Company code
 *                             example: "COM--001"
 *                           remarks:
 *                             type: string
 *                             description: Remarks/notes for the group
 *                             example: "Group for John Doe (dealers)"
 *                           other1:
 *                             type: string
 *                             description: Stores user email
 *                             example: "john.doe@example.com"
 *                           other2:
 *                             type: string
 *                             description: Stores user mobile
 *                             example: "9876543210"
 *                           other3:
 *                             type: string
 *                             description: Stores user role
 *                             example: "dealers"
 *                           other4:
 *                             type: string
 *                             description: Stores parent user's name
 *                             example: "Parent User Name"
 *                           isActive:
 *                             type: boolean
 *                             description: Whether the group assignment is active
 *                             example: true
 *                           assignedBy:
 *                             type: string
 *                             description: ID of the admin who assigned the group
 *                             example: "692d34680e76283c26ea2de2"
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                             description: Timestamp when the group was assigned
 *                             example: "2025-12-03T19:56:13.179Z"
 *                     hierarchy:
 *                       type: object
 *                       description: User hierarchy information showing parent-child relationships
 *                       properties:
 *                         parentUser:
 *                           type: object
 *                           nullable: true
 *                           description: Parent user object (populated). null if no parent assigned.
 *                           properties:
 *                             _id:
 *                               type: string
 *                               example: "692d35820e76283c26ea3050"
 *                             name:
 *                               type: string
 *                               example: "Parent User Name"
 *                             email:
 *                               type: string
 *                               example: "parent@example.com"
 *                             role:
 *                               type: string
 *                               example: "rsm"
 *                             mobile:
 *                               type: string
 *                               example: "9876543215"
 *                         level:
 *                           type: number
 *                           description: Hierarchy level (0=superadmin, 1=admin, etc.)
 *                           example: 6
 *                     companies:
 *                       type: array
 *                       description: Array of companies the user belongs to
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "692ed7e3d761b86b2cbea1ab"
 *                           companyId:
 *                             type: object
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "692d33690e76283c26ea2d85"
 *                               companyName:
 *                                 type: string
 *                                 example: "Demo Company"
 *                               companyCode:
 *                                 type: string
 *                                 example: "COM--001"
 *                           role:
 *                             type: string
 *                             example: "dealers"
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           assignedBy:
 *                             type: string
 *                             example: "692d34680e76283c26ea2de2"
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-02T12:13:23.782Z"
 *                     subdealerDetails:
 *                       type: object
 *                       description: Present only if role is 'subdealer'
 *       400:
 *         description: Bad request - missing required fields or validation error
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
// Create User for Company
export const createUser = async (req, res) => {
  try {
    const { 
      name, 
      email, 
      mobile, 
      password, 
      role, 
      userName, 
      address, 
      parentUserId, 
      subdealerDetails, 
      groupId: reqGroupId, 
      groupGUID: reqGroupGUID,
      // Group fields from request
      GroupGUID: reqGroupGUIDField,
      GroupName: reqGroupName,
      GroupParent: reqGroupParent,
      cmpcode: reqCmpcode,
      Remarks: reqRemarks,
      Other1: reqOther1,
      Other2: reqOther2,
      Other3: reqOther3,
      Other4: reqOther4
    } = req.body;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Validate required fields
    console.log('Create User Request Body:', {
      name: !!name,
      mobile: !!mobile,
      password: !!password,
      role: !!role,
      email: !!email,
      hasAddress: !!address,
      groupId: !!reqGroupId,
      groupGUID: !!reqGroupGUID
    });

    if (!name || !mobile || !password || !role) {
      const missingFields = [];
      if (!name) missingFields.push('name');
      if (!mobile) missingFields.push('mobile');
      if (!password) missingFields.push('password');
      if (!role) missingFields.push('role');
      
      console.log('Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Validate parent user is required
    if (!parentUserId) {
      return res.status(400).json({
        success: false,
        message: "Parent user is required. Please select a parent user."
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
      console.log('User already exists:', {
        existingUserId: existingUser._id,
        existingEmail: existingUser.email,
        existingMobile: existingUser.mobile,
        requestedEmail: email,
        requestedMobile: mobile
      });

      // Check if user already has access to this company
      const companyIdStr = companyId.toString();
      // Handle both ObjectId and populated company objects
      const hasCompanyAccess = existingUser.companies.some(
        comp => {
          const compId = comp.companyId?._id ? comp.companyId._id.toString() : comp.companyId?.toString();
          return compId === companyIdStr;
        }
      );

      if (hasCompanyAccess) {
        // Check if the assignment is active
        const companyAssignment = existingUser.companies.find(
          comp => {
            const compId = comp.companyId?._id ? comp.companyId._id.toString() : comp.companyId?.toString();
            return compId === companyIdStr;
          }
        );

        if (companyAssignment && companyAssignment.isActive) {
          return res.status(400).json({
            success: false,
            message: "User is already assigned to this company"
          });
        } else {
          // Reactivate the assignment
          companyAssignment.isActive = true;
          companyAssignment.assignedBy = adminId;
          companyAssignment.assignedAt = new Date();
          
          // Update group if provided
          if (reqGroupId || reqGroupGUID) {
            let group = null;
            if (reqGroupId && mongoose.Types.ObjectId.isValid(reqGroupId)) {
              group = await Group.findById(reqGroupId);
            } else if (reqGroupGUID) {
              group = await Group.findOne({
                GroupGUID: reqGroupGUID,
                cmpcode: company.companyCode
              });
            }
            
            if (group && group.cmpcode === company.companyCode) {
              // Add group to groups array
              const groupIndex = existingUser.groups.findIndex(g => 
                g.groupId && g.groupId.toString() === group._id.toString()
              );
              
              if (groupIndex === -1) {
                existingUser.groups.push({
                  groupId: group._id,
                  groupGUID: group.GroupGUID,
                  groupName: group.GroupName,
                  cmpcode: group.cmpcode,
                  assignedBy: adminId,
                  isActive: true
                });
              }
              existingUser.hierarchy = {
                level: getRoleLevel(role)
              };
            }
          }
          
          await existingUser.save();

          // Update company's user count
          await Company.findByIdAndUpdate(companyId, {
            $inc: { currentUsers: 1 }
          });

          const updatedUser = await User.findById(existingUser._id)
            .select('-password')
            .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
            .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails');

          return res.status(200).json({
            success: true,
            message: "User company assignment reactivated",
            user: {
              _id: updatedUser._id,
              name: updatedUser.name,
              email: updatedUser.email,
              mobile: updatedUser.mobile,
              role: updatedUser.role,
              userName: updatedUser.userName,
              address: updatedUser.address,
              isActive: updatedUser.isActive,
              group: updatedUser.group || null,
              hierarchy: updatedUser.hierarchy || {
                level: null
              },
              companies: updatedUser.companies
            }
          });
        }
      } else {
        // User exists but doesn't have access to this company - add the company
        existingUser.companies.push({
          companyId: companyId,
          role: role,
          isActive: true,
          assignedBy: adminId,
          assignedAt: new Date()
        });

        // Update defaultCompany if user doesn't have one
        if (!existingUser.defaultCompany) {
          existingUser.defaultCompany = companyId;
        }

        await existingUser.save();

        // Update company's user count
        await Company.findByIdAndUpdate(companyId, {
          $inc: { currentUsers: 1 }
        });

        // Update group if provided
        if (reqGroupId || reqGroupGUID) {
          let group = null;
          if (reqGroupId && mongoose.Types.ObjectId.isValid(reqGroupId)) {
            group = await Group.findById(reqGroupId);
          } else if (reqGroupGUID) {
            group = await Group.findOne({
              GroupGUID: reqGroupGUID,
              cmpcode: company.companyCode
            });
          }
          
          if (group && group.cmpcode === company.companyCode) {
            // Add group to groups array
            const groupIndex = existingUser.groups.findIndex(g => 
              g.groupId && g.groupId.toString() === group._id.toString()
            );
            
            if (groupIndex === -1) {
              existingUser.groups.push({
                groupId: group._id,
                groupGUID: group.GroupGUID,
                groupName: group.GroupName,
                cmpcode: group.cmpcode,
                assignedBy: adminId,
                isActive: true
              });
            }
            existingUser.hierarchy = {
              level: getRoleLevel(role)
            };
            await existingUser.save();
          }
        }

        const updatedUser = await User.findById(existingUser._id)
          .select('-password')
          .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
          .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails')

        return res.status(200).json({
          success: true,
          message: "User assigned to company successfully",
          user: {
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            mobile: updatedUser.mobile,
            role: updatedUser.role,
            userName: updatedUser.userName,
            address: updatedUser.address,
            isActive: updatedUser.isActive,
            group: updatedUser.group || null,
            hierarchy: updatedUser.hierarchy || {
              level: null
            },
            companies: updatedUser.companies
          }
        });
      }
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

    // Validate parent user
    let finalParentUserId = adminId;
    
    if (!parentUserId) {
      return res.status(400).json({
        success: false,
        message: "Parent user is required. Please select a parent user."
      });
    }

    // Fetch parent user
    const parentUser = await User.findOne({
      _id: parentUserId,
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true
    });
    
    if (!parentUser) {
      return res.status(400).json({
        success: false,
        message: "Parent user not found or not active in this company"
      });
    }
    
    finalParentUserId = parentUserId;

    // Get parent user details for group assignment
    const parentUserForGroup = await User.findById(finalParentUserId)
      .select('name email mobile role')
      .lean();

    if (!parentUserForGroup) {
      return res.status(400).json({
        success: false,
        message: "Parent user not found"
      });
    }

    // Convert parentUserId to string for GroupParent
    const parentUserIdString = finalParentUserId.toString();

    // Initialize group variables
    let foundGroupId = null;
    let foundGroupGUID = null;
    let foundGroupName = null;
    let foundGroupParent = null;
    let foundGroupRemarks = null;
    let foundCmpcode = company.companyCode;
    let foundOther1 = null;
    let foundOther2 = null;
    let foundOther3 = null;
    let foundOther4 = null;
    let foundGroup = null;

    // Priority 1: If groupId is provided, find by ID
    if (reqGroupId && mongoose.Types.ObjectId.isValid(reqGroupId)) {
      const group = await Group.findById(reqGroupId);
      if (group && group.cmpcode === company.companyCode) {
        foundGroup = group;
        foundGroupId = group._id;
        foundGroupGUID = group.GroupGUID;
        foundGroupName = group.GroupName;
        foundGroupParent = group.GroupParent || null;
        foundGroupRemarks = group.Remarks || null;
        foundCmpcode = group.cmpcode;
        foundOther1 = group.other1 || null;
        foundOther2 = group.other2 || null;
        foundOther3 = group.other3 || null;
        foundOther4 = group.other4 || null;
      }
    }
    // Priority 2: If groupGUID is provided, find by GUID
    else if (reqGroupGUID || reqGroupGUIDField) {
      const searchGUID = reqGroupGUID || reqGroupGUIDField;
      const group = await Group.findOne({
        GroupGUID: searchGUID,
        cmpcode: company.companyCode,
        isActive: true
      });
      if (group) {
        foundGroup = group;
        foundGroupId = group._id;
        foundGroupGUID = group.GroupGUID;
        foundGroupName = group.GroupName;
        foundGroupParent = group.GroupParent || null;
        foundGroupRemarks = group.Remarks || null;
        foundCmpcode = group.cmpcode;
        foundOther1 = group.other1 || null;
        foundOther2 = group.other2 || null;
        foundOther3 = group.other3 || null;
        foundOther4 = group.other4 || null;
      }
    }
    // Priority 3: Check if a group exists for this parent user (GroupParent = parentUserId)
    else {
      const existingGroupForParent = await Group.findOne({
        GroupParent: parentUserIdString,
        cmpcode: company.companyCode,
        isActive: true
      });

      if (existingGroupForParent) {
        // Group exists for this parent - add user to that group
        foundGroup = existingGroupForParent;
        foundGroupId = existingGroupForParent._id;
        foundGroupGUID = existingGroupForParent.GroupGUID;
        foundGroupName = existingGroupForParent.GroupName;
        foundGroupParent = existingGroupForParent.GroupParent || parentUserIdString;
        foundGroupRemarks = existingGroupForParent.Remarks || null;
        foundCmpcode = existingGroupForParent.cmpcode;
        foundOther1 = existingGroupForParent.other1 || null;
        foundOther2 = existingGroupForParent.other2 || null;
        foundOther3 = existingGroupForParent.other3 || null;
        foundOther4 = existingGroupForParent.other4 || null;
      } else {
        // No group exists for this parent - create a new group
        try {
          // Use provided group fields or generate defaults
          const generatedGroupGUID = reqGroupGUIDField || await generateGroupGUID(company.companyCode);
          
          // Generate GroupName: "{name} - {Role}" or use provided
          const roleCapitalized = role === 'rsm' ? 'RSM' 
            : role === 'asm' ? 'ASM'
            : role === 'zonal' ? 'Zonal'
            : role.charAt(0).toUpperCase() + role.slice(1);
          const generatedGroupName = reqGroupName || `${name} - ${roleCapitalized}`;

          // Create new group with GroupParent = parentUserId (not GroupGUID)
          const newGroupData = {
            GroupGUID: generatedGroupGUID,
            GroupName: generatedGroupName,
            GroupParent: parentUserIdString, // ✅ GroupParent = UserId of parent user
            cmpcode: reqCmpcode || company.companyCode,
            Remarks: reqRemarks || `Group for ${name} (${role})`,
            other1: reqOther1 || email || '',
            other2: reqOther2 || mobile || '',
            other3: reqOther3 || role || '',
            other4: reqOther4 || parentUserForGroup?.name || '',
            companyId: companyId,
            isActive: true,
            tallySyncStatus: 'pending',
            tallySyncAt: new Date()
          };

          // Create group with duplicate handling
          try {
            const newGroup = await Group.create(newGroupData);
            foundGroup = newGroup;
            foundGroupId = newGroup._id;
            foundGroupGUID = newGroup.GroupGUID;
            foundGroupName = newGroup.GroupName;
            foundGroupParent = newGroup.GroupParent || parentUserIdString;
            foundGroupRemarks = newGroup.Remarks || null;
            foundCmpcode = newGroup.cmpcode;
            foundOther1 = newGroup.other1 || null;
            foundOther2 = newGroup.other2 || null;
            foundOther3 = newGroup.other3 || null;
            foundOther4 = newGroup.other4 || null;
          } catch (createError) {
            // Handle duplicate key error (race condition)
            if (createError.code === 11000) {
              // Try to find the group that was just created
              const raceConditionGroup = await Group.findOne({
                GroupGUID: generatedGroupGUID,
                cmpcode: company.companyCode
              });

              if (raceConditionGroup) {
                foundGroup = raceConditionGroup;
                foundGroupId = raceConditionGroup._id;
                foundGroupGUID = raceConditionGroup.GroupGUID;
                foundGroupName = raceConditionGroup.GroupName;
                foundGroupParent = raceConditionGroup.GroupParent || parentUserIdString;
                foundGroupRemarks = raceConditionGroup.Remarks || null;
                foundCmpcode = raceConditionGroup.cmpcode;
                foundOther1 = raceConditionGroup.other1 || null;
                foundOther2 = raceConditionGroup.other2 || null;
                foundOther3 = raceConditionGroup.other3 || null;
                foundOther4 = raceConditionGroup.other4 || null;
              } else {
                // If still not found, try to find by GroupParent
                const groupByParent = await Group.findOne({
                  GroupParent: parentUserIdString,
                  cmpcode: company.companyCode
                });
                if (groupByParent) {
                  foundGroup = groupByParent;
                  foundGroupId = groupByParent._id;
                  foundGroupGUID = groupByParent.GroupGUID;
                  foundGroupName = groupByParent.GroupName;
                  foundGroupParent = groupByParent.GroupParent || parentUserIdString;
                  foundGroupRemarks = groupByParent.Remarks || null;
                  foundCmpcode = groupByParent.cmpcode;
                  foundOther1 = groupByParent.other1 || null;
                  foundOther2 = groupByParent.other2 || null;
                  foundOther3 = groupByParent.other3 || null;
                  foundOther4 = groupByParent.other4 || null;
                } else {
                  console.error('Failed to create or find group after duplicate error:', createError);
                  // Continue without group - user will be created but without group assignment
                }
              }
            } else {
              console.error('Error creating group:', createError);
              // Continue without group - user will be created but without group assignment
            }
          }
        } catch (error) {
          console.error('Error in auto-create group logic:', error);
          // Continue without group - user will be created but without group assignment
        }
      }
    }

    // Create new user with groups array format
    const userData = {
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
      groups: foundGroupId ? [{
        groupId: foundGroupId,
        groupGUID: foundGroupGUID,
        groupName: foundGroupName,
        groupParentUser: foundGroupParent || parentUserIdString, // GroupParent = parent user ID
        cmpcode: foundCmpcode,
        remarks: foundGroupRemarks || `Group for ${name} (${role})`,
        other1: foundOther1 || email || '',
        other2: foundOther2 || mobile || '',
        other3: foundOther3 || role || '',
        other4: foundOther4 || parentUserForGroup?.name || '',
        assignedBy: adminId,
        isActive: true,
        assignedAt: new Date()
      }] : [],
      hierarchy: {
        parentUserId: finalParentUserId,
        level: getRoleLevel(role)
      },
      createdBy: adminId
    };

    // Note: tallyGroup is no longer stored separately - all group data is in groups[] array

    // Add subdealer details if role is subdealer
    if (role === 'subdealer' && subdealerData) {
      userData.subdealerDetails = subdealerData;
    }

    const newUser = await User.create(userData);

    // Update company's user count
    await Company.findByIdAndUpdate(companyId, {
      $inc: { currentUsers: 1 }
    });

    // Fetch the created user with populated hierarchy and companies
    const createdUser = await User.findById(newUser._id)
      .select('-password')
      .populate('hierarchy.parentUserId', 'name email role mobile')
      .populate('companies.companyId', 'companyName companyCode')
      .lean(); // Use lean() to get plain object for easier manipulation

    // Format response - clean structure without duplication
    const parentUserPopulated = createdUser.hierarchy?.parentUserId;
    const parentUserName = parentUserPopulated?.name || '';
    
    // Format groups array - ensure groupId is string, not populated object
    // If group data is not in groups array, fetch from Group model
    const formattedGroups = await Promise.all((createdUser.groups || []).map(async (group) => {
      // Get groupId as string (not populated object)
      const groupIdValue = group.groupId;
      const groupIdString = groupIdValue?._id 
        ? groupIdValue._id.toString() 
        : (groupIdValue?.toString() || groupIdValue || '');
      
      // If groupId exists, fetch the group to get all details
      let groupDetails = null;
      if (groupIdString && mongoose.Types.ObjectId.isValid(groupIdString)) {
        groupDetails = await Group.findById(groupIdString).lean();
      }
      
      return {
        groupId: groupIdString,
        groupGUID: group.groupGUID || groupDetails?.GroupGUID || '',
        groupName: group.groupName || groupDetails?.GroupName || '',
        groupParentUser: group.groupParentUser || groupDetails?.GroupParent || (finalParentUserId ? finalParentUserId.toString() : null),
        cmpcode: group.cmpcode || groupDetails?.cmpcode || '',
        remarks: group.remarks || groupDetails?.Remarks || `Group for ${createdUser.name} (${createdUser.role})`,
        other1: group.other1 || groupDetails?.other1 || createdUser.email || '',
        other2: group.other2 || groupDetails?.other2 || createdUser.mobile || '',
        other3: group.other3 || groupDetails?.other3 || createdUser.role || '',
        other4: group.other4 || groupDetails?.other4 || parentUserName || '',
        assignedBy: group.assignedBy || adminId,
        assignedAt: group.assignedAt || new Date(),
        isActive: group.isActive !== undefined ? group.isActive : true
      };
    }));
    
    const responseUser = {
      _id: createdUser._id,
      name: createdUser.name,
      email: createdUser.email,
      mobile: createdUser.mobile,
      role: createdUser.role,
      userName: createdUser.userName,
      isActive: createdUser.isActive,
      groups: formattedGroups,
      hierarchy: {
        parentUser: parentUserPopulated ? {
          _id: parentUserPopulated._id || parentUserPopulated.toString(),
          name: parentUserPopulated.name || null,
          email: parentUserPopulated.email || null,
          role: parentUserPopulated.role || null
        } : null,
        level: createdUser.hierarchy?.level || null
      },
      companies: createdUser.companies.map(comp => ({
        companyId: comp.companyId?._id || comp.companyId,
        companyName: comp.companyId?.companyName || '',
        companyCode: comp.companyId?.companyCode || '',
        role: comp.role,
        isActive: comp.isActive,
        assignedBy: comp.assignedBy || null,
        assignedAt: comp.assignedAt || null
      }))
    };
    
    // Only include subdealerDetails if role is subdealer and it has meaningful data
    if (createdUser.role === 'subdealer' && createdUser.subdealerDetails) {
      const hasSubdealerData = Object.values(createdUser.subdealerDetails).some(val => 
        val && val !== '' && val !== 'India'
      );
      if (hasSubdealerData) {
        responseUser.subdealerDetails = createdUser.subdealerDetails;
      }
    }

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: responseUser
    });

  } catch (error) {
    console.error("Create user error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function to get all child user IDs based on group hierarchy
// This function gets all users that belong to the same group or child groups
const getAllChildUserIds = async (userId, companyId) => {
  const childUserIds = [];
  
  // Get the user's group
  const user = await User.findById(userId).select('group');
  if (!user || !user.group || !user.group.GroupGUID) {
    return childUserIds;
  }
  
  const userGroupGUID = user.group.GroupGUID;
  
  // Get all groups that have this group as parent (hierarchical groups)
  const childGroups = await Group.find({
    GroupParent: userGroupGUID,
    cmpcode: user.group.cmpcode,
    isActive: true
  }).select('GroupGUID');
  
  // Include the user's own group and all child groups
  const allGroupGUIDs = [userGroupGUID, ...childGroups.map(g => g.GroupGUID)];
  
  // Get all users in this group and child groups (excluding the user itself)
  const usersInGroups = await User.find({
    'group.GroupGUID': { $in: allGroupGUIDs },
    'companies.companyId': companyId,
    'companies.isActive': true,
    isActive: true,
    _id: { $ne: userId }
  }).select('_id');
  
  const userIds = usersInGroups.map(u => u._id.toString());
  childUserIds.push(...userIds);
  
  // Remove duplicates
  return [...new Set(childUserIds)];
};

// Get all users for parent selection
export const getUsersForParentSelection = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { excludeUserId } = req.query; // Optional: exclude a specific user (for edit mode)

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

    // Build query - get all active users in the company (including admin)
    const query = {
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true
    };

    // Exclude the user being edited if provided
    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    // Get all users (no pagination, no role filter - include all roles)
    const users = await User.find(query)
      .select('_id name email mobile role userName isActive hierarchy')
      .populate('hierarchy.parentUser', 'name email role')
      .sort({ 'hierarchy.level': 1, name: 1 });

    // Format response
    const formattedUsers = users.map(user => {
      const userObj = user.toObject ? user.toObject() : user;
      // Ensure hierarchy field is always present
      if (!userObj.hierarchy) {
        userObj.hierarchy = {
          parentUser: null,
          level: null
        };
      }
      return {
        _id: userObj._id,
        name: userObj.name,
        email: userObj.email || '',
        mobile: userObj.mobile || '',
        role: userObj.role,
        userName: userObj.userName || '',
        isActive: userObj.isActive,
        hierarchy: userObj.hierarchy
      };
    });

    res.json({
      success: true,
      data: {
        users: formattedUsers,
        total: formattedUsers.length
      }
    });

  } catch (error) {
    console.error("Get users for parent selection error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get groups for selection (similar to getUsersForParentSelection)
/**
 * @swagger
 * /api/v1/admin/groups-for-selection:
 *   get:
 *     summary: Get all groups and users for parent user selection
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     description: Returns all active groups with their assigned users, plus separate lists of all users, admins, and managed users. Used for populating parent user selection dropdown.
 *     responses:
 *       200:
 *         description: Groups and users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     groups:
 *                       type: array
 *                       description: All active groups with their assigned users
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           GroupGUID:
 *                             type: string
 *                             example: "GRP-mipru621-3064AFT07"
 *                           GroupName:
 *                             type: string
 *                             example: "John Doe - Dealers"
 *                           GroupParent:
 *                             type: string
 *                             nullable: true
 *                           cmpcode:
 *                             type: string
 *                             example: "COM--001"
 *                           Remarks:
 *                             type: string
 *                           users:
 *                             type: array
 *                             description: Users assigned to this group
 *                             items:
 *                               type: object
 *                               properties:
 *                                 _id:
 *                                   type: string
 *                                 name:
 *                                   type: string
 *                                 email:
 *                                   type: string
 *                                 mobile:
 *                                   type: string
 *                                 role:
 *                                   type: string
 *                                 userName:
 *                                   type: string
 *                                 isActive:
 *                                   type: boolean
 *                                 createdAt:
 *                                   type: string
 *                                   format: date-time
 *                           userCount:
 *                             type: number
 *                             example: 5
 *                     totalGroups:
 *                       type: number
 *                       example: 10
 *                     users:
 *                       type: array
 *                       description: All users in the company (admins + managed users)
 *                       items:
 *                         type: object
 *                     totalUsers:
 *                       type: number
 *                       example: 25
 *                     admins:
 *                       type: array
 *                       description: Admin and superadmin users
 *                       items:
 *                         type: object
 *                     managedUsers:
 *                       type: array
 *                       description: Non-admin users created in user management
 *                       items:
 *                         type: object
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const getGroupsForSelection = async (req, res) => {
  try {
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Get all active groups for this company
    const groups = await Group.find({
      cmpcode: company.companyCode,
      isActive: true
    })
      .select('_id GroupGUID GroupName GroupParent cmpcode Remarks')
      .sort({ GroupName: 1 });

    // Get all users in this company (including admin and all users created in user management)
    // ✅ Include admins and superadmins - they should be in the list
    const allUsers = await User.find({
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true
      // No role filter - include ALL roles including admin and superadmin
    })
      .select('_id name email mobile role userName isActive tallyGroup companies createdAt')
      .sort({ createdAt: -1 });

    // Format groups with user information
    const formattedGroups = groups.map(group => {
      // Find all users assigned to this group
      const usersInGroup = allUsers.filter(user => {
        if (!user.tallyGroup || !user.tallyGroup.GroupGUID) return false;
        // Match by GroupGUID (Tally GUID)
        return user.tallyGroup.GroupGUID === group.GroupGUID;
      });

      return {
        _id: group._id.toString(),
        GroupGUID: group.GroupGUID,
        GroupName: group.GroupName,
        GroupParent: group.GroupParent || null,
        cmpcode: group.cmpcode,
        Remarks: group.Remarks || '',
        users: usersInGroup.map(user => ({
          _id: user._id.toString(),
          name: user.name,
          email: user.email || '',
          mobile: user.mobile,
          role: user.role,
          userName: user.userName || '',
          isActive: user.isActive,
          createdAt: user.createdAt
        })),
        userCount: usersInGroup.length
      };
    });

    // Format all users (including admin) for reference
    const formattedUsers = allUsers.map(user => {
      const userObj = user.toObject ? user.toObject() : user;
      
      // ✅ Only include tallyGroup if it has valid GroupGUID (not null/empty)
      const formattedTallyGroup = (userObj.tallyGroup && 
                                   userObj.tallyGroup.GroupGUID && 
                                   typeof userObj.tallyGroup.GroupGUID === 'string' &&
                                   userObj.tallyGroup.GroupGUID.trim() !== '') ? {
        groupId: userObj.tallyGroup.groupId || null,
        GroupGUID: userObj.tallyGroup.GroupGUID || null,
        GroupName: userObj.tallyGroup.GroupName || null,
        GroupParent: userObj.tallyGroup.GroupParent || null,
        cmpcode: userObj.tallyGroup.cmpcode || null,
        Remarks: userObj.tallyGroup.Remarks || null,
        Other1: userObj.tallyGroup.Other1 || null,
        Other2: userObj.tallyGroup.Other2 || null,
        Other3: userObj.tallyGroup.Other3 || null,
        Other4: userObj.tallyGroup.Other4 || null
      } : null;

      return {
        _id: userObj._id.toString(),
        name: userObj.name,
        email: userObj.email || '',
        mobile: userObj.mobile,
        role: userObj.role,
        userName: userObj.userName || '',
        isActive: userObj.isActive,
        tallyGroup: formattedTallyGroup,
        createdAt: userObj.createdAt
      };
    });

    res.json({
      success: true,
      data: {
        groups: formattedGroups,
        totalGroups: formattedGroups.length,
        users: formattedUsers,
        totalUsers: formattedUsers.length,
        // Separate admin users
        admins: formattedUsers.filter(u => u.role === 'admin' || u.role === 'superadmin'),
        // Users created in user management (non-admin users)
        managedUsers: formattedUsers.filter(u => u.role !== 'admin' && u.role !== 'superadmin')
      }
    });

  } catch (error) {
    console.error("Get groups for selection error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/users-by-company:
 *   get:
 *     summary: Get all users for the admin's company with groups and parent user information
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [zonal, rsm, asm, dealers, distibutors, subdealer, salesman]
 *         description: Filter users by role (optional)
 *         example: "dealers"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of users per page
 *         example: 10
 *     responses:
 *       200:
 *         description: Users retrieved successfully with groups and parent user data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       description: List of users with group assignment status
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "692ffae73b27c3bcb77698be"
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           email:
 *                             type: string
 *                             example: "john.doe@example.com"
 *                           mobile:
 *                             type: string
 *                             example: "9876543210"
 *                           role:
 *                             type: string
 *                             example: "dealers"
 *                           userName:
 *                             type: string
 *                             example: "johndoe"
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           address:
 *                             type: object
 *                             properties:
 *                               street:
 *                                 type: string
 *                                 example: "123 Main Street"
 *                               city:
 *                                 type: string
 *                                 example: "Mumbai"
 *                               state:
 *                                 type: string
 *                                 example: "Maharashtra"
 *                               pincode:
 *                                 type: string
 *                                 example: "400001"
 *                               country:
 *                                 type: string
 *                                 example: "India"
 *                           groups:
 *                             type: array
 *                             description: Array of groups assigned to the user. Empty array [] if no group assigned.
 *                             example: []
 *                             items:
 *                               type: object
 *                               properties:
 *                                 groupId:
 *                                   type: string
 *                                   example: "692ffae73b27c3bcb77698bc"
 *                                 groupGUID:
 *                                   type: string
 *                                   example: "GRP-mipru621-3064AFT07"
 *                                 GroupGUID:
 *                                   type: string
 *                                   example: "GRP-mipru621-3064AFT07"
 *                                 GroupName:
 *                                   type: string
 *                                   example: "John Doe - Dealers"
 *                                 GroupParent:
 *                                   type: string
 *                                   nullable: true
 *                                   example: "GRP-parent-group-guid"
 *                                 cmpcode:
 *                                   type: string
 *                                   example: "COM--001"
 *                                 Remarks:
 *                                   type: string
 *                                   example: "Group for John Doe (dealers)"
 *                                 Other1:
 *                                   type: string
 *                                   example: "john.doe@example.com"
 *                                 Other2:
 *                                   type: string
 *                                   example: "9876543210"
 *                                 Other3:
 *                                   type: string
 *                                   example: "dealers"
 *                                 Other4:
 *                                   type: string
 *                                   example: "Parent User Name"
 *                                 isActive:
 *                                   type: boolean
 *                                   example: true
 *                                 assignedBy:
 *                                   type: string
 *                                   example: "692d34680e76283c26ea2de2"
 *                                 assignedAt:
 *                                   type: string
 *                                   format: date-time
 *                                   example: "2025-12-02T12:13:23.782Z"
 *                           primaryGroup:
 *                             type: object
 *                             nullable: true
 *                             description: Primary group assigned to the user. null if no group assigned. Check this field to determine if user has a group.
 *                             example: null
 *                             properties:
 *                               _id:
 *                                 type: string
 *                                 example: "692ffae73b27c3bcb77698bc"
 *                               GroupGUID:
 *                                 type: string
 *                                 example: "GRP-mipru621-3064AFT07"
 *                               GroupName:
 *                                 type: string
 *                                 example: "John Doe - Dealers"
 *                               GroupParent:
 *                                 type: string
 *                                 nullable: true
 *                                 example: "GRP-parent-group-guid"
 *                               cmpcode:
 *                                 type: string
 *                                 example: "COM--001"
 *                               Remarks:
 *                                 type: string
 *                                 example: "Group for John Doe (dealers)"
 *                               Other1:
 *                                 type: string
 *                                 example: "john.doe@example.com"
 *                               Other2:
 *                                 type: string
 *                                 example: "9876543210"
 *                               Other3:
 *                                 type: string
 *                                 example: "dealers"
 *                               Other4:
 *                                 type: string
 *                                 example: "Parent User Name"
 *                           hierarchy:
 *                             type: object
 *                             properties:
 *                               parentUser:
 *                                 type: object
 *                                 nullable: true
 *                                 description: Parent user information. null if no parent assigned.
 *                                 properties:
 *                                   _id:
 *                                     type: string
 *                                   name:
 *                                     type: string
 *                                   email:
 *                                     type: string
 *                                   role:
 *                                     type: string
 *                                   mobile:
 *                                     type: string
 *                               level:
 *                                 type: number
 *                                 nullable: true
 *                           companies:
 *                             type: array
 *                             description: Array of companies the user belongs to
 *                             items:
 *                               type: object
 *                               properties:
 *                                 _id:
 *                                   type: string
 *                                   example: "692ed7e3d761b86b2cbea1ab"
 *                                 companyId:
 *                                   type: object
 *                                   properties:
 *                                     _id:
 *                                       type: string
 *                                       example: "692d33690e76283c26ea2d85"
 *                                     companyName:
 *                                       type: string
 *                                       example: "Demo Company"
 *                                     companyCode:
 *                                       type: string
 *                                       example: "COM--001"
 *                                 role:
 *                                   type: string
 *                                   example: "dealers"
 *                                 isActive:
 *                                   type: boolean
 *                                   example: true
 *                                 assignedBy:
 *                                   type: string
 *                                   example: "692d34680e76283c26ea2de2"
 *                                 assignedAt:
 *                                   type: string
 *                                   format: date-time
 *                                   example: "2025-12-02T12:13:23.782Z"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-02T12:13:23.788Z"
 *                           subdealerDetails:
 *                             type: object
 *                             description: Present only if role is 'subdealer'
 *                     company:
 *                       type: object
 *                       description: Company information for the admin's default company
 *                       properties:
 *                         _id:
 *                           type: string
 *                           example: "692d33690e76283c26ea2d85"
 *                         companyName:
 *                           type: string
 *                           example: "Demo Company"
 *                         companyCode:
 *                           type: string
 *                           example: "COM--001"
 *                         maxUser:
 *                           type: number
 *                           example: 100
 *                         currentUsers:
 *                           type: number
 *                           example: 25
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: number
 *                         totalPages:
 *                           type: number
 *                         totalUsers:
 *                           type: number
 *                         hasNext:
 *                           type: boolean
 *                         hasPrev:
 *                           type: boolean
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
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

    // Build base query - only active users in the company
    const query = {
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true
    };

    // Apply hierarchy-based filtering
    // Admin can see all users in their company (except superadmin)
    if (admin.role === 'admin') {
      query.role = { $nin: ['admin', 'superadmin'] };
      query._id = { $ne: adminId }; // Exclude the admin user
    } else {
      // For other roles (zonal, rsm, asm, etc.), only show their child users
      // Get all child user IDs recursively
      const childUserIds = await getAllChildUserIds(adminId, companyId);
      
      if (childUserIds.length === 0) {
        // No child users, return empty result
        return res.json({
          success: true,
          data: {
            users: [],
            company: await Company.findById(companyId).select('companyName companyCode maxUser currentUsers'),
            pagination: {
              currentPage: parseInt(page),
              totalPages: 0,
              totalUsers: 0,
              hasNext: false,
              hasPrev: false
            }
          }
        });
      }
      
      // Filter to only show child users
      query._id = { $in: childUserIds };
    }

    if (role) {
      // Add role filter
      query.role = role;
    }

    // Get users with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const users = await User.find(query)
      .select('name email mobile role userName isActive address companies.$ lastLogin createdAt groups hierarchy subdealerDetails')
      .populate('hierarchy.parentUserId', 'name email role mobile')
      .populate('companies.companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean() to get plain objects for easier manipulation

    // Get total count
    const totalUsers = await User.countDocuments(query);

    // Get company details
    const company = await Company.findById(companyId).select('companyName companyCode maxUser currentUsers').lean();

    // Format users with correct structure (matching create/edit user format)
    const formattedUsers = await Promise.all(users.map(async (userObj) => {
      const parentUserPopulated = userObj.hierarchy?.parentUserId;
      const parentUserName = parentUserPopulated?.name || '';
      
      // Format groups array - ensure groupId is string, not populated object
      const formattedGroups = await Promise.all((userObj.groups || []).map(async (group) => {
        // Get groupId as string (not populated object)
        const groupIdValue = group.groupId;
        const groupIdString = groupIdValue?._id 
          ? groupIdValue._id.toString() 
          : (groupIdValue?.toString() || groupIdValue || '');
        
        // If groupId exists, fetch the group to get all details
        let groupDetails = null;
        if (groupIdString && mongoose.Types.ObjectId.isValid(groupIdString)) {
          groupDetails = await Group.findById(groupIdString).lean();
        }
        
        return {
          groupId: groupIdString,
          groupGUID: group.groupGUID || groupDetails?.GroupGUID || '',
          groupName: group.groupName || groupDetails?.GroupName || '',
          groupParentUser: group.groupParentUser || groupDetails?.GroupParent || (parentUserPopulated ? parentUserPopulated._id.toString() : null),
          cmpcode: group.cmpcode || groupDetails?.cmpcode || '',
          remarks: group.remarks || groupDetails?.Remarks || `Group for ${userObj.name} (${userObj.role})`,
          other1: group.other1 || groupDetails?.other1 || userObj.email || '',
          other2: group.other2 || groupDetails?.other2 || userObj.mobile || '',
          other3: group.other3 || groupDetails?.other3 || userObj.role || '',
          other4: group.other4 || groupDetails?.other4 || parentUserName || '',
          assignedBy: group.assignedBy || null,
          assignedAt: group.assignedAt || null,
          isActive: group.isActive !== undefined ? group.isActive : true
        };
      }));
      
      return {
        _id: userObj._id,
        name: userObj.name,
        email: userObj.email,
        mobile: userObj.mobile,
        role: userObj.role,
        userName: userObj.userName,
        isActive: userObj.isActive,
        groups: formattedGroups,
        hierarchy: {
          parentUser: parentUserPopulated ? {
            _id: parentUserPopulated._id || parentUserPopulated.toString(),
            name: parentUserPopulated.name || null,
            email: parentUserPopulated.email || null,
            role: parentUserPopulated.role || null
          } : null,
          level: userObj.hierarchy?.level || null
        },
        companies: userObj.companies.map(comp => ({
          companyId: comp.companyId?._id || comp.companyId,
          companyName: comp.companyId?.companyName || '',
          companyCode: comp.companyId?.companyCode || '',
          role: comp.role,
          isActive: comp.isActive,
          assignedBy: comp.assignedBy || null,
          assignedAt: comp.assignedAt || null
        })),
        createdAt: userObj.createdAt
      };
    }));
    
    // Only include subdealerDetails if role is subdealer and it has meaningful data
    formattedUsers.forEach((user, index) => {
      if (user.role === 'subdealer' && users[index].subdealerDetails) {
        const hasSubdealerData = Object.values(users[index].subdealerDetails).some(val => 
          val && val !== '' && val !== 'India'
        );
        if (hasSubdealerData) {
          user.subdealerDetails = users[index].subdealerDetails;
        }
      }
    });

    res.json({
      success: true,
      data: {
        users: formattedUsers,
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

/**
 * @swagger
 * /api/v1/admin/edit-user/{userId}:
 *   put:
 *     summary: Update an existing user with automatic group creation/assignment based on parent user
 *     description: |
 *       Updates a user and automatically handles group assignment:
 *       1. If parentUserId is provided, the system checks if a group exists for that parent (GroupParent = parentUserId)
 *       2. If a group exists, the user is assigned to that existing group
 *       3. If no group exists, a new group is automatically created with GroupParent = parentUserId
 *       4. GroupParent in the group model is set to the UserId of the selected parent user
 *       5. Direct group assignment (groupId/groupGUID) takes precedence over auto-creation
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the user to update
 *         example: "692d35820e76283c26ea3050"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - mobile
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *                 description: User's full name
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address (optional)
 *                 example: "john.doe@example.com"
 *               mobile:
 *                 type: string
 *                 description: User's mobile number
 *                 example: "9876543210"
 *               role:
 *                 type: string
 *                 enum: [zonal, rsm, asm, dealers, distibutors, subdealer, salesman]
 *                 description: User's role in the hierarchy
 *                 example: "dealers"
 *               userName:
 *                 type: string
 *                 description: Username (optional)
 *                 example: "johndoe"
 *               isActive:
 *                 type: boolean
 *                 description: Whether the user is active
 *                 example: true
 *               parentUserId:
 *                 type: string
 *                 description: ID of the parent user. If provided, a Group will be automatically created/updated based on this parent user selection. The system will: 1) Check if a group exists for this parent (GroupParent = parentUserId), 2) If found, assign user to that group, 3) If not found, create a new group with GroupParent = parentUserId. GroupParent in the group model will be set to this UserId.
 *                 example: "692d35820e76283c26ea3050"
 *               groupId:
 *                 type: string
 *                 description: Optional - Direct group ID assignment (takes precedence over auto-creation)
 *                 example: "692ffae73b27c3bcb77698bc"
 *               groupGUID:
 *                 type: string
 *                 description: Optional - Direct group GUID assignment (takes precedence over auto-creation)
 *                 example: "GRP010"
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
 *                     default: "India"
 *               subdealerDetails:
 *                 type: object
 *                 description: Required only if role is 'subdealer'
 *                 properties:
 *                   SDName:
 *                     type: string
 *                   SDType:
 *                     type: string
 *                   SDAddress1:
 *                     type: string
 *                   SDAddress2:
 *                     type: string
 *                   SDAddress3:
 *                     type: string
 *                   SDState:
 *                     type: string
 *                   SDCountry:
 *                     type: string
 *                   SDPincode:
 *                     type: string
 *                   SDContactPerson:
 *                     type: string
 *                   SDMobileNo:
 *                     type: string
 *                   SDEmail:
 *                     type: string
 *                   SDGSTNType:
 *                     type: string
 *                   SDGSTNNumber:
 *                     type: string
 *     responses:
 *       200:
 *         description: User updated successfully with group assignment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User updated successfully"
 *                 user:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "692d35820e76283c26ea3050"
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       example: "john.doe@example.com"
 *                     mobile:
 *                       type: string
 *                       example: "9876543210"
 *                     role:
 *                       type: string
 *                       example: "dealers"
 *                     userName:
 *                       type: string
 *                       example: "johndoe"
 *                     address:
 *                       type: object
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     groups:
 *                       type: array
 *                       description: Array of groups assigned to the user. Automatically created/assigned based on parentUserId. Empty array [] if no group assigned.
 *                       items:
 *                         type: object
 *                         properties:
 *                           groupId:
 *                             type: string
 *                             description: MongoDB ObjectId of the group
 *                             example: "692ffae73b27c3bcb77698bc"
 *                           groupGUID:
 *                             type: string
 *                             description: Group GUID (unique identifier)
 *                             example: "GRP010"
 *                           groupName:
 *                             type: string
 *                             description: Group name (e.g., "John Doe - Dealers")
 *                             example: "John Doe - Dealers"
 *                           groupParentUser:
 *                             type: string
 *                             nullable: true
 *                             description: Parent user's ID (UserId of the selected parent user). This is the GroupParent value.
 *                             example: "692d35820e76283c26ea3050"
 *                           cmpcode:
 *                             type: string
 *                             description: Company code
 *                             example: "COM--001"
 *                           remarks:
 *                             type: string
 *                             description: Remarks/notes for the group
 *                             example: "Group for John Doe (dealers)"
 *                           other1:
 *                             type: string
 *                             description: Stores user email
 *                             example: "john.doe@example.com"
 *                           other2:
 *                             type: string
 *                             description: Stores user mobile
 *                             example: "9876543210"
 *                           other3:
 *                             type: string
 *                             description: Stores user role
 *                             example: "dealers"
 *                           other4:
 *                             type: string
 *                             description: Stores parent user's name
 *                             example: "Parent User Name"
 *                           isActive:
 *                             type: boolean
 *                             description: Whether the group assignment is active
 *                             example: true
 *                           assignedBy:
 *                             type: string
 *                             description: ID of the admin who assigned the group
 *                             example: "692d34680e76283c26ea2de2"
 *                           assignedAt:
 *                             type: string
 *                             format: date-time
 *                             description: Timestamp when the group was assigned
 *                             example: "2025-12-03T19:56:13.179Z"
 *                     hierarchy:
 *                       type: object
 *                       properties:
 *                         parentUser:
 *                           type: object
 *                           nullable: true
 *                           description: Parent user information. null if no parent assigned.
 *                           properties:
 *                             _id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             email:
 *                               type: string
 *                             role:
 *                               type: string
 *                             mobile:
 *                               type: string
 *                         level:
 *                           type: number
 *                           nullable: true
 *                     companies:
 *                       type: array
 *                       items:
 *                         type: object
 *                     subdealerDetails:
 *                       type: object
 *                       description: Present only if role is 'subdealer'
 *       400:
 *         description: Bad request - missing required fields or validation error
 *       403:
 *         description: Access denied
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// Edit User
export const editUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, mobile, role, userName, isActive, address, parentUserId, subdealerDetails, groupId, groupGUID } = req.body;
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
      address,
      groupId,
      groupGUID
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

    // Store old role to check if it changed
    const oldRole = userToEdit.role;
    const roleChanged = oldRole !== role;

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

    // Update subdealer details if role is subdealer
    if (role === 'subdealer' && subdealerDetails) {
      if (!userToEdit.subdealerDetails) {
        userToEdit.subdealerDetails = {};
      }
      userToEdit.subdealerDetails = {
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
      userToEdit.subdealerDetails = undefined;
    }

    // Update the role in the companies array
    const companyIndex = userToEdit.companies.findIndex(
      comp => comp.companyId.toString() === companyId.toString()
    );
    
    if (companyIndex !== -1) {
      userToEdit.companies[companyIndex].role = role;
    }

    // Initialize hierarchy if it doesn't exist
    if (!userToEdit.hierarchy) {
      userToEdit.hierarchy = {};
    }

    // Update hierarchy level if role changed
    if (roleChanged) {
      userToEdit.hierarchy.level = getRoleLevel(role);
    }

    // Get company for group operations
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: "Company not found"
      });
    }

    // Initialize group variables
    let foundGroupId = null;
    let foundGroupGUID = null;
    let foundGroupName = null;
    let foundGroupParent = null;
    let foundGroupRemarks = null;
    let foundCmpcode = company.companyCode;
    let foundOther1 = null;
    let foundOther2 = null;
    let foundOther3 = null;
    let foundOther4 = null;
    let foundGroup = null;
    const parentUserIdString = parentUserId ? parentUserId.toString() : null;

    // Handle direct group assignment if groupId or groupGUID is provided
    if (groupId || groupGUID) {
      if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
        foundGroup = await Group.findById(groupId);
        if (foundGroup && foundGroup.cmpcode === company.companyCode) {
          foundGroupId = foundGroup._id;
          foundGroupGUID = foundGroup.GroupGUID;
          foundGroupName = foundGroup.GroupName;
          foundGroupParent = foundGroup.GroupParent || null;
          foundGroupRemarks = foundGroup.Remarks || null;
          foundCmpcode = foundGroup.cmpcode;
          foundOther1 = foundGroup.other1 || null;
          foundOther2 = foundGroup.other2 || null;
          foundOther3 = foundGroup.other3 || null;
          foundOther4 = foundGroup.other4 || null;
        } else {
          return res.status(400).json({
            success: false,
            message: "Group does not belong to this company"
          });
        }
      } else if (groupGUID) {
        foundGroup = await Group.findOne({
          GroupGUID: groupGUID,
          cmpcode: company.companyCode,
          isActive: true
        });
        if (foundGroup) {
          foundGroupId = foundGroup._id;
          foundGroupGUID = foundGroup.GroupGUID;
          foundGroupName = foundGroup.GroupName;
          foundGroupParent = foundGroup.GroupParent || null;
          foundGroupRemarks = foundGroup.Remarks || null;
          foundCmpcode = foundGroup.cmpcode;
          foundOther1 = foundGroup.other1 || null;
          foundOther2 = foundGroup.other2 || null;
          foundOther3 = foundGroup.other3 || null;
          foundOther4 = foundGroup.other4 || null;
        } else {
          return res.status(400).json({
            success: false,
            message: "Group not found or not active"
          });
        }
      }
    }

    // Update parent user if parentUserId is provided and create/update Group
    if (parentUserId) {
      // Validate that the parent user exists and is in the same company
      const parentUser = await User.findOne({
        _id: parentUserId,
        'companies.companyId': companyId,
        'companies.isActive': true,
        isActive: true
      }).select('name email mobile role').lean();
      
      if (!parentUser) {
        return res.status(400).json({
          success: false,
          message: "Parent user not found or not active in this company"
        });
      }

      // Update hierarchy with parent information
      userToEdit.hierarchy.parentUserId = parentUserId;
      userToEdit.hierarchy.parentUserName = parentUser.name;
      userToEdit.hierarchy.parentUserRole = parentUser.role;
      userToEdit.hierarchy.level = getRoleLevel(role);

      // Only auto-find/create group if groupId/groupGUID was NOT provided (direct assignment takes precedence)
      if (!foundGroup && !groupId && !groupGUID) {
        // Check if a group exists for this parent user (GroupParent = parentUserId)
        const existingGroupForParent = await Group.findOne({
          GroupParent: parentUserIdString,
          cmpcode: company.companyCode,
          isActive: true
        });

        if (existingGroupForParent) {
          // Group exists for this parent - use it
          foundGroup = existingGroupForParent;
          foundGroupId = existingGroupForParent._id;
          foundGroupGUID = existingGroupForParent.GroupGUID;
          foundGroupName = existingGroupForParent.GroupName;
          foundGroupParent = existingGroupForParent.GroupParent || parentUserIdString;
          foundGroupRemarks = existingGroupForParent.Remarks || null;
          foundCmpcode = existingGroupForParent.cmpcode;
          foundOther1 = existingGroupForParent.other1 || null;
          foundOther2 = existingGroupForParent.other2 || null;
          foundOther3 = existingGroupForParent.other3 || null;
          foundOther4 = existingGroupForParent.other4 || null;
        } else {
          // No group exists for this parent - create a new group
          try {
            const generatedGroupGUID = await generateGroupGUID(company.companyCode);
            const roleCapitalized = role === 'rsm' ? 'RSM' 
              : role === 'asm' ? 'ASM'
              : role === 'zonal' ? 'Zonal'
              : role.charAt(0).toUpperCase() + role.slice(1);
            const generatedGroupName = `${name} - ${roleCapitalized}`;

            const newGroupData = {
              GroupGUID: generatedGroupGUID,
              GroupName: generatedGroupName,
              GroupParent: parentUserIdString, // GroupParent = UserId of parent user
              cmpcode: company.companyCode,
              Remarks: `Group for ${name} (${role})`,
              other1: email || userToEdit.email || '',
              other2: mobile || userToEdit.mobile || '',
              other3: role || '',
              other4: parentUser.name || '',
              companyId: companyId,
              isActive: true,
              tallySyncStatus: 'pending',
              tallySyncAt: new Date()
            };

            try {
              const newGroup = await Group.create(newGroupData);
              foundGroup = newGroup;
              foundGroupId = newGroup._id;
              foundGroupGUID = newGroup.GroupGUID;
              foundGroupName = newGroup.GroupName;
              foundGroupParent = newGroup.GroupParent || parentUserIdString;
              foundGroupRemarks = newGroup.Remarks || null;
              foundCmpcode = newGroup.cmpcode;
              foundOther1 = newGroup.other1 || null;
              foundOther2 = newGroup.other2 || null;
              foundOther3 = newGroup.other3 || null;
              foundOther4 = newGroup.other4 || null;
            } catch (createError) {
              if (createError.code === 11000) {
                const raceConditionGroup = await Group.findOne({
                  GroupGUID: generatedGroupGUID,
                  cmpcode: company.companyCode
                });
                if (raceConditionGroup) {
                  foundGroup = raceConditionGroup;
                  foundGroupId = raceConditionGroup._id;
                  foundGroupGUID = raceConditionGroup.GroupGUID;
                  foundGroupName = raceConditionGroup.GroupName;
                  foundGroupParent = raceConditionGroup.GroupParent || parentUserIdString;
                  foundGroupRemarks = raceConditionGroup.Remarks || null;
                  foundCmpcode = raceConditionGroup.cmpcode;
                  foundOther1 = raceConditionGroup.other1 || null;
                  foundOther2 = raceConditionGroup.other2 || null;
                  foundOther3 = raceConditionGroup.other3 || null;
                  foundOther4 = raceConditionGroup.other4 || null;
                }
              }
            }
          } catch (error) {
            console.error('Error in auto-create group logic:', error);
          }
        }
      }

      // Update groups array with the found/created group
      if (foundGroupId) {
        const groupIndex = userToEdit.groups.findIndex(
          g => g.groupId && g.groupId.toString() === foundGroupId.toString()
        );
        
        if (groupIndex === -1) {
          // Add new group to groups array
          userToEdit.groups.push({
            groupId: foundGroupId,
            groupGUID: foundGroupGUID,
            groupName: foundGroupName,
            groupParentUser: foundGroupParent || parentUserIdString,
            cmpcode: foundCmpcode,
            remarks: foundGroupRemarks || `Group for ${name} (${role})`,
            other1: foundOther1 || email || userToEdit.email || '',
            other2: foundOther2 || mobile || userToEdit.mobile || '',
            other3: foundOther3 || role || '',
            other4: foundOther4 || parentUser.name || '',
            assignedBy: adminId,
            isActive: true,
            assignedAt: new Date()
          });
        } else {
          // Update existing group in groups array
          userToEdit.groups[groupIndex] = {
            ...userToEdit.groups[groupIndex],
            groupId: foundGroupId,
            groupGUID: foundGroupGUID,
            groupName: foundGroupName,
            groupParentUser: foundGroupParent || parentUserIdString,
            cmpcode: foundCmpcode,
            remarks: foundGroupRemarks || `Group for ${name} (${role})`,
            other1: foundOther1 || email || userToEdit.email || '',
            other2: foundOther2 || mobile || userToEdit.mobile || '',
            other3: foundOther3 || role || '',
            other4: foundOther4 || parentUser.name || '',
            assignedBy: adminId,
            isActive: true,
            assignedAt: new Date()
          };
        }
      }
    } else {
      // If parentUserId is not provided, clear hierarchy
      userToEdit.hierarchy.parentUserId = null;
      userToEdit.hierarchy.parentUserName = null;
      userToEdit.hierarchy.parentUserRole = null;
      userToEdit.hierarchy.parentGroupGUID = null;
      // Clear groups array
      userToEdit.groups = [];
    }

    await userToEdit.save();

    console.log('🔍 User after update:', {
      _id: userToEdit._id,
      name: userToEdit.name,
      email: userToEdit.email,
      mobile: userToEdit.mobile,
      role: userToEdit.role,
      address: userToEdit.address,
      tallyGroup: userToEdit.tallyGroup?.GroupGUID || null
    });

    // Fetch the updated user with populated hierarchy and companies
    const updatedUser = await User.findById(userToEdit._id)
      .select('-password')
      .populate('hierarchy.parentUserId', 'name email role mobile')
      .populate('companies.companyId', 'companyName companyCode')
      .lean(); // Use lean() to get plain object for easier manipulation

    // Format response - clean structure without duplication (same as createUser)
    const parentUserPopulated = updatedUser.hierarchy?.parentUserId;
    const parentUserName = parentUserPopulated?.name || '';
    
    // Format groups array - ensure groupId is string, not populated object
    const formattedGroups = await Promise.all((updatedUser.groups || []).map(async (group) => {
      // Get groupId as string (not populated object)
      const groupIdValue = group.groupId;
      const groupIdString = groupIdValue?._id 
        ? groupIdValue._id.toString() 
        : (groupIdValue?.toString() || groupIdValue || '');
      
      // If groupId exists, fetch the group to get all details
      let groupDetails = null;
      if (groupIdString && mongoose.Types.ObjectId.isValid(groupIdString)) {
        groupDetails = await Group.findById(groupIdString).lean();
      }
      
      return {
        groupId: groupIdString,
        groupGUID: group.groupGUID || groupDetails?.GroupGUID || '',
        groupName: group.groupName || groupDetails?.GroupName || '',
        groupParentUser: group.groupParentUser || groupDetails?.GroupParent || (parentUserId ? parentUserId.toString() : null),
        cmpcode: group.cmpcode || groupDetails?.cmpcode || '',
        remarks: group.remarks || groupDetails?.Remarks || `Group for ${updatedUser.name} (${updatedUser.role})`,
        other1: group.other1 || groupDetails?.other1 || updatedUser.email || '',
        other2: group.other2 || groupDetails?.other2 || updatedUser.mobile || '',
        other3: group.other3 || groupDetails?.other3 || updatedUser.role || '',
        other4: group.other4 || groupDetails?.other4 || parentUserName || '',
        assignedBy: group.assignedBy || adminId,
        assignedAt: group.assignedAt || new Date(),
        isActive: group.isActive !== undefined ? group.isActive : true
      };
    }));
    
    const responseUser = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      mobile: updatedUser.mobile,
      role: updatedUser.role,
      userName: updatedUser.userName,
      isActive: updatedUser.isActive,
      groups: formattedGroups,
      hierarchy: {
        parentUser: parentUserPopulated ? {
          _id: parentUserPopulated._id || parentUserPopulated.toString(),
          name: parentUserPopulated.name || null,
          email: parentUserPopulated.email || null,
          role: parentUserPopulated.role || null
        } : null,
        level: updatedUser.hierarchy?.level || null
      },
      companies: updatedUser.companies.map(comp => ({
        companyId: comp.companyId?._id || comp.companyId,
        companyName: comp.companyId?.companyName || '',
        companyCode: comp.companyId?.companyCode || '',
        role: comp.role,
        isActive: comp.isActive,
        assignedBy: comp.assignedBy || null,
        assignedAt: comp.assignedAt || null
      }))
    };
    
    // Only include subdealerDetails if role is subdealer and it has meaningful data
    if (updatedUser.role === 'subdealer' && updatedUser.subdealerDetails) {
      const hasSubdealerData = Object.values(updatedUser.subdealerDetails).some(val => 
        val && val !== '' && val !== 'India'
      );
      if (hasSubdealerData) {
        responseUser.subdealerDetails = updatedUser.subdealerDetails;
      }
    }

    res.json({
      success: true,
      message: "User updated successfully",
      user: responseUser
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

/**
 * Generate unique GroupGUID for a company
 * Format: GRP001, GRP002, GRP003... (sequential per company)
 * @param {string} cmpcode - Company code
 * @returns {Promise<string>} - Generated GroupGUID
 */
const generateGroupGUID = async (cmpcode) => {
  try {
    // Find all existing groups for this company
    const existingGroups = await Group.find({ cmpcode })
      .select('GroupGUID')
      .sort({ GroupGUID: -1 })
      .limit(100); // Get recent groups to find max number

    let maxNumber = 0;

    // Extract numeric part from existing GroupGUIDs
    for (const group of existingGroups) {
      const guid = group.GroupGUID || '';
      // Match patterns like "GRP001", "GRP009", "GRP123", etc.
      const match = guid.match(/^GRP(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Generate next sequential number
    const nextNumber = maxNumber + 1;
    const newGUID = `GRP${String(nextNumber).padStart(3, '0')}`;

    // Verify uniqueness (handle race conditions)
    const exists = await Group.findOne({ GroupGUID: newGUID, cmpcode });
    if (exists) {
      // If exists, try next number
      return `GRP${String(nextNumber + 1).padStart(3, '0')}`;
    }

    return newGUID;
  } catch (error) {
    console.error('Error generating GroupGUID:', error);
    // Fallback to timestamp-based GUID if sequential fails
    const timestamp = Date.now().toString(36).toUpperCase();
    return `GRP-${timestamp}`;
  }
};

/**
 * Auto-assign groups to users based on their hierarchy
 * This helper function assigns groups to users who don't have groups assigned
 * It matches users with groups based on name and role, following the hierarchy
 */
export const autoAssignGroups = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const { companyId } = req.body;
    const targetCompanyId = companyId || req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

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
    const companyIdStr = targetCompanyId.toString();

    if (adminCompanyId !== companyIdStr) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this company"
      });
    }

    // Get company details
    const company = await Company.findById(targetCompanyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Get all users in this company without groups
    const usersWithoutGroups = await User.find({
      'companies.companyId': targetCompanyId,
      'companies.isActive': true,
      isActive: true,
      $or: [
        { tallyGroup: { $exists: false } },
        { 'tallyGroup.GroupGUID': null },
        { 'tallyGroup.GroupGUID': '' }
      ]
    })
      .select('_id name email mobile role userName hierarchy')
      .populate('hierarchy.parentUserId', 'name role tallyGroup')
      .sort({ 'hierarchy.level': 1 }); // Sort by hierarchy level (top to bottom)

    if (usersWithoutGroups.length === 0) {
      return res.json({
        success: true,
        message: "All users already have groups assigned",
        assigned: 0,
        skipped: 0,
        failed: []
      });
    }

    // Get all active groups for this company
    const allGroups = await Group.find({
      cmpcode: company.companyCode,
      isActive: true
    })
      .select('_id GroupGUID GroupName GroupParent cmpcode Remarks')
      .sort({ GroupName: 1 });

    const results = {
      assigned: 0,
      skipped: 0,
      failed: []
    };

    // Process users from top to bottom (by hierarchy level)
    for (const user of usersWithoutGroups) {
      try {
        // Generate expected group name: "{name} - {Role}"
        const roleCapitalized = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        const expectedGroupName = `${user.name} - ${roleCapitalized}`;

        // Try to find matching group
        let matchingGroup = allGroups.find(g => 
          g.GroupName === expectedGroupName || 
          g.GroupName.toLowerCase() === expectedGroupName.toLowerCase()
        );

        // If no exact match, try to find by role only (for cases where name doesn't match)
        if (!matchingGroup) {
          matchingGroup = allGroups.find(g => 
            g.GroupName.endsWith(` - ${roleCapitalized}`) &&
            !g.GroupParent // Root level group
          );
        }

        if (!matchingGroup) {
          results.skipped++;
          results.failed.push({
            userId: user._id.toString(),
            userName: user.name,
            role: user.role,
            reason: `No matching group found. Expected: "${expectedGroupName}". Please create this group in Tally and sync it first.`
          });
          continue;
        }

        // Get parent user's group GUID if parent exists
        const parentUser = user.hierarchy?.parentUserId;
        const parentGroupGUID = parentUser?.tallyGroup?.GroupGUID || user.hierarchy?.parentGroupGUID || null;

        // Verify parent group relationship if parent exists
        if (parentGroupGUID && matchingGroup.GroupParent !== parentGroupGUID) {
          // Check if there's a group with correct parent
          const groupWithParent = allGroups.find(g => 
            (g.GroupName === expectedGroupName || g.GroupName.toLowerCase() === expectedGroupName.toLowerCase()) &&
            g.GroupParent === parentGroupGUID
          );

          if (groupWithParent) {
            matchingGroup = groupWithParent;
          } else {
            results.skipped++;
            results.failed.push({
              userId: user._id.toString(),
              userName: user.name,
              role: user.role,
              reason: `Group found but parent mismatch. Found group parent: "${matchingGroup.GroupParent}", Expected parent: "${parentGroupGUID}". Please create group with correct parent in Tally.`
            });
            continue;
          }
        }

        // Assign group to user
        const userToUpdate = await User.findById(user._id);
        if (!userToUpdate) {
          results.skipped++;
          continue;
        }

        userToUpdate.tallyGroup = {
          groupId: matchingGroup._id.toString(),
          GroupGUID: matchingGroup.GroupGUID,
          GroupName: matchingGroup.GroupName,
          GroupParent: matchingGroup.GroupParent || parentGroupGUID || null,
          cmpcode: matchingGroup.cmpcode,
          Remarks: matchingGroup.Remarks || `Group for ${user.name} (${user.role})`,
          Other1: user.email || '',
          Other2: user.mobile || '',
          Other3: user.role || '',
          Other4: parentUser?.name || '',
          assignedBy: adminId,
          assignedAt: new Date()
        };

        // Update hierarchy parentGroupGUID if not set
        if (!userToUpdate.hierarchy) {
          userToUpdate.hierarchy = {};
        }
        if (!userToUpdate.hierarchy.parentGroupGUID && parentGroupGUID) {
          userToUpdate.hierarchy.parentGroupGUID = parentGroupGUID;
        }

        await userToUpdate.save();
        results.assigned++;

      } catch (error) {
        console.error(`Error assigning group to user ${user._id}:`, error);
        results.failed.push({
          userId: user._id.toString(),
          userName: user.name,
          role: user.role,
          reason: error.message || 'Unknown error'
        });
      }
    }

    res.json({
      success: true,
      message: `Group assignment completed. ${results.assigned} users assigned, ${results.skipped} skipped.`,
      results: {
        assigned: results.assigned,
        skipped: results.skipped,
        total: usersWithoutGroups.length,
        failed: results.failed
      }
    });

  } catch (error) {
    console.error("Auto-assign groups error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
