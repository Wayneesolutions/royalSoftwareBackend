import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/user/userModel.js";
import Company from "../models/company/companyModel.js";
import Group from "../models/group/groupModel.js";
import Ledger from "../models/ledger/ledgerModel.js";

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
import SubDealer from "../models/subdealer/subdealerModel.js";

/**
 * Helper function to check if company has reached its max user limit
 * Counts total members: Users (excluding admin/superadmin) + Dealers + SubDealers
 * @param {ObjectId|String} companyId - Company ID
 * @param {Number} additionalCount - Number of additional members to add (default: 1)
 * @returns {Object} - { allowed: boolean, currentTotal: number, maxUser: number, message: string }
 */
export const checkCompanyMemberLimit = async (companyId, additionalCount = 1) => {
  try {
    const company = await Company.findById(companyId);
    if (!company) {
      return {
        allowed: false,
        currentTotal: 0,
        maxUser: 0,
        message: 'Company not found'
      };
    }

    // If no maxUser limit is set, allow creation
    if (!company.maxUser) {
      return {
        allowed: true,
        currentTotal: 0,
        maxUser: null,
        message: 'No user limit set for this company'
      };
    }

    // Count active users only (excluding admin and superadmin) — dealers and subdealers are not counted against the limit
    const totalUsers = await User.countDocuments({
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true,
      role: { $nin: ['admin', 'superadmin'] }
    });

    const newTotal = totalUsers + additionalCount;

    // Check if adding new users would exceed limit
    if (newTotal > company.maxUser) {
      return {
        allowed: false,
        currentTotal: totalUsers,
        maxUser: company.maxUser,
        message: `Company has reached its user limit. Maximum allowed users: ${company.maxUser}. Current users: ${totalUsers}. Cannot create more users.`
      };
    }

    return {
      allowed: true,
      currentTotal: totalUsers,
      maxUser: company.maxUser,
      message: 'User limit check passed'
    };
  } catch (error) {
    console.error('Error checking company member limit:', error);
    return {
      allowed: false,
      currentTotal: 0,
      maxUser: 0,
      message: 'Error checking member limit'
    };
  }
};
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
 *     description: Returns company information and user statistics. Accessible by Admin, Zonal Manager, RSM, and ASM roles.
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
 *       403:
 *         description: Access denied - insufficient role or no company access
 *       400:
 *         description: No company selected
 */
export const getCompanyData = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { companyId } = req.query;

    // Get user with company details (works for admin, zonal, rsm, asm)
    const user = await User.findById(userId)
      .populate('defaultCompany')
      .populate('companies.companyId');

    const targetCompanyId = companyId || user.defaultCompany?._id;

    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: 'No company selected'
      });
    }

    // Convert targetCompanyId to string for consistent comparison
    const targetCompanyIdStr = targetCompanyId.toString();

    // Debug logging
    console.log('User ID:', userId);
    console.log('User Role:', userRole);
    console.log('Target Company ID:', targetCompanyIdStr);
    console.log('User companies:', user.companies.map(comp => ({
      companyId: comp.companyId._id.toString(),
      isActive: comp.isActive
    })));
    console.log('Default company:', user.defaultCompany?._id?.toString());

    // Verify access to company - check both direct company access and default company
    const hasAccess = user.companies.some(
      comp => comp.companyId._id.toString() === targetCompanyIdStr && comp.isActive
    ) || user.defaultCompany?._id.toString() === targetCompanyIdStr;

    console.log('Has access:', hasAccess);

    if (!hasAccess) {
      // If user has no companies assigned, return a helpful message
      if (!user.companies || user.companies.length === 0) {
        return res.status(403).json({
          success: false,
          message: `No companies assigned to this ${userRole}. Please contact admin to assign companies.`
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

    // Get total dealers (Ledgers) for this company
    const totalDealers = await Ledger.countDocuments({
      companyId: targetCompanyId,
      isActive: true
    });

    // Get total subdealers for this company
    const totalSubDealers = await SubDealer.countDocuments({
      companyId: targetCompanyId,
      isActive: true
    });

    // Calculate total members (users + dealers + subdealers)
    const totalMembers = totalUsers + totalDealers + totalSubDealers;

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
          totalDealers,
          totalSubDealers,
          totalMembers,
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
 *                 description: ID of the parent user (OPTIONAL). If provided, a Group will be automatically created/assigned based on this parent user selection. The system will: 1) Check if a group exists for this parent (GroupParent = parentUserId), 2) If found, assign user to that group, 3) If not found, create a new group with GroupParent = parentUserId. GroupParent in the group model will be set to this UserId. Users can be created without a parent user.
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
      dealerId: reqDealerId, // Legacy single dealer (for backward compatibility)
      dealerIds: reqDealerIds, // New field for multiple dealer assignment
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

    // Role is optional - if not provided, set to 'groupuser' (regular group user)
    const finalRole = role || 'groupuser';
    
    if (!name || !mobile || !password) {
      const missingFields = [];
      if (!name) missingFields.push('name');
      if (!mobile) missingFields.push('mobile');
      if (!password) missingFields.push('password');
      
      console.log('Missing required fields:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Parent user is optional - users can be created with or without a parent

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

    // Check user limit for the company (dealers and subdealers are not counted)
    const limitCheck = await checkCompanyMemberLimit(companyId, 1);
    if (!limitCheck.allowed) {
      return res.status(400).json({
        success: false,
        message: limitCheck.message
      });
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
          // User already exists and is assigned to company - allow updating groups/dealers
          // This allows admins to update user's dealer/group assignments
          console.log('User already assigned to company - updating groups/dealers instead of creating new user');
          
          // Process dealer assignments if provided
          const dealerGroups = [];
          const dealerIdsToProcess = Array.isArray(reqDealerIds) && reqDealerIds.length > 0 
            ? reqDealerIds 
            : (reqDealerId && mongoose.Types.ObjectId.isValid(reqDealerId) ? [reqDealerId] : []);

          if (dealerIdsToProcess.length > 0 && !reqGroupId && !reqGroupGUID && !reqGroupGUIDField) {
            // Process each dealer
            for (const dealerId of dealerIdsToProcess) {
              if (!mongoose.Types.ObjectId.isValid(dealerId)) {
                continue;
              }

              const dealer = await Ledger.findById(dealerId);
              if (!dealer) continue;

              // Verify dealer belongs to company
              if (dealer.companyId?.toString() !== companyId.toString() && dealer.cmpcode !== company.companyCode) {
                continue;
              }

              let dealerGroup = null;

              if (dealer.groupId) {
                dealerGroup = await Group.findById(dealer.groupId);
              } else {
                // Create group for dealer
                try {
                  const generatedGroupGUID = await generateGroupGUID(company.companyCode);
                  const generatedGroupName = `Group for ${dealer.LedgerName}`;
                  
                  const newGroupData = {
                    GroupGUID: generatedGroupGUID,
                    GroupName: generatedGroupName,
                    GroupParent: null,
                    cmpcode: company.companyCode,
                    Remarks: `Group for dealer ${dealer.LedgerName}`,
                    other1: dealer.Email || '',
                    other2: dealer.LedgerMobile || '',
                    other3: 'dealer',
                    other4: dealer.LedgerName || '',
                    companyId: companyId,
                    isActive: true,
                    tallySyncStatus: 'pending',
                    tallySyncAt: new Date()
                  };
                  
                  dealerGroup = await Group.create(newGroupData);
                  dealer.groupId = dealerGroup._id;
                  await dealer.save();
                } catch (createError) {
                  console.error('Error creating group for dealer:', createError);
                  continue;
                }
              }

              if (dealerGroup) {
                // Check if user already has this group
                const hasGroup = existingUser.groups.some(g => 
                  g.groupId && g.groupId.toString() === dealerGroup._id.toString()
                );
                
                if (!hasGroup) {
                  dealerGroups.push({
                    groupId: dealerGroup._id,
                    groupGUID: dealerGroup.GroupGUID,
                    groupName: dealerGroup.GroupName,
                    groupParentUser: dealerGroup.GroupParent || null,
                    cmpcode: dealerGroup.cmpcode,
                    remarks: dealerGroup.Remarks || `Group for dealer ${dealer.LedgerName}`,
                    other1: dealerGroup.other1 || dealer.Email || '',
                    other2: dealerGroup.other2 || dealer.LedgerMobile || '',
                    other3: dealerGroup.other3 || 'dealer',
                    other4: dealerGroup.other4 || dealer.LedgerName || '',
                    assignedBy: adminId,
                    isActive: true,
                    assignedAt: new Date()
                  });
                }
              }
            }
          }

          // Update user's groups with new dealer groups
          if (dealerGroups.length > 0) {
            existingUser.groups.push(...dealerGroups);
          }

          // Store directly assigned dealer IDs
          if (dealerIdsToProcess.length > 0) {
            const validDealerIds = dealerIdsToProcess
              .filter(id => mongoose.Types.ObjectId.isValid(id))
              .map(id => new mongoose.Types.ObjectId(id));
            
            // Add new dealer IDs to assignedDealerIds array (avoid duplicates)
            if (!existingUser.assignedDealerIds) {
              existingUser.assignedDealerIds = [];
            }
            validDealerIds.forEach(dealerId => {
              const dealerIdStr = dealerId.toString();
              if (!existingUser.assignedDealerIds.some(id => id.toString() === dealerIdStr)) {
                existingUser.assignedDealerIds.push(dealerId);
              }
            });
          }

          // Update other fields if provided
          if (name) existingUser.name = name;
          if (email) existingUser.email = email;
          if (password) {
            existingUser.password = await bcrypt.hash(password, 10);
          }
          if (address) {
            existingUser.address = {
              street: address.street || existingUser.address?.street || '',
              city: address.city || existingUser.address?.city || '',
              state: address.state || existingUser.address?.state || '',
              pincode: address.pincode || existingUser.address?.pincode || '',
              country: address.country || existingUser.address?.country || 'India'
            };
          }

          await existingUser.save();

          // Return updated user
          const updatedUser = await User.findById(existingUser._id)
            .select('-password')
            .populate('hierarchy.parentUserId', 'name email role mobile')
            .populate('companies.companyId', 'companyName companyCode')
            .lean();

          return res.status(200).json({
            success: true,
            message: "User assignments updated successfully",
            user: updatedUser
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
              level: getRoleLevel(finalRole)
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
              level: getRoleLevel(finalRole)
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
    if (finalRole === 'subdealer' && subdealerDetails) {
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

    // Validate parent user (optional)
    let finalParentUserId = null;
    let parentUserForGroup = null;
    let parentUserIdString = null;
    
    if (parentUserId) {
      // Fetch parent user if provided
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
      parentUserForGroup = await User.findById(finalParentUserId)
        .select('name email mobile role')
        .lean();

      if (!parentUserForGroup) {
        return res.status(400).json({
          success: false,
          message: "Parent user not found"
        });
      }

      // Convert parentUserId to string for GroupParent
      parentUserIdString = finalParentUserId.toString();
    }

    // Initialize group variables for single group assignment
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

    // Array to store multiple groups from multiple dealers
    const dealerGroups = [];

    // Priority 0: If dealerIds array is provided (and groupId is not), process multiple dealers
    const dealerIdsToProcess = Array.isArray(reqDealerIds) && reqDealerIds.length > 0 
      ? reqDealerIds 
      : (reqDealerId && mongoose.Types.ObjectId.isValid(reqDealerId) ? [reqDealerId] : []);

    if (dealerIdsToProcess.length > 0 && !reqGroupId && !reqGroupGUID && !reqGroupGUIDField) {
      // Process each dealer
      for (const dealerId of dealerIdsToProcess) {
        if (!mongoose.Types.ObjectId.isValid(dealerId)) {
          continue; // Skip invalid IDs
        }

        const dealer = await Ledger.findById(dealerId);
        
        if (!dealer) {
          continue; // Skip if dealer not found
        }

        // Verify dealer belongs to company
        if (dealer.companyId?.toString() !== companyId.toString() && dealer.cmpcode !== company.companyCode) {
          continue; // Skip if dealer doesn't belong to company
        }

        let dealerGroup = null;

        if (dealer.groupId) {
          // Dealer has a group - use it
          dealerGroup = await Group.findById(dealer.groupId);
        } else {
          // Dealer doesn't have a group - create one for the dealer
          try {
            const generatedGroupGUID = await generateGroupGUID(company.companyCode);
            const generatedGroupName = `Group for ${dealer.LedgerName}`;
            
            const newGroupData = {
              GroupGUID: generatedGroupGUID,
              GroupName: generatedGroupName,
              GroupParent: null, // Dealer groups don't have parent users
              cmpcode: company.companyCode,
              Remarks: `Group for dealer ${dealer.LedgerName}`,
              other1: dealer.Email || '',
              other2: dealer.LedgerMobile || '',
              other3: 'dealer',
              other4: dealer.LedgerName || '',
              companyId: companyId,
              isActive: true,
              tallySyncStatus: 'pending',
              tallySyncAt: new Date()
            };
            
            dealerGroup = await Group.create(newGroupData);
            
            // Update dealer with the new group
            dealer.groupId = dealerGroup._id;
            await dealer.save();
          } catch (createError) {
            console.error('Error creating group for dealer:', createError);
            continue; // Skip this dealer if group creation fails
          }
        }

        if (dealerGroup) {
          // Add group to array
          dealerGroups.push({
            groupId: dealerGroup._id,
            groupGUID: dealerGroup.GroupGUID,
            groupName: dealerGroup.GroupName,
            groupParentUser: dealerGroup.GroupParent || null,
            cmpcode: dealerGroup.cmpcode,
            remarks: dealerGroup.Remarks || `Group for dealer ${dealer.LedgerName}`,
            other1: dealerGroup.other1 || dealer.Email || '',
            other2: dealerGroup.other2 || dealer.LedgerMobile || '',
            other3: dealerGroup.other3 || 'dealer',
            other4: dealerGroup.other4 || dealer.LedgerName || '',
          });

          // For backward compatibility, set first group as foundGroup
          if (!foundGroup) {
            foundGroup = dealerGroup;
            foundGroupId = dealerGroup._id;
            foundGroupGUID = dealerGroup.GroupGUID;
            foundGroupName = dealerGroup.GroupName;
            foundGroupParent = dealerGroup.GroupParent || null;
            foundGroupRemarks = dealerGroup.Remarks || `Group for dealer ${dealer.LedgerName}`;
            foundCmpcode = dealerGroup.cmpcode;
            foundOther1 = dealerGroup.other1 || dealer.Email || '';
            foundOther2 = dealerGroup.other2 || dealer.LedgerMobile || '';
            foundOther3 = dealerGroup.other3 || '';
            foundOther4 = dealerGroup.other4 || dealer.LedgerName || '';
          }
        }
      }
    }

    // Priority 1: If groupId is provided, find by ID (only if dealerId was not provided)
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
        console.log(`✅ Found valid group by GUID: ${group.GroupName} (${group.GroupGUID})`);
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
      } else {
        console.log(`⚠️ Group GUID provided but not found or not active: ${searchGUID}`);
      }
    }
    // Priority 3: Check if a group exists for this parent user (GroupParent = parentUserId)
    // Only if parentUserId is provided
    else if (parentUserIdString) {
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
          
          // IMPORTANT: NEVER use reqGroupName as it could contain stale data like "Ludhiana"
          // ALWAYS generate group name from current user data
          const roleCapitalized = finalRole === 'rsm' ? 'RSM' 
            : finalRole === 'asm' ? 'ASM'
            : finalRole === 'zonal' ? 'Zonal'
            : finalRole === 'groupuser' ? 'GroupUser'
            : (finalRole ? finalRole.charAt(0).toUpperCase() + finalRole.slice(1) : 'User');
          
          // ALWAYS generate fresh group name, NEVER use reqGroupName
          const generatedGroupName = `${name} - ${roleCapitalized}`;
          
          // Log warning if reqGroupName was provided
          if (reqGroupName && reqGroupName !== generatedGroupName) {
            console.log(`⚠️ Ignoring potentially stale reqGroupName: "${reqGroupName}", using generated: "${generatedGroupName}"`);
          }

          // IMPORTANT: Log group creation to catch stale data issues
          console.log('🔍 Auto-creating group for user:', {
            name,
            role,
            groupGUID: generatedGroupGUID,
            groupName: generatedGroupName,
            parentUserIdString,
            companyCode: company.companyCode,
            reqCmpcode: reqCmpcode,
            reqRemarks: reqRemarks
          });

          // Create new group with GroupParent = parentUserId (not GroupGUID)
          // NEVER use request body fields that could contain stale data
          const newGroupData = {
            GroupGUID: generatedGroupGUID,
            GroupName: generatedGroupName,
            GroupParent: parentUserIdString, // ✅ GroupParent = UserId of parent user
            cmpcode: company.companyCode, // ✅ ALWAYS use current company code, never reqCmpcode
            Remarks: `Group for ${name} (${finalRole})`, // ✅ Always generate fresh remarks
            other1: email || '', // ✅ Use current email
            other2: mobile || '', // ✅ Use current mobile
            other3: finalRole || '', // ✅ Use current role
            other4: parentUserForGroup?.name || '', // ✅ Use current parent name
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
      groups: dealerGroups.length > 0 
        ? dealerGroups.map(g => ({
            ...g,
            assignedBy: adminId,
            isActive: true,
            assignedAt: new Date()
          }))
        : (foundGroupId ? [{
            groupId: foundGroupId,
            groupGUID: foundGroupGUID,
            groupName: foundGroupName,
            groupParentUser: foundGroupParent || parentUserIdString, // GroupParent = parent user ID
            cmpcode: company.companyCode, // ✅ Always use current company code
            remarks: `Group for ${name} (${finalRole})`, // ✅ Always generate fresh
            other1: email || '', // ✅ Use current data
            other2: mobile || '', // ✅ Use current data
            other3: finalRole || '', // ✅ Use current data
            other4: parentUserForGroup?.name || '', // ✅ Use current data
            assignedBy: adminId,
            isActive: true,
            assignedAt: new Date()
          }] : []),
      hierarchy: {
        ...(finalParentUserId ? { parentUserId: finalParentUserId } : {}),
        level: getRoleLevel(finalRole)
      },
      assignedDealerIds: dealerIdsToProcess.length > 0 
        ? dealerIdsToProcess
            .filter(id => mongoose.Types.ObjectId.isValid(id))
            .map(id => new mongoose.Types.ObjectId(id))
        : [],
      createdBy: adminId
    };

    // Note: tallyGroup is no longer stored separately - all group data is in groups[] array

    // Add subdealer details if role is subdealer
    if (finalRole === 'subdealer' && subdealerData) {
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
 * /api/v1/admin/groups:
 *   get:
 *     summary: Get all groups for admin's company with user counts
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, include inactive groups in the results
 *     responses:
 *       200:
 *         description: Groups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           GroupGUID:
 *                             type: string
 *                           GroupName:
 *                             type: string
 *                           GroupParent:
 *                             type: string
 *                             nullable: true
 *                           cmpcode:
 *                             type: string
 *                           Remarks:
 *                             type: string
 *                           isActive:
 *                             type: boolean
 *                           userCount:
 *                             type: number
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     totalGroups:
 *                       type: number
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const getAllGroups = async (req, res) => {
  try {
    const userId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userRole = req.user.userDetails.role || '';
    const { includeInactive } = req.query;

    // Check if user has access to the company
    const user = await User.findById(userId).populate('defaultCompany').select('role groups');
    if (!user || !user.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this user"
      });
    }

    // Convert companyId to string for comparison
    const userCompanyId = user.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (userCompanyId !== targetCompanyId) {
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

    // Build query - include inactive groups if requested
    let query = {
      cmpcode: company.companyCode
    };

    if (includeInactive !== 'true') {
      query.isActive = true;
    }

    // For group users, only show groups they are assigned to
    const isGroupUser = userRole === 'groupuser' || !userRole || userRole === '';
    if (isGroupUser && user.groups && user.groups.length > 0) {
      // Get group IDs from user's groups array
      const userGroupIds = user.groups
        .filter(g => (g.isActive === true || g.isActive === undefined) && g.groupId)
        .map(g => {
          if (typeof g.groupId === 'object' && g.groupId !== null && g.groupId._id) {
            return g.groupId._id;
          } else if (g.groupId && mongoose.Types.ObjectId.isValid(g.groupId)) {
            return typeof g.groupId === 'string' ? new mongoose.Types.ObjectId(g.groupId) : g.groupId;
          }
          return null;
        })
        .filter(id => id !== null);
      
      if (userGroupIds.length > 0) {
        query._id = { $in: userGroupIds };
      } else {
        // User has no active groups, return empty list
        return res.json({
          success: true,
          data: {
            groups: [],
            totalGroups: 0
          }
        });
      }
    }

    // Get all groups for this company (filtered for group users)
    const groups = await Group.find(query)
      .select('_id GroupGUID GroupName GroupParent cmpcode Remarks isActive createdAt')
      .sort({ GroupName: 1 })
      .lean();

    // Get all users in this company to count users per group
    const allUsers = await User.find({
      'companies.companyId': companyId,
      'companies.isActive': true,
      isActive: true
    })
      .select('groups')
      .lean();

    // Format groups with counts from all three models (User, Ledger, SubDealer)
    const formattedGroups = await Promise.all(groups.map(async (group) => {
      const groupId = group._id.toString();
      
      // Count users in this group
      const userCount = allUsers.filter(user => {
        if (!user.groups || !Array.isArray(user.groups)) return false;
        return user.groups.some(g => 
          g.groupId && g.groupId.toString() === groupId
        );
      }).length;

      // Count dealers (Ledgers) in this group
      const dealerCount = await Ledger.countDocuments({
        groupId: new mongoose.Types.ObjectId(groupId),
        companyId: new mongoose.Types.ObjectId(companyId),
        isActive: true
      });

      // Count subdealers in this group
      const subDealerCount = await SubDealer.countDocuments({
        groupId: new mongoose.Types.ObjectId(groupId),
        companyId: new mongoose.Types.ObjectId(companyId),
        isActive: true
      });

      // Calculate total members
      const totalCount = userCount + dealerCount + subDealerCount;

      return {
        _id: groupId,
        GroupGUID: group.GroupGUID,
        GroupName: group.GroupName,
        GroupParent: group.GroupParent || null,
        cmpcode: group.cmpcode,
        Remarks: group.Remarks || '',
        isActive: group.isActive,
        userCount: userCount,
        dealerCount: dealerCount,
        subDealerCount: subDealerCount,
        totalCount: totalCount,
        createdAt: group.createdAt
      };
    }));

    res.json({
      success: true,
      data: {
        groups: formattedGroups,
        totalGroups: formattedGroups.length
      }
    });

  } catch (error) {
    console.error("Get all groups error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/groups/{groupId}/users:
 *   get:
 *     summary: Get all users in a specific group
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     group:
 *                       type: object
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalUsers:
 *                       type: number
 *       404:
 *         description: Group not found
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const getUsersByGroup = async (req, res) => {
  try {
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { groupId } = req.params;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Find the group
    const group = await Group.findOne({
      _id: groupId,
      cmpcode: company.companyCode,
      isActive: true
    }).lean();

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    // Convert groupId to ObjectId if valid
    let groupObjectId = groupId;
    if (mongoose.Types.ObjectId.isValid(groupId)) {
      groupObjectId = new mongoose.Types.ObjectId(groupId);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid group ID format"
      });
    }

    // Convert companyId to ObjectId if it's not already
    let companyObjectId = companyId;
    if (typeof companyId === 'string' && mongoose.Types.ObjectId.isValid(companyId)) {
      companyObjectId = new mongoose.Types.ObjectId(companyId);
    }

    // Get all users in this company that belong to this group
    // Use $elemMatch to ensure both groupId and isActive match the same group element
    const users = await User.find({
      'companies.companyId': companyObjectId,
      'companies.isActive': true,
      isActive: true,
      groups: {
        $elemMatch: {
          groupId: groupObjectId,
          isActive: true
        }
      }
    })
      .select('_id name email mobile role userName isActive address hierarchy createdAt groups')
      .populate('hierarchy.parentUserId', 'name email role mobile')
      .sort({ name: 1 })
      .lean();

    // Get all subdealers in this company that belong to this group
    const subdealers = await SubDealer.find({
      companyId: companyObjectId,
      groupId: groupObjectId,
      isActive: true
    })
      .select('_id SDName SDType SDAddress1 SDAddress2 SDAddress3 SDState SDCountry SDPincode SDContactPerson SDMobileNo SDEmail SDGSTNType SDGSTNNumber groupId cmpcode Cmpguid isActive createdAt')
      .populate('groupId', 'GroupGUID GroupName GroupParent cmpcode')
      .sort({ SDName: 1 })
      .lean();

    // Get all dealers (ledgers) in this company that belong to this group
    const dealers = await Ledger.find({
      companyId: companyObjectId,
      groupId: groupObjectId,
      isActive: true
    })
      .select('_id LedgerGUID LedgerName LedgerMobile LedgerContact LedgerAddress1 LedgerAddress2 LedgerState LedgerOpening LedgerOpeningDate LedgerJoinDate Cmpguid Email cmpCode cmpcode Remarks Other1 Other2 Other3 Other4 Other5 other6 other7 other8 LedgerGSTIN groupId isActive createdAt')
      .populate('groupId', 'GroupGUID GroupName GroupParent cmpcode')
      .sort({ LedgerName: 1 })
      .lean();

    // Format users
    const formattedUsers = users.map(user => {
      const userGroup = user.groups?.find(g => 
        g.groupId && g.groupId.toString() === groupId
      );

      return {
        _id: user._id.toString(),
        type: 'user',
        name: user.name,
        email: user.email || '',
        mobile: user.mobile,
        role: user.role,
        userName: user.userName || '',
        isActive: user.isActive,
        address: user.address || {},
        hierarchy: {
          parentUser: user.hierarchy?.parentUserId ? {
            _id: user.hierarchy.parentUserId._id?.toString() || user.hierarchy.parentUserId.toString(),
            name: user.hierarchy.parentUserId.name || '',
            email: user.hierarchy.parentUserId.email || '',
            role: user.hierarchy.parentUserId.role || ''
          } : null,
          level: user.hierarchy?.level || null
        },
        groupInfo: userGroup ? {
          groupGUID: userGroup.groupGUID || '',
          groupName: userGroup.groupName || '',
          assignedAt: userGroup.assignedAt || null
        } : null,
        createdAt: user.createdAt
      };
    });

    // Format subdealers
    const formattedSubDealers = subdealers.map(subdealer => ({
      _id: subdealer._id.toString(),
      type: 'subdealer',
      name: subdealer.SDName,
      SDName: subdealer.SDName,
      SDType: subdealer.SDType,
      SDAddress1: subdealer.SDAddress1 || '',
      SDAddress2: subdealer.SDAddress2 || '',
      SDAddress3: subdealer.SDAddress3 || '',
      SDState: subdealer.SDState || '',
      SDCountry: subdealer.SDCountry || '',
      SDPincode: subdealer.SDPincode || '',
      SDContactPerson: subdealer.SDContactPerson || '',
      SDMobileNo: subdealer.SDMobileNo || '',
      SDEmail: subdealer.SDEmail || '',
      SDGSTNType: subdealer.SDGSTNType || '',
      SDGSTNNumber: subdealer.SDGSTNNumber || '',
      email: subdealer.SDEmail || '',
      mobile: subdealer.SDMobileNo || '',
      isActive: subdealer.isActive,
      groupInfo: subdealer.groupId ? {
        groupGUID: typeof subdealer.groupId === 'object' ? subdealer.groupId.GroupGUID : '',
        groupName: typeof subdealer.groupId === 'object' ? subdealer.groupId.GroupName : ''
      } : null,
      createdAt: subdealer.createdAt
    }));

    // Format dealers
    const formattedDealers = dealers.map(dealer => ({
      _id: dealer._id.toString(),
      type: 'dealer',
      name: dealer.LedgerName,
      LedgerGUID: dealer.LedgerGUID,
      LedgerName: dealer.LedgerName,
      LedgerMobile: dealer.LedgerMobile || '',
      LedgerContact: dealer.LedgerContact || '',
      LedgerAddress1: dealer.LedgerAddress1 || '',
      LedgerAddress2: dealer.LedgerAddress2 || '',
      LedgerState: dealer.LedgerState || '',
      LedgerOpening: dealer.LedgerOpening || 0,
      LedgerOpeningDate: dealer.LedgerOpeningDate || null,
      LedgerJoinDate: dealer.LedgerJoinDate || null,
      Email: dealer.Email || '',
      email: dealer.Email || '',
      mobile: dealer.LedgerMobile || '',
      LedgerGSTIN: dealer.LedgerGSTIN || '',
      cmpcode: dealer.cmpcode || dealer.cmpCode || '',
      Cmpguid: dealer.Cmpguid || '',
      Remarks: dealer.Remarks || '',
      isActive: dealer.isActive,
      groupInfo: dealer.groupId ? {
        groupGUID: typeof dealer.groupId === 'object' ? dealer.groupId.GroupGUID : '',
        groupName: typeof dealer.groupId === 'object' ? dealer.groupId.GroupName : ''
      } : null,
      createdAt: dealer.createdAt
    }));

    // Combine all members (users, subdealers, dealers)
    const allMembers = [
      ...formattedUsers,
      ...formattedSubDealers,
      ...formattedDealers
    ].sort((a, b) => {
      // Sort by name alphabetically
      const nameA = a.name?.toLowerCase() || '';
      const nameB = b.name?.toLowerCase() || '';
      return nameA.localeCompare(nameB);
    });

    res.json({
      success: true,
      data: {
        group: {
          _id: group._id.toString(),
          GroupGUID: group.GroupGUID,
          GroupName: group.GroupName,
          GroupParent: group.GroupParent || null,
          cmpcode: group.cmpcode,
          Remarks: group.Remarks || ''
        },
        members: allMembers,
        users: formattedUsers,
        subdealers: formattedSubDealers,
        dealers: formattedDealers,
        totals: {
          totalMembers: allMembers.length,
          totalUsers: formattedUsers.length,
          totalSubDealers: formattedSubDealers.length,
          totalDealers: formattedDealers.length
        }
      }
    });

  } catch (error) {
    console.error("Get users by group error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/groups:
 *   post:
 *     summary: Create a new group for admin's company
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
 *               - GroupName
 *             properties:
 *               GroupGUID:
 *                 type: string
 *                 description: Group GUID (optional, auto-generated if not provided)
 *                 example: "GRP001"
 *               GroupName:
 *                 type: string
 *                 description: Name of the group
 *                 example: "Sales Team A"
 *               GroupParent:
 *                 type: string
 *                 nullable: true
 *                 description: Parent group GUID (optional)
 *                 example: "GRP000"
 *               Remarks:
 *                 type: string
 *                 description: Remarks or notes about the group
 *               other1:
 *                 type: string
 *                 description: Additional field 1
 *               other2:
 *                 type: string
 *                 description: Additional field 2
 *               other3:
 *                 type: string
 *                 description: Additional field 3
 *               other4:
 *                 type: string
 *                 description: Additional field 4
 *               isActive:
 *                 type: boolean
 *                 description: Whether the group is active
 *                 default: true
 *     responses:
 *       201:
 *         description: Group created successfully
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
 *                   example: "Group created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     GroupGUID:
 *                       type: string
 *                     GroupName:
 *                       type: string
 *                     GroupParent:
 *                       type: string
 *                       nullable: true
 *                     cmpcode:
 *                       type: string
 *                     Remarks:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - missing required fields
 *       403:
 *         description: Access denied
 *       409:
 *         description: Group with same GUID already exists
 *       500:
 *         description: Server error
 */
export const createGroup = async (req, res) => {
  try {
    const {
      GroupGUID,
      GroupName,
      GroupParent,
      Remarks,
      other1,
      other2,
      other3,
      other4,
      isActive = true
    } = req.body;

    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Validate required fields
    if (!GroupName || !GroupName.trim()) {
      return res.status(400).json({
        success: false,
        message: "GroupName is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Generate GroupGUID if not provided
    let finalGroupGUID = GroupGUID;
    if (!finalGroupGUID || !finalGroupGUID.trim()) {
      finalGroupGUID = await generateGroupGUID(company.companyCode);
    } else {
      finalGroupGUID = finalGroupGUID.trim();
    }

    // Check if GroupGUID already exists for this company
    const existingGroup = await Group.findOne({
      GroupGUID: finalGroupGUID,
      cmpcode: company.companyCode
    });

    if (existingGroup) {
      return res.status(409).json({
        success: false,
        message: `Group with GUID ${finalGroupGUID} already exists for this company`
      });
    }

    // Validate and convert GroupParent if provided
    let finalGroupParent = null;
    if (GroupParent && GroupParent.trim()) {
      const parentGroup = await Group.findOne({
        GroupGUID: GroupParent.trim(),
        cmpcode: company.companyCode,
        isActive: true
      });

      if (!parentGroup) {
        return res.status(400).json({
          success: false,
          message: `Parent group with GUID ${GroupParent} not found`
        });
      }

      // ✅ Find a user in the parent group to use as GroupParent
      const userInParentGroup = await User.findOne({
        'groups.groupId': parentGroup._id,
        'groups.isActive': true,
        'companies.companyId': companyId,
        'companies.isActive': true,
        isActive: true
      }).select('_id name email');

      if (userInParentGroup) {
        // ✅ Store the user ID as GroupParent
        finalGroupParent = userInParentGroup._id.toString();
        console.log(`✅ Group "${GroupName}" will be created with parent user: ${userInParentGroup.name} (${userInParentGroup.email}) from group "${parentGroup.GroupName}"`);
      } else {
        // ⚠️ No users in parent group yet - store Group GUID temporarily
        // This will need to be fixed later when users are assigned to the parent group
        finalGroupParent = GroupParent.trim();
        console.log(`⚠️ Group "${GroupName}" created with temporary parent GUID: ${GroupParent} (no users in parent group yet)`);
        console.log(`   Run the fixGroupHierarchy script after assigning users to parent group "${parentGroup.GroupName}"`);
      }
    }

    // Create the group
    const newGroup = await Group.create({
      GroupGUID: finalGroupGUID,
      GroupName: GroupName.trim(),
      GroupParent: finalGroupParent, // ✅ Now stores user ID, not Group GUID
      cmpcode: company.companyCode,
      Remarks: Remarks || '',
      other1: other1 || '',
      other2: other2 || '',
      other3: other3 || '',
      other4: other4 || '',
      isActive: isActive !== false,
      companyId: companyId
    });

    res.status(201).json({
      success: true,
      message: "Group created successfully",
      data: {
        _id: newGroup._id,
        GroupGUID: newGroup.GroupGUID,
        GroupName: newGroup.GroupName,
        GroupParent: newGroup.GroupParent,
        cmpcode: newGroup.cmpcode,
        Remarks: newGroup.Remarks,
        other1: newGroup.other1,
        other2: newGroup.other2,
        other3: newGroup.other3,
        other4: newGroup.other4,
        isActive: newGroup.isActive,
        createdAt: newGroup.createdAt
      }
    });

  } catch (error) {
    console.error("Create group error:", error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Group with this GUID already exists for this company"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/groups/{groupId}:
 *   put:
 *     summary: Update an existing group
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               GroupName:
 *                 type: string
 *                 description: Name of the group
 *                 example: "Sales Team A - Updated"
 *               GroupParent:
 *                 type: string
 *                 description: Parent group GUID (optional, set to null to remove parent)
 *                 example: "GRP001"
 *               Remarks:
 *                 type: string
 *                 description: Remarks or notes about the group
 *               other1:
 *                 type: string
 *                 description: Additional field 1
 *               other2:
 *                 type: string
 *                 description: Additional field 2
 *               other3:
 *                 type: string
 *                 description: Additional field 3
 *               other4:
 *                 type: string
 *                 description: Additional field 4
 *               isActive:
 *                 type: boolean
 *                 description: Whether the group is active
 *     responses:
 *       200:
 *         description: Group updated successfully
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
 *                   example: "Group updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     GroupGUID:
 *                       type: string
 *                     GroupName:
 *                       type: string
 *                     GroupParent:
 *                       type: string
 *                       nullable: true
 *                     cmpcode:
 *                       type: string
 *                     Remarks:
 *                       type: string
 *                     isActive:
 *                       type: boolean
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       404:
 *         description: Group not found
 *       500:
 *         description: Server error
 */
export const updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const {
      GroupName,
      GroupParent,
      Remarks,
      other1,
      other2,
      other3,
      other4,
      isActive
    } = req.body;

    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Find the group
    const group = await Group.findOne({
      _id: groupId,
      cmpcode: company.companyCode
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    // Validate and convert GroupParent if provided and different from current
    if (GroupParent !== undefined && GroupParent !== group.GroupParent) {
      if (GroupParent === null || GroupParent === '') {
        // Allow removing parent
        group.GroupParent = null;
        console.log(`✅ Group "${group.GroupName}" parent removed`);
      } else {
        // Validate parent exists
        const parentGroup = await Group.findOne({
          GroupGUID: GroupParent,
          cmpcode: company.companyCode,
          isActive: true
        });

        if (!parentGroup) {
          return res.status(400).json({
            success: false,
            message: `Parent group with GUID ${GroupParent} not found`
          });
        }

        // Prevent circular reference (group cannot be its own parent)
        if (parentGroup._id.toString() === groupId) {
          return res.status(400).json({
            success: false,
            message: "Group cannot be its own parent"
          });
        }

        // ✅ Find a user in the parent group to use as GroupParent
        const userInParentGroup = await User.findOne({
          'groups.groupId': parentGroup._id,
          'groups.isActive': true,
          'companies.companyId': companyId,
          'companies.isActive': true,
          isActive: true
        }).select('_id name email');

        if (userInParentGroup) {
          // ✅ Store the user ID as GroupParent
          group.GroupParent = userInParentGroup._id.toString();
          console.log(`✅ Group "${group.GroupName}" parent updated to user: ${userInParentGroup.name} (${userInParentGroup.email}) from group "${parentGroup.GroupName}"`);
        } else {
          // ⚠️ No users in parent group yet - store Group GUID temporarily
          group.GroupParent = GroupParent;
          console.log(`⚠️ Group "${group.GroupName}" updated with temporary parent GUID: ${GroupParent} (no users in parent group yet)`);
          console.log(`   Run the fixGroupHierarchy script after assigning users to parent group "${parentGroup.GroupName}"`);
        }
      }
    }

    // Update fields if provided
    if (GroupName !== undefined) {
      if (!GroupName || !GroupName.trim()) {
        return res.status(400).json({
          success: false,
          message: "GroupName cannot be empty"
        });
      }
      group.GroupName = GroupName.trim();
    }

    if (Remarks !== undefined) {
      group.Remarks = Remarks || '';
    }

    if (other1 !== undefined) group.other1 = other1 || '';
    if (other2 !== undefined) group.other2 = other2 || '';
    if (other3 !== undefined) group.other3 = other3 || '';
    if (other4 !== undefined) group.other4 = other4 || '';

    if (isActive !== undefined) {
      group.isActive = isActive;
    }

    // Save the updated group
    await group.save();

    res.json({
      success: true,
      message: "Group updated successfully",
      data: {
        _id: group._id,
        GroupGUID: group.GroupGUID,
        GroupName: group.GroupName,
        GroupParent: group.GroupParent,
        cmpcode: group.cmpcode,
        Remarks: group.Remarks,
        other1: group.other1,
        other2: group.other2,
        other3: group.other3,
        other4: group.other4,
        isActive: group.isActive,
        updatedAt: group.updatedAt
      }
    });

  } catch (error) {
    console.error("Update group error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/groups/{groupId}:
 *   delete:
 *     summary: Delete a group (soft delete by setting isActive to false)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: groupId
 *         required: true
 *         schema:
 *           type: string
 *         description: Group ID to delete
 *       - in: query
 *         name: hardDelete
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, permanently delete the group. If false, soft delete (set isActive to false)
 *     responses:
 *       200:
 *         description: Group deleted successfully
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
 *                   example: "Group deleted successfully"
 *       400:
 *         description: Bad request - group has assigned users
 *       403:
 *         description: Access denied
 *       404:
 *         description: Group not found
 *       500:
 *         description: Server error
 */
export const deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { hardDelete } = req.query;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: "Group ID is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Find the group
    const group = await Group.findOne({
      _id: groupId,
      cmpcode: company.companyCode
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Group not found"
      });
    }

    // Check if group has assigned users, dealers, or subdealers
    const usersWithGroup = await User.find({
      'companies.companyId': companyId,
      'groups.groupId': groupId
    }).limit(1);

    const dealersWithGroup = await Ledger.find({
      companyId: companyId,
      groupId: groupId
    }).limit(1);

    const subDealersWithGroup = await SubDealer.find({
      companyId: companyId,
      groupId: groupId
    }).limit(1);

    const hasAssignments = usersWithGroup.length > 0 || dealersWithGroup.length > 0 || subDealersWithGroup.length > 0;

    if (hasAssignments && hardDelete !== 'true') {
      return res.status(400).json({
        success: false,
        message: "Cannot delete group with assigned users, dealers, or subdealers. Remove assignments first or use hardDelete=true to force delete",
        usersCount: usersWithGroup.length,
        dealersCount: dealersWithGroup.length,
        subDealersCount: subDealersWithGroup.length
      });
    }

    if (hardDelete === 'true') {
      // Hard delete - remove group from all users, dealers, and subdealers first
      
      // Remove from users
      if (usersWithGroup.length > 0) {
        await User.updateMany(
          { 'groups.groupId': groupId },
          { $pull: { groups: { groupId: groupId } } }
        );
      }

      // Remove from dealers (Ledger)
      if (dealersWithGroup.length > 0) {
        await Ledger.updateMany(
          { groupId: groupId },
          { $set: { groupId: null } }
        );
      }

      // Remove from subdealers (SubDealer)
      if (subDealersWithGroup.length > 0) {
        await SubDealer.updateMany(
          { groupId: groupId },
          { $set: { groupId: null } }
        );
      }

      // Delete the group
      await Group.findByIdAndDelete(groupId);

      return res.json({
        success: true,
        message: "Group permanently deleted and removed from all users, dealers, and subdealers"
      });
    } else {
      // Soft delete - set isActive to false
      // Also remove groupId from dealers and subdealers to prevent errors
      await Ledger.updateMany(
        { groupId: groupId },
        { $set: { groupId: null } }
      );

      await SubDealer.updateMany(
        { groupId: groupId },
        { $set: { groupId: null } }
      );

      group.isActive = false;
      await group.save();

      return res.json({
        success: true,
        message: "Group deactivated successfully and removed from dealers and subdealers"
      });
    }

  } catch (error) {
    console.error("Delete group error:", error);
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
    // Use ObjectId for proper comparison - handle both string and ObjectId
    let companyObjectId = companyId;
    if (typeof companyId === 'object' && companyId._id) {
      companyObjectId = companyId._id;
    }
    if (typeof companyObjectId === 'string') {
      // Ensure it's a valid ObjectId string
      if (mongoose.Types.ObjectId.isValid(companyObjectId)) {
        companyObjectId = new mongoose.Types.ObjectId(companyObjectId);
      }
    }
    
    // Build base query - match users who have this company
    // Check both companies array and defaultCompany field
    const query = {
      $or: [
        // Users with company in companies array (isActive not false)
        {
          'companies.companyId': companyObjectId,
          'companies.isActive': { $ne: false }
        },
        // Users with company as defaultCompany
        {
          defaultCompany: companyObjectId
        }
      ],
      isActive: { $ne: false } // Include active users and those without isActive set
    };
    
    console.log('🔍 Query companyObjectId:', companyObjectId);
    console.log('🔍 Query companyObjectId type:', typeof companyObjectId);
    console.log('🔍 Admin role:', admin.role);

    // Apply hierarchy-based filtering
    // Admin can see all users in their company (except superadmin, dealers, and subdealers)
    // Dealers and subdealers are managed separately through Ledger and SubDealer models
    if (admin.role === 'admin' || admin.role === 'superadmin') {
      // For admin/superadmin, show all users except other admins/superadmins and dealers/subdealers
      query.role = { $nin: ['admin', 'superadmin', 'dealers', 'subdealer'] };
      query._id = { $ne: adminId }; // Exclude the admin user themselves
    } else if (admin.role === 'groupuser') {
      // For group users, only show users in their assigned group(s)
      if (admin.groups && admin.groups.length > 0) {
        // Get active group IDs
        const activeGroupIds = admin.groups
          .filter(g => g.isActive && g.groupId)
          .map(g => {
            return typeof g.groupId === 'object' && g.groupId._id 
              ? g.groupId._id 
              : (g.groupId || null);
          })
          .filter(id => id !== null);

        if (activeGroupIds.length > 0) {
          // Filter users by group - only show users in the same group(s)
          query['groups.groupId'] = { $in: activeGroupIds };
          query['groups.isActive'] = true;
          console.log('🔍 Group user filtering users by groupIds:', activeGroupIds);
        } else {
          // No active groups, return empty result
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
      } else {
        // No groups assigned, return empty result
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
      // Add role filter - but don't overwrite existing role filter for admin/superadmin
      if (admin.role === 'admin' || admin.role === 'superadmin') {
        // Combine role filter with existing $nin filter
        if (query.role && typeof query.role === 'object' && query.role.$nin) {
          // Add role to the exclusion list if it's not already there
          if (!query.role.$nin.includes(role)) {
            query.role = { $nin: [...query.role.$nin, role] };
          }
        } else {
          query.role = role;
        }
      } else {
        query.role = role;
      }
    }

    // Get users with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Debug logging
    console.log('🔍 Admin getUsersByCompany query:', JSON.stringify(query, null, 2));
    console.log('🔍 Admin companyId:', companyObjectId);
    console.log('🔍 Admin role:', admin.role);
    console.log('🔍 Query details:', {
      companyObjectId: companyObjectId.toString(),
      companyObjectIdType: typeof companyObjectId,
      queryKeys: Object.keys(query)
    });
    
    const users = await User.find(query)
      .select('name email mobile role userName isActive address companies defaultCompany lastLogin createdAt groups hierarchy subdealerDetails assignedDealerIds')
      .populate('hierarchy.parentUserId', 'name email role mobile')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('defaultCompany', 'companyName companyCode')
      .populate('assignedDealerIds', 'LedgerName LedgerGUID LedgerMobile Email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean() to get plain objects for easier manipulation
    
    console.log('🔍 Found users count:', users.length);
    if (users.length > 0) {
      console.log('🔍 Sample user companies:', users[0].companies);
      console.log('🔍 Sample user defaultCompany:', users[0].defaultCompany);
    } else {
      // If no users found, try a simpler query to debug
      const simpleQuery = {
        $or: [
          { 'companies.companyId': companyObjectId },
          { defaultCompany: companyObjectId }
        ]
      };
      const allUsersInCompany = await User.find(simpleQuery).select('_id name email role companies defaultCompany').limit(5).lean();
      console.log('🔍 Debug - All users with company (first 5):', allUsersInCompany);
    }

    // Get total count
    const totalUsers = await User.countDocuments(query);

    // Get company details
    const company = await Company.findById(companyId).select('companyName companyCode maxUser currentUsers').lean();
    
    // Get all companies that users might reference (for populating company names)
    const allCompanyIds = new Set();
    users.forEach(user => {
      if (user.companies && Array.isArray(user.companies)) {
        user.companies.forEach(comp => {
          const cid = comp.companyId?._id || comp.companyId;
          if (cid) {
            allCompanyIds.add(cid.toString());
          }
        });
      }
    });
    
    const companies = await Company.find({
      _id: { $in: Array.from(allCompanyIds).map(id => new mongoose.Types.ObjectId(id)) }
    }).select('companyName companyCode').lean();

    // Format users with correct structure (matching create/edit user format)
    const formattedUsers = await Promise.all(users.map(async (userObj) => {
      // Filter companies to only show the current company
      // Handle both populated and non-populated companyId
      const userCompanies = (userObj.companies || []).filter(comp => {
        if (!comp || !comp.companyId) {
          // If no companyId in companies array, check defaultCompany
          if (userObj.defaultCompany) {
            const defaultCompId = typeof userObj.defaultCompany === 'object' && userObj.defaultCompany._id
              ? userObj.defaultCompany._id.toString()
              : userObj.defaultCompany.toString();
            return defaultCompId === companyObjectId.toString();
          }
          return false;
        }
        
        // Handle populated companyId (object with _id) or direct ObjectId
        let compId = comp.companyId;
        if (typeof compId === 'object' && compId._id) {
          compId = compId._id;
        }
        if (typeof compId === 'object' && compId.toString) {
          compId = compId.toString();
        }
        
        // Compare with target company ID (both as strings for consistency)
        const targetIdStr = companyObjectId.toString();
        const compIdStr = compId.toString();
        
        return compIdStr === targetIdStr && comp.isActive !== false;
      });
      
      // If no companies found in companies array but user has defaultCompany matching, include it
      if (userCompanies.length === 0 && userObj.defaultCompany) {
        const defaultCompId = typeof userObj.defaultCompany === 'object' && userObj.defaultCompany._id
          ? userObj.defaultCompany._id.toString()
          : userObj.defaultCompany.toString();
        if (defaultCompId === companyObjectId.toString()) {
          // User has defaultCompany matching, but no entry in companies array
          // This is valid - include the user
        }
      }
      
      // If no company found, log for debugging but still include the user
      if (userCompanies.length === 0 && userObj.companies && userObj.companies.length > 0) {
        console.log('⚠️ User has companies but not matching current company:', {
          userId: userObj._id,
          userName: userObj.userName,
          userCompanies: userObj.companies.map(c => {
            let cid = c.companyId?._id || c.companyId;
            if (typeof cid === 'object' && cid.toString) cid = cid.toString();
            return {
              companyId: cid,
              companyName: c.companyId?.companyName || 'N/A',
              isActive: c.isActive
            };
          }),
          targetCompanyId: companyObjectId.toString()
        });
      }
      
      const parentUserPopulated = userObj.hierarchy?.parentUserId;
      const parentUserName = parentUserPopulated?.name || '';
      
      // Debug logging for specific users
      if (userObj.email === 'junior@gmail.com' || userObj.email === 'senior@gmail.com') {
        console.log(`🔍 User ${userObj.email} has ${userObj.groups?.length || 0} groups:`, 
          userObj.groups?.map(g => ({
            groupName: g.groupName || g.GroupName,
            isActive: g.isActive
          }))
        );
      }
      
      // Format groups array - ensure groupId is object with GroupName for frontend compatibility
      // Filter out groups that don't exist in the Groups collection
      const formattedGroups = (await Promise.all((userObj.groups || []).map(async (group) => {
        // Get groupId - handle both ObjectId and string
        const groupIdValue = group.groupId;
        let groupIdString = '';
        if (groupIdValue) {
          if (typeof groupIdValue === 'object' && groupIdValue._id) {
            groupIdString = groupIdValue._id.toString();
          } else if (typeof groupIdValue === 'object' && groupIdValue.toString) {
            groupIdString = groupIdValue.toString();
          } else {
            groupIdString = groupIdValue.toString();
          }
        }
        
        // If groupId exists, fetch the group to get all details
        let groupDetails = null;
        if (groupIdString && mongoose.Types.ObjectId.isValid(groupIdString)) {
          groupDetails = await Group.findById(groupIdString).lean();
        }
        
        // IMPORTANT: Skip this group if it doesn't exist in the Groups collection
        if (groupIdString && !groupDetails) {
          console.log(`⚠️ Skipping orphaned group for ${userObj.email}: groupId ${groupIdString} not found in Groups collection`);
          return null; // Will be filtered out below
        }
        
        // Log group details for debugging
        if (userObj.email === 'junior@gmail.com' || userObj.email === 'senior@gmail.com') {
          console.log(`🔍 Group for ${userObj.email}:`, {
            groupIdString,
            groupDetailsName: groupDetails?.GroupName,
            groupName: group.groupName,
            GroupName: group.GroupName,
            isActive: group.isActive
          });
        }
        
        // Get group name - prioritize from groupDetails (which we know exists now)
        const groupName = groupDetails?.GroupName || `Group for ${userObj.name} (${userObj.role})`;
        
        const groupGUID = groupDetails?.GroupGUID || '';
        
        // Build groupId object for frontend (must have GroupName)
        const groupIdObject = groupIdString ? {
          _id: groupIdString,
          GroupGUID: groupGUID,
          GroupName: groupName,
          GroupParent: groupDetails?.GroupParent 
            || group.groupParentUser 
            || group.GroupParent 
            || (parentUserPopulated ? parentUserPopulated._id.toString() : null),
          cmpcode: groupDetails?.cmpcode 
            || group.cmpcode 
            || '',
          Remarks: groupDetails?.Remarks 
            || group.remarks 
            || group.Remarks 
            || `Group for ${userObj.name} (${userObj.role})`,
          other1: groupDetails?.other1 
            || group.other1 
            || userObj.email 
            || '',
          other2: groupDetails?.other2 
            || group.other2 
            || userObj.mobile 
            || '',
          other3: groupDetails?.other3 
            || group.other3 
            || userObj.role 
            || '',
          other4: groupDetails?.other4 
            || group.other4 
            || parentUserName 
            || ''
        } : null;
        
        return {
          groupId: groupIdObject, // Frontend expects this as object with GroupName
          groupGUID: groupGUID,
          GroupGUID: groupGUID,
          groupName: groupName,
          GroupName: groupName, // Frontend checks this directly too
          groupParentUser: groupDetails?.GroupParent 
            || group.groupParentUser 
            || group.GroupParent 
            || (parentUserPopulated ? parentUserPopulated._id.toString() : null),
          GroupParent: groupDetails?.GroupParent 
            || group.groupParentUser 
            || group.GroupParent 
            || (parentUserPopulated ? parentUserPopulated._id.toString() : null),
          cmpcode: groupDetails?.cmpcode 
            || group.cmpcode 
            || '',
          Remarks: groupDetails?.Remarks 
            || group.remarks 
            || group.Remarks 
            || `Group for ${userObj.name} (${userObj.role})`,
          Other1: groupDetails?.other1 
            || group.other1 
            || userObj.email 
            || '',
          Other2: groupDetails?.other2 
            || group.other2 
            || userObj.mobile 
            || '',
          Other3: groupDetails?.other3 
            || group.other3 
            || userObj.role 
            || '',
          Other4: groupDetails?.other4 
            || group.other4 
            || parentUserName 
            || '',
          assignedBy: group.assignedBy || null,
          assignedAt: group.assignedAt || null,
          isActive: group.isActive !== undefined ? group.isActive : true
        };
      }))).filter(group => group !== null); // Remove orphaned groups that returned null
      
      // Format companies array
      let formattedCompanies = [];
      
      // Use filtered companies if found, otherwise use all companies
      const companiesToMap = userCompanies.length > 0 ? userCompanies : (userObj.companies || []);
      
      // If still no companies but user has defaultCompany, try to get company info
      if (companiesToMap.length === 0 && userObj.defaultCompany) {
        const defaultComp = await Company.findById(userObj.defaultCompany).lean();
        if (defaultComp) {
          formattedCompanies = [{
            companyId: {
              _id: defaultComp._id,
              companyName: defaultComp.companyName || '',
              companyCode: defaultComp.companyCode || ''
            },
            role: userObj.role || 'groupuser',
            isActive: true,
            assignedBy: null,
            assignedAt: null
          }];
        }
      } else {
        formattedCompanies = companiesToMap.map(comp => {
          // Handle both populated and non-populated companyId
          let compId = comp.companyId;
          if (typeof compId === 'object' && compId._id) {
            compId = compId._id;
          }
          
          // Get company name and code - check if populated or need to fetch
          let companyName = '';
          let companyCode = '';
          
          if (typeof comp.companyId === 'object' && comp.companyId?.companyName) {
            // Already populated
            companyName = comp.companyId.companyName;
            companyCode = comp.companyId.companyCode || '';
          } else if (compId && mongoose.Types.ObjectId.isValid(compId)) {
            // Not populated, but we have the ID - fetch it from companies array
            const companyDoc = companies.find(c => c._id.toString() === compId.toString());
            if (companyDoc) {
              companyName = companyDoc.companyName || '';
              companyCode = companyDoc.companyCode || '';
            }
          }
          
          return {
            companyId: {
              _id: compId,
              companyName: companyName,
              companyCode: companyCode
            },
            role: comp.role || userObj.role || 'groupuser',
            isActive: comp.isActive !== undefined ? comp.isActive : true,
            assignedBy: comp.assignedBy || null,
            assignedAt: comp.assignedAt || null
          };
        });
      }
      
      // Determine primaryGroup (first active group with valid groupId)
      let primaryGroup = null;
      if (formattedGroups.length > 0) {
        const firstGroup = formattedGroups[0];
        if (firstGroup.groupId && typeof firstGroup.groupId === 'object' && firstGroup.groupId._id) {
          // groupId is an object
          primaryGroup = {
            _id: firstGroup.groupId._id,
            GroupGUID: firstGroup.GroupGUID || firstGroup.groupId.GroupGUID || '',
            GroupName: firstGroup.GroupName || firstGroup.groupId.GroupName || '',
            GroupParent: firstGroup.GroupParent || firstGroup.groupId.GroupParent || null,
            cmpcode: firstGroup.cmpcode || firstGroup.groupId.cmpcode || '',
            Remarks: firstGroup.Remarks || firstGroup.groupId.Remarks || '',
            Other1: firstGroup.Other1 || firstGroup.groupId.Other1 || '',
            Other2: firstGroup.Other2 || firstGroup.groupId.Other2 || '',
            Other3: firstGroup.Other3 || firstGroup.groupId.Other3 || '',
            Other4: firstGroup.Other4 || firstGroup.groupId.Other4 || ''
          };
        } else if (firstGroup.GroupName) {
          // groupId is a string but we have GroupName
          primaryGroup = {
            _id: firstGroup.groupId || '',
            GroupGUID: firstGroup.GroupGUID || '',
            GroupName: firstGroup.GroupName || '',
            GroupParent: firstGroup.GroupParent || null,
            cmpcode: firstGroup.cmpcode || '',
            Remarks: firstGroup.Remarks || '',
            Other1: firstGroup.Other1 || '',
            Other2: firstGroup.Other2 || '',
            Other3: firstGroup.Other3 || '',
            Other4: firstGroup.Other4 || ''
          };
        }
      }
      
      return {
        _id: userObj._id,
        name: userObj.name,
        email: userObj.email,
        mobile: userObj.mobile,
        role: userObj.role,
        userName: userObj.userName,
        isActive: userObj.isActive,
        address: userObj.address || {}, // Include address in response
        groups: formattedGroups,
        primaryGroup: primaryGroup,
        hierarchy: {
          parentUser: parentUserPopulated ? {
            _id: parentUserPopulated._id || parentUserPopulated.toString(),
            name: parentUserPopulated.name || null,
            email: parentUserPopulated.email || null,
            role: parentUserPopulated.role || null
          } : null,
          level: userObj.hierarchy?.level || null
        },
        companies: formattedCompanies,
        assignedDealerIds: userObj.assignedDealerIds || [], // Include assigned dealer IDs
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
    const { name, email, mobile, role, userName, isActive, address, parentUserId, subdealerDetails, groupId, groupGUID, password } = req.body;
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

    // Validate required fields (role is optional - defaults to 'groupuser')
    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        message: "Name and mobile are required"
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

    // For regular users (group users), role should be 'groupuser' or empty
    // Only superadmin, admin, dealers, and subdealers should have specific roles
    // If role is not provided or empty, default to 'groupuser'
    const finalRole = role || 'groupuser';
    
    // Store old role to check if it changed
    const oldRole = userToEdit.role;
    const roleChanged = oldRole !== finalRole;

    // Update user details
    userToEdit.name = name;
    userToEdit.mobile = mobile;
    userToEdit.role = finalRole;
    userToEdit.isActive = isActive !== undefined ? isActive : userToEdit.isActive;
    
    if (email) {
      userToEdit.email = email;
    }
    
    if (userName) {
      userToEdit.userName = userName;
    }

    // Update password only if provided
    if (password && password.trim()) {
      userToEdit.password = await bcrypt.hash(password.trim(), 10);
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
    if (finalRole === 'subdealer' && subdealerDetails) {
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
    } else if (finalRole !== 'subdealer') {
      // Clear subdealer details if role changed from subdealer to something else
      userToEdit.subdealerDetails = undefined;
    }

    // Update the role in the companies array
    const companyIndex = userToEdit.companies.findIndex(
      comp => comp.companyId.toString() === companyId.toString()
    );
    
    if (companyIndex !== -1) {
      userToEdit.companies[companyIndex].role = finalRole;
    }

    // Initialize hierarchy if it doesn't exist
    if (!userToEdit.hierarchy) {
      userToEdit.hierarchy = {};
    }

    // Update hierarchy level if role changed
    if (roleChanged) {
      userToEdit.hierarchy.level = getRoleLevel(finalRole);
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

    // Handle parent user update
    let parentUser = null;
    if (parentUserId) {
      // Validate that the parent user exists and is in the same company
      parentUser = await User.findOne({
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
      userToEdit.hierarchy.level = getRoleLevel(finalRole);

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

      // Update groups array with the found/created group (when parentUserId is provided)
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
          // Update existing group in groups array - ALWAYS update if groupId is provided
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
    } else if (parentUserId === null || parentUserId === undefined || parentUserId === '') {
      // If parentUserId is explicitly cleared/not provided, check if we should clear hierarchy
      // Only clear if groupId/groupGUID is also not provided
      if (!groupId && !groupGUID) {
        userToEdit.hierarchy.parentUserId = null;
        userToEdit.hierarchy.parentUserName = null;
        userToEdit.hierarchy.parentUserRole = null;
        userToEdit.hierarchy.parentGroupGUID = null;
        // Clear groups array only if no group is being assigned
        userToEdit.groups = [];
      }
    }
    
    // Handle direct group assignment (groupId/groupGUID) when parentUserId is NOT provided
    // This handles the case where user only changes the group without changing parent user
    // OR when user explicitly removes parent user but keeps/assigns a group
    if ((groupId || groupGUID) && foundGroupId && !parentUserId) {
      // Check if this group is already in the user's groups array
      const groupIndex = userToEdit.groups.findIndex(
        g => g.groupId && g.groupId.toString() === foundGroupId.toString()
      );
      
      // Get parent user name for other4 field (from existing hierarchy if available)
      const parentUserNameForGroup = userToEdit.hierarchy?.parentUserName || foundOther4 || '';
      
      if (groupIndex === -1) {
        // Add new group to groups array
        userToEdit.groups.push({
          groupId: foundGroupId,
          groupGUID: foundGroupGUID,
          groupName: foundGroupName,
          groupParentUser: foundGroupParent || null,
          cmpcode: foundCmpcode,
          remarks: foundGroupRemarks || `Group for ${name} (${role})`,
          other1: foundOther1 || email || userToEdit.email || '',
          other2: foundOther2 || mobile || userToEdit.mobile || '',
          other3: foundOther3 || role || '',
          other4: foundOther4 || parentUserNameForGroup || '',
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
          groupParentUser: foundGroupParent || userToEdit.groups[groupIndex].groupParentUser,
          cmpcode: foundCmpcode,
          remarks: foundGroupRemarks || `Group for ${name} (${role})`,
          other1: foundOther1 || email || userToEdit.email || '',
          other2: foundOther2 || mobile || userToEdit.mobile || '',
          other3: foundOther3 || role || '',
          other4: foundOther4 || parentUserNameForGroup || '',
          assignedBy: adminId,
          isActive: true,
          assignedAt: new Date()
        };
      }
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
    
    // Format groups array - ensure groupId is object with GroupName for frontend compatibility (same as getUsersByCompany)
    // Filter out orphaned groups
    const formattedGroups = (await Promise.all((updatedUser.groups || []).map(async (group) => {
      // Get groupId - handle both ObjectId and string
      const groupIdValue = group.groupId;
      let groupIdString = '';
      if (groupIdValue) {
        if (typeof groupIdValue === 'object' && groupIdValue._id) {
          groupIdString = groupIdValue._id.toString();
        } else if (typeof groupIdValue === 'object' && groupIdValue.toString) {
          groupIdString = groupIdValue.toString();
        } else {
          groupIdString = groupIdValue.toString();
        }
      }
      
      // If groupId exists, fetch the group to get all details
      let groupDetails = null;
      if (groupIdString && mongoose.Types.ObjectId.isValid(groupIdString)) {
        groupDetails = await Group.findById(groupIdString).lean();
      }
      
      // IMPORTANT: Skip this group if it doesn't exist in the Groups collection
      if (groupIdString && !groupDetails) {
        console.log(`⚠️ editUser - Skipping orphaned group for ${updatedUser.email}: groupId ${groupIdString} not found in Groups collection`);
        return null; // Will be filtered out
      }
      
      // Get group name - prioritize from groupDetails (which we know exists now)
      const groupName = groupDetails?.GroupName || `Group for ${updatedUser.name} (${updatedUser.role})`;
      
      const groupGUID = groupDetails?.GroupGUID || '';
      
      // Build groupId object for frontend (must have GroupName)
      const groupIdObject = groupIdString ? {
        _id: groupIdString,
        GroupGUID: groupGUID,
        GroupName: groupName,
        GroupParent: groupDetails?.GroupParent 
          || group.groupParentUser 
          || group.GroupParent 
          || (parentUserId ? parentUserId.toString() : null),
        cmpcode: groupDetails?.cmpcode 
          || group.cmpcode 
          || '',
        Remarks: groupDetails?.Remarks 
          || group.remarks 
          || group.Remarks 
          || `Group for ${updatedUser.name} (${updatedUser.role})`,
        other1: groupDetails?.other1 
          || group.other1 
          || updatedUser.email 
          || '',
        other2: groupDetails?.other2 
          || group.other2 
          || updatedUser.mobile 
          || '',
        other3: groupDetails?.other3 
          || group.other3 
          || updatedUser.role 
          || '',
        other4: groupDetails?.other4 
          || group.other4 
          || parentUserName 
          || ''
      } : null;
      
      return {
        groupId: groupIdObject, // Frontend expects this as object with GroupName
        groupGUID: groupGUID,
        GroupGUID: groupGUID,
        groupName: groupName,
        GroupName: groupName, // Frontend checks this directly too
        groupParentUser: groupDetails?.GroupParent 
          || group.groupParentUser 
          || group.GroupParent 
          || (parentUserId ? parentUserId.toString() : null),
        GroupParent: groupDetails?.GroupParent 
          || group.groupParentUser 
          || group.GroupParent 
          || (parentUserId ? parentUserId.toString() : null),
        cmpcode: groupDetails?.cmpcode 
          || group.cmpcode 
          || '',
        Remarks: groupDetails?.Remarks 
          || group.remarks 
          || group.Remarks 
          || `Group for ${updatedUser.name} (${updatedUser.role})`,
        Other1: groupDetails?.other1 
          || group.other1 
          || updatedUser.email 
          || '',
        Other2: groupDetails?.other2 
          || group.other2 
          || updatedUser.mobile 
          || '',
        Other3: groupDetails?.other3 
          || group.other3 
          || updatedUser.role 
          || '',
        Other4: groupDetails?.other4 
          || group.other4 
          || parentUserName 
          || '',
        assignedBy: group.assignedBy || adminId,
        assignedAt: group.assignedAt || new Date(),
        isActive: group.isActive !== undefined ? group.isActive : true
      };
    }))).filter(group => group !== null); // Remove orphaned groups
    
    // Determine primaryGroup (first active group with valid groupId)
    let primaryGroup = null;
    if (formattedGroups.length > 0) {
      const firstGroup = formattedGroups[0];
      if (firstGroup.groupId && typeof firstGroup.groupId === 'object' && firstGroup.groupId._id) {
        // groupId is an object
        primaryGroup = {
          _id: firstGroup.groupId._id,
          GroupGUID: firstGroup.GroupGUID || firstGroup.groupId.GroupGUID || '',
          GroupName: firstGroup.GroupName || firstGroup.groupId.GroupName || '',
          GroupParent: firstGroup.GroupParent || firstGroup.groupId.GroupParent || null,
          cmpcode: firstGroup.cmpcode || firstGroup.groupId.cmpcode || '',
          Remarks: firstGroup.Remarks || firstGroup.groupId.Remarks || '',
          Other1: firstGroup.Other1 || firstGroup.groupId.Other1 || '',
          Other2: firstGroup.Other2 || firstGroup.groupId.Other2 || '',
          Other3: firstGroup.Other3 || firstGroup.groupId.Other3 || '',
          Other4: firstGroup.Other4 || firstGroup.groupId.Other4 || ''
        };
      } else if (firstGroup.GroupName) {
        // groupId is a string but we have GroupName
        primaryGroup = {
          _id: firstGroup.groupId || '',
          GroupGUID: firstGroup.GroupGUID || '',
          GroupName: firstGroup.GroupName || '',
          GroupParent: firstGroup.GroupParent || null,
          cmpcode: firstGroup.cmpcode || '',
          Remarks: firstGroup.Remarks || '',
          Other1: firstGroup.Other1 || '',
          Other2: firstGroup.Other2 || '',
          Other3: firstGroup.Other3 || '',
          Other4: firstGroup.Other4 || ''
        };
      }
    }
    
    // Format companies array (same as getUsersByCompany)
    const formattedCompanies = (updatedUser.companies || []).map(comp => {
      let compId = comp.companyId;
      if (typeof compId === 'object' && compId._id) {
        compId = compId._id;
      }
      if (typeof compId === 'object' && compId.toString) {
        compId = compId.toString();
      }
      
      let companyName = '';
      let companyCode = '';
      
      if (typeof comp.companyId === 'object' && comp.companyId?.companyName) {
        // Already populated
        companyName = comp.companyId.companyName;
        companyCode = comp.companyId.companyCode || '';
      } else if (compId && mongoose.Types.ObjectId.isValid(compId)) {
        // Not populated, fetch from populated companies
        const companyDoc = updatedUser.companies?.find(c => {
          const cid = c.companyId?._id || c.companyId;
          return cid && cid.toString() === compId.toString();
        });
        if (companyDoc && typeof companyDoc.companyId === 'object' && companyDoc.companyId?.companyName) {
          companyName = companyDoc.companyId.companyName;
          companyCode = companyDoc.companyId.companyCode || '';
        }
      }
      
      return {
        companyId: {
          _id: compId,
          companyName: companyName,
          companyCode: companyCode
        },
        role: comp.role || updatedUser.role || 'groupuser',
        isActive: comp.isActive !== undefined ? comp.isActive : true,
        assignedBy: comp.assignedBy || null,
        assignedAt: comp.assignedAt || null
      };
    });
    
    const responseUser = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      mobile: updatedUser.mobile,
      role: updatedUser.role,
      userName: updatedUser.userName,
      isActive: updatedUser.isActive,
      address: updatedUser.address || {}, // Include address in response
      groups: formattedGroups,
      primaryGroup: primaryGroup, // Include primaryGroup for frontend
      hierarchy: {
        parentUser: parentUserPopulated ? {
          _id: parentUserPopulated._id || parentUserPopulated.toString(),
          name: parentUserPopulated.name || null,
          email: parentUserPopulated.email || null,
          role: parentUserPopulated.role || null
        } : null,
        level: updatedUser.hierarchy?.level || null
      },
      companies: formattedCompanies // Use formatted companies
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
// Assign user to another company
export const assignUserToCompany = async (req, res) => {
  try {
    const { userId } = req.params;
    const { companyId: targetCompanyId } = req.body;
    const adminId = req.user.userId;
    const currentCompanyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!targetCompanyId) {
      return res.status(400).json({
        success: false,
        message: "Target company ID is required"
      });
    }

    // Get admin with all companies
    const admin = await User.findById(adminId).populate('companies.companyId');
    if (!admin || !admin.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "Admin not found or no company assigned"
      });
    }

    // Check if admin has access to the target company
    const adminCompanyIds = admin.companies
      .filter(c => c.isActive)
      .map(c => c.companyId._id.toString());
    
    const adminDefaultCompanyId = admin.defaultCompany._id.toString();
    const allAdminCompanyIds = [...new Set([...adminCompanyIds, adminDefaultCompanyId])];
    
    if (!allAdminCompanyIds.includes(targetCompanyId.toString())) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to assign users to this company"
      });
    }

    // Get target company
    const targetCompany = await Company.findById(targetCompanyId);
    if (!targetCompany) {
      return res.status(404).json({
        success: false,
        message: "Target company not found"
      });
    }

    // Get user to assign
    const userToAssign = await User.findById(userId);
    if (!userToAssign) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Check if user already exists in target company
    const existingCompanyAssignment = userToAssign.companies.find(
      comp => comp.companyId.toString() === targetCompanyId.toString()
    );

    if (existingCompanyAssignment) {
      // If assignment exists but is inactive, reactivate it
      if (!existingCompanyAssignment.isActive) {
        existingCompanyAssignment.isActive = true;
        existingCompanyAssignment.assignedBy = adminId;
        existingCompanyAssignment.assignedAt = new Date();
        await userToAssign.save();

        // Update company user count
        await Company.findByIdAndUpdate(targetCompanyId, {
          $inc: { currentUsers: 1 }
        });

        const updatedUser = await User.findById(userId)
          .select('-password')
          .populate('defaultCompany', 'companyName companyCode')
          .populate('companies.companyId', 'companyName companyCode');

        return res.json({
          success: true,
          message: "User company assignment reactivated",
          user: updatedUser
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "User is already assigned to this company"
        });
      }
    }

    // Add company to user's companies array
    userToAssign.companies.push({
      companyId: targetCompanyId,
      role: userToAssign.role || 'groupuser',
      isActive: true,
      assignedBy: adminId,
      assignedAt: new Date()
    });

    // Set as default company if user doesn't have one
    if (!userToAssign.defaultCompany) {
      userToAssign.defaultCompany = targetCompanyId;
    }

    await userToAssign.save();

    // Update company's user count
    await Company.findByIdAndUpdate(targetCompanyId, {
      $inc: { currentUsers: 1 }
    });

    const updatedUser = await User.findById(userId)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode')
      .populate('companies.companyId', 'companyName companyCode');

    return res.json({
      success: true,
      message: "User assigned to company successfully",
      user: updatedUser
    });

  } catch (error) {
    console.error("Assign user to company error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Fix group hierarchy - Update groups with incorrect GroupParent (GUID) to use user IDs
 * This endpoint finds groups where GroupParent is a Group GUID and updates it to the user ID
 */
export const fixGroupHierarchy = async (req, res) => {
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

    // Get company
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    console.log('🔧 Fixing group hierarchy for company:', company.companyName);

    // Find all groups in this company
    const allGroups = await Group.find({
      companyId: companyId,
      isActive: true
    }).lean();

    console.log(`Found ${allGroups.length} groups to check`);

    const groupsToFix = [];
    const fixedGroups = [];

    // Check each group
    for (const group of allGroups) {
      if (group.GroupParent) {
        // Check if GroupParent is a Group GUID (not a user ID)
        const isGroupGUID = await Group.findOne({
          GroupGUID: group.GroupParent,
          companyId: companyId
        });

        if (isGroupGUID) {
          // This group has a Group GUID as parent, need to fix it
          console.log(`❌ Group "${group.GroupName}" has incorrect GroupParent: ${group.GroupParent} (should be user ID)`);
          
          // Find users in the parent group
          const usersInParentGroup = await User.find({
            'groups.groupGUID': group.GroupParent,
            'companies.companyId': companyId,
            isActive: true
          }).select('_id name').lean();

          if (usersInParentGroup.length > 0) {
            // Use the first user as the parent
            const parentUserId = usersInParentGroup[0]._id.toString();
            console.log(`✅ Updating Group "${group.GroupName}" parent to user: ${usersInParentGroup[0].name} (${parentUserId})`);

            // Update the group
            await Group.findByIdAndUpdate(group._id, {
              GroupParent: parentUserId
            });

            groupsToFix.push({
              groupName: group.GroupName,
              oldParent: group.GroupParent,
              newParent: parentUserId,
              parentUserName: usersInParentGroup[0].name
            });

            fixedGroups.push(group.GroupName);
          } else {
            console.log(`⚠️ No users found in parent group for "${group.GroupName}"`);
          }
        }
      }
    }

    return res.json({
      success: true,
      message: `Fixed ${fixedGroups.length} groups`,
      data: {
        totalGroups: allGroups.length,
        groupsFixed: fixedGroups.length,
        details: groupsToFix
      }
    });

  } catch (error) {
    console.error("Fix group hierarchy error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

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
    'groupuser': 10, // Group users have a high level (no hierarchy)
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

// Generate LedgerGUID similar to GroupGUID
const generateLedgerGUID = async (cmpcode) => {
  try {
    // Find all existing ledgers for this company
    const existingLedgers = await Ledger.find({ cmpcode })
      .select('LedgerGUID')
      .sort({ LedgerGUID: -1 })
      .limit(100);

    let maxNumber = 0;

    // Extract numeric part from existing LedgerGUIDs
    for (const ledger of existingLedgers) {
      const guid = ledger.LedgerGUID || '';
      // Match patterns like "LED001", "LED009", "LED123", etc.
      const match = guid.match(/^LED(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    // Generate next sequential number
    const nextNumber = maxNumber + 1;
    const newGUID = `LED${String(nextNumber).padStart(3, '0')}`;

    // Verify uniqueness (handle race conditions)
    const exists = await Ledger.findOne({ LedgerGUID: newGUID, cmpcode });
    if (exists) {
      // If exists, try next number
      return `LED${String(nextNumber + 1).padStart(3, '0')}`;
    }

    return newGUID;
  } catch (error) {
    console.error('Error generating LedgerGUID:', error);
    // Fallback to timestamp-based GUID if sequential fails
    const timestamp = Date.now().toString(36).toUpperCase();
    return `LED-${timestamp}`;
  }
};

/**
 * @swagger
 * /api/v1/admin/dealers:
 *   post:
 *     summary: Create a new dealer (ledger) for admin's company
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
 *               - LedgerName
 *             properties:
 *               LedgerGUID:
 *                 type: string
 *                 description: Ledger GUID (optional, auto-generated if not provided)
 *                 example: "LED001"
 *               LedgerName:
 *                 type: string
 *                 description: Name of the dealer/ledger
 *                 example: "ABC Dealer"
 *               LedgerParent:
 *                 type: string
 *                 nullable: true
 *                 description: Parent ledger GUID (optional)
 *                 example: "LED000"
 *               SalesMan:
 *                 type: string
 *                 description: Salesman user ID (optional)
 *               ASM:
 *                 type: string
 *                 description: ASM user ID (optional)
 *               RSM:
 *                 type: string
 *                 description: RSM user ID (optional)
 *               ZSM:
 *                 type: string
 *                 description: ZSM user ID (optional)
 *               LedgerMobile:
 *                 type: string
 *                 description: Dealer mobile number
 *               LedgerContact:
 *                 type: string
 *                 description: Dealer contact person
 *               Email:
 *                 type: string
 *                 format: email
 *                 description: Dealer email
 *               LedgerAddress1:
 *                 type: string
 *                 description: Address line 1
 *               LedgerAddress2:
 *                 type: string
 *                 description: Address line 2
 *               LedgerState:
 *                 type: string
 *                 description: State
 *               LedgerOpening:
 *                 type: number
 *                 description: Opening balance
 *                 default: 0
 *               LedgerOpeningDate:
 *                 type: string
 *                 format: date
 *                 description: Opening balance date
 *               LedgerJoinDate:
 *                 type: string
 *                 format: date
 *                 description: Join date
 *               Remarks:
 *                 type: string
 *                 description: Remarks
 *               Other1:
 *                 type: string
 *               Other2:
 *                 type: string
 *               Other3:
 *                 type: string
 *               Other4:
 *                 type: string
 *               Other5:
 *                 type: string
 *               other6:
 *                 type: string
 *               other7:
 *                 type: string
 *               other8:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Dealer created successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const createDealer = async (req, res) => {
  try {
    const {
      LedgerGUID,
      LedgerName,
      LedgerParent,
      SalesMan,
      ASM,
      RSM,
      ZSM,
      LedgerMobile,
      LedgerContact,
      Email,
      password,
      LedgerGSTIN,
      LedgerAddress1,
      LedgerAddress2,
      LedgerState,
      LedgerOpening,
      LedgerOpeningDate,
      LedgerJoinDate,
      Cmpguid,
      cmpCode,
      Remarks,
      Other1,
      Other2,
      Other3,
      Other4,
      Other5,
      other6,
      other7,
      other8,
      groupId,
      groupUserId, // NEW: For admin to directly assign dealer to a group user
      isActive = true
    } = req.body;

    const userId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userRole = req.user.userDetails.role || '';

    // Validate required fields
    if (!LedgerName || !LedgerName.trim()) {
      return res.status(400).json({
        success: false,
        message: "LedgerName is required"
      });
    }

    // Check if user has access to the company
    const user = await User.findById(userId).populate('defaultCompany');
    if (!user || !user.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this user"
      });
    }

    // Handle group assignment based on user role and provided parameters
    let finalGroupId = groupId;
    let assignedGroupUserId = userId; // By default, current user is the creator
    
    // If admin provides groupUserId, assign dealer to that group user's group
    if (groupUserId && (userRole === 'admin' || userRole === 'superadmin')) {
      console.log('🔍 Admin assigning dealer to group user:', groupUserId);
      const targetGroupUser = await User.findById(groupUserId).populate('groups.groupId').select('groups');
      if (!targetGroupUser) {
        return res.status(400).json({
          success: false,
          message: "Group user not found"
        });
      }
      
      console.log('🔍 Target group user groups:', JSON.stringify(targetGroupUser.groups, null, 2));
      console.log('🔍 Admin current company:', companyId.toString());
      
      // Find the group that belongs to the admin's current company
      if (targetGroupUser.groups && targetGroupUser.groups.length > 0) {
        // First, try to find a group that matches the current company
        let activeGroup = null;
        
        for (const g of targetGroupUser.groups) {
          // Skip inactive groups
          if (g.isActive === false) continue;
          if (!g.groupId) continue;
          
          // Get the group details
          let groupDetails = null;
          if (typeof g.groupId === 'object' && g.groupId !== null) {
            groupDetails = g.groupId; // Already populated
          } else {
            // Fetch the group if not populated
            groupDetails = await Group.findById(g.groupId);
          }
          
          if (groupDetails) {
            const groupCompanyId = groupDetails.companyId ? groupDetails.companyId.toString() : null;
            const currentCompanyId = companyId.toString();
            
            console.log('🔍 Checking group:', {
              groupId: groupDetails._id,
              groupName: groupDetails.GroupName,
              groupCompanyId,
              currentCompanyId,
              matches: groupCompanyId === currentCompanyId
            });
            
            // Check if this group belongs to the current company
            if (groupCompanyId === currentCompanyId) {
              activeGroup = g;
              console.log('✅ Found matching group for current company');
              break;
            }
          }
        }
        
        if (activeGroup) {
          finalGroupId = typeof activeGroup.groupId === 'object' && activeGroup.groupId !== null && activeGroup.groupId._id
            ? activeGroup.groupId._id
            : activeGroup.groupId;
          assignedGroupUserId = groupUserId; // Set the creator as the group user
          console.log('🔍 Assigning dealer to group user\'s group:', finalGroupId, 'for user:', groupUserId);
        } else {
          console.log('⚠️ No active group found for group user in the current company');
          return res.status(400).json({
            success: false,
            message: "Group user has no active groups in the current company. Please ensure the group user has a group assigned to this company."
          });
        }
      } else {
        console.log('⚠️ Group user has no groups');
        return res.status(400).json({
          success: false,
          message: "Group user has no groups assigned"
        });
      }
    }
    // For group users creating dealers themselves, auto-assign to their first active group
    else if ((userRole === 'groupuser' || !userRole || userRole === '') && !groupId && user.groups && user.groups.length > 0) {
      // Find first active group
      const activeGroup = user.groups.find(g => (g.isActive === true || g.isActive === undefined) && g.groupId);
      if (activeGroup) {
        finalGroupId = typeof activeGroup.groupId === 'object' && activeGroup.groupId !== null && activeGroup.groupId._id
          ? activeGroup.groupId._id
          : activeGroup.groupId;
        console.log('🔍 Auto-assigning dealer to group user\'s group:', finalGroupId);
      }
    }

    // Convert companyId to string for comparison
    const userCompanyId = user.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (userCompanyId !== targetCompanyId) {
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

    // Generate LedgerGUID if not provided
    let finalLedgerGUID = LedgerGUID;
    if (!finalLedgerGUID || !finalLedgerGUID.trim()) {
      finalLedgerGUID = await generateLedgerGUID(company.companyCode);
    } else {
      finalLedgerGUID = finalLedgerGUID.trim();
    }

    // Check if LedgerGUID already exists for this company
    const existingLedger = await Ledger.findOne({
      LedgerGUID: finalLedgerGUID,
      cmpcode: company.companyCode
    });

    if (existingLedger) {
      return res.status(409).json({
        success: false,
        message: `Ledger with GUID ${finalLedgerGUID} already exists for this company`
      });
    }

    // Validate LedgerParent if provided
    if (LedgerParent && LedgerParent.trim()) {
      const parentLedger = await Ledger.findOne({
        LedgerGUID: LedgerParent.trim(),
        cmpcode: company.companyCode
      });

      if (!parentLedger) {
        return res.status(400).json({
          success: false,
          message: `Parent ledger with GUID ${LedgerParent} not found`
        });
      }
    }

    // Validate and assign group if provided (or use auto-assigned group for group users)
    // Note: finalGroupId is already declared above for group user auto-assignment
    if (finalGroupId) {
      console.log('🔍 Validating group:', {
        finalGroupId,
        companyId,
        targetCompanyId
      });
      
      const group = await Group.findOne({ 
        _id: finalGroupId, 
        companyId: companyId,
        isActive: true 
      });
      
      console.log('🔍 Group validation result:', group ? { 
        _id: group._id, 
        GroupName: group.GroupName,
        companyId: group.companyId,
        isActive: group.isActive 
      } : 'NOT FOUND');
      
      if (!group) {
        // Try to find the group without company filter to see if it exists at all
        const groupAnyCompany = await Group.findOne({ _id: finalGroupId });
        console.log('🔍 Group in any company:', groupAnyCompany ? {
          _id: groupAnyCompany._id,
          GroupName: groupAnyCompany.GroupName,
          companyId: groupAnyCompany.companyId,
          isActive: groupAnyCompany.isActive
        } : 'NOT FOUND AT ALL');
        
        return res.status(400).json({
          success: false,
          message: "Group not found or not active for this company"
        });
      }
      finalGroupId = group._id;
    } else {
      finalGroupId = null;
    }

    // Validate hierarchy users if provided
    const hierarchyUsers = {};
    if (SalesMan) {
      const salesman = await User.findOne({ _id: SalesMan, 'companies.companyId': companyId });
      if (!salesman) {
        return res.status(400).json({
          success: false,
          message: "SalesMan user not found"
        });
      }
      hierarchyUsers.SalesMan = SalesMan;
    }
    if (ASM) {
      const asm = await User.findOne({ _id: ASM, 'companies.companyId': companyId });
      if (!asm) {
        return res.status(400).json({
          success: false,
          message: "ASM user not found"
        });
      }
      hierarchyUsers.ASM = ASM;
    }
    if (RSM) {
      const rsm = await User.findOne({ _id: RSM, 'companies.companyId': companyId });
      if (!rsm) {
        return res.status(400).json({
          success: false,
          message: "RSM user not found"
        });
      }
      hierarchyUsers.RSM = RSM;
    }
    if (ZSM) {
      const zsm = await User.findOne({ _id: ZSM, 'companies.companyId': companyId });
      if (!zsm) {
        return res.status(400).json({
          success: false,
          message: "ZSM user not found"
        });
      }
      hierarchyUsers.ZSM = ZSM;
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password && password.trim()) {
      hashedPassword = await bcrypt.hash(password.trim(), 10);
    }

    // Create the ledger
    const newLedger = await Ledger.create({
      LedgerGUID: finalLedgerGUID,
      LedgerName: LedgerName.trim(),
      LedgerParent: LedgerParent && LedgerParent.trim() ? LedgerParent.trim() : null,
      cmpcode: company.companyCode,
      cmpCode: cmpCode || company.companyCode,
      Cmpguid: Cmpguid || company.guid || company.companyCode,
      LedgerMobile: LedgerMobile || '',
      LedgerContact: LedgerContact || '',
      Email: Email || '',
      password: hashedPassword,
      LedgerGSTIN: LedgerGSTIN ? LedgerGSTIN.trim().toUpperCase() : '',
      LedgerAddress1: LedgerAddress1 || '',
      LedgerAddress2: LedgerAddress2 || '',
      LedgerState: LedgerState || '',
      LedgerOpening: LedgerOpening || 0,
      LedgerOpeningDate: LedgerOpeningDate ? new Date(LedgerOpeningDate) : null,
      LedgerJoinDate: LedgerJoinDate ? new Date(LedgerJoinDate) : null,
      Remarks: Remarks || '',
      Other1: Other1 || '',
      Other2: Other2 || '',
      Other3: Other3 || '',
      Other4: Other4 || '',
      Other5: Other5 || '',
      other6: other6 || '',
      other7: other7 || '',
      other8: other8 || '',
      groupId: finalGroupId,
      isActive: isActive !== false,
      companyId: companyId,
      ...hierarchyUsers,
      createdBy: assignedGroupUserId // Track who created/owns the dealer (group user if assigned via groupUserId)
    });

    // Populate group if assigned
    if (finalGroupId) {
      await newLedger.populate('groupId', 'GroupGUID GroupName GroupParent cmpcode');
    }

    res.status(201).json({
      success: true,
      message: "Dealer created successfully",
      data: {
        _id: newLedger._id,
        LedgerGUID: newLedger.LedgerGUID,
        LedgerName: newLedger.LedgerName,
        LedgerParent: newLedger.LedgerParent,
        cmpcode: newLedger.cmpcode,
        cmpCode: newLedger.cmpCode,
        Cmpguid: newLedger.Cmpguid,
        SalesMan: newLedger.SalesMan,
        ASM: newLedger.ASM,
        RSM: newLedger.RSM,
        ZSM: newLedger.ZSM,
        LedgerMobile: newLedger.LedgerMobile,
        LedgerContact: newLedger.LedgerContact,
        Email: newLedger.Email,
        LedgerGSTIN: newLedger.LedgerGSTIN,
        LedgerAddress1: newLedger.LedgerAddress1,
        LedgerAddress2: newLedger.LedgerAddress2,
        LedgerState: newLedger.LedgerState,
        LedgerOpening: newLedger.LedgerOpening,
        LedgerOpeningDate: newLedger.LedgerOpeningDate,
        LedgerJoinDate: newLedger.LedgerJoinDate,
        Remarks: newLedger.Remarks,
        Other1: newLedger.Other1,
        Other2: newLedger.Other2,
        Other3: newLedger.Other3,
        Other4: newLedger.Other4,
        Other5: newLedger.Other5,
        other6: newLedger.other6,
        other7: newLedger.other7,
        other8: newLedger.other8,
        groupId: newLedger.groupId,
        group: newLedger.groupId ? {
          _id: newLedger.groupId._id,
          GroupGUID: newLedger.groupId.GroupGUID,
          GroupName: newLedger.groupId.GroupName
        } : null,
        isActive: newLedger.isActive,
        createdAt: newLedger.createdAt
      }
    });

  } catch (error) {
    console.error("Create dealer error:", error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Ledger with this GUID already exists for this company"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/dealers:
 *   get:
 *     summary: Get all dealers (ledgers) for admin's company
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, include inactive dealers
 *     responses:
 *       200:
 *         description: Dealers retrieved successfully
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
/**
 * @swagger
 * /api/v1/admin/dealers:
 *   get:
 *     summary: Get all dealers (ledgers) for admin's company
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, include inactive dealers
 *     responses:
 *       200:
 *         description: Dealers retrieved successfully
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const getAllDealers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { includeInactive } = req.query;

    // Check if user has access to the company
    // Select groups field explicitly to ensure it's included
    const user = await User.findById(userId)
      .select('role groups assignedDealerIds defaultCompany companies')
      .populate('defaultCompany');
    if (!user || !user.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this user"
      });
    }
    
    console.log('🔍 getAllDealers - User role:', user.role);
    console.log('🔍 getAllDealers - User groups count:', user.groups?.length || 0);
    if (user.groups && user.groups.length > 0) {
      console.log('🔍 getAllDealers - User groups sample:', JSON.stringify(user.groups.slice(0, 1), null, 2));
    }

    // Convert companyId to string for comparison
    const userCompanyId = user.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (userCompanyId !== targetCompanyId) {
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

    // Build base query
    const baseQuery = {
      cmpcode: company.companyCode
    };

    if (includeInactive !== 'true') {
      baseQuery.isActive = true;
    }

    // For group users, filter by their assigned group(s) OR dealers they created
    // PLUS dealers from child users in the hierarchy
    // Superadmin and admin can see all dealers, but group users should only see:
    // 1. Dealers in their assigned groups (assigned by admin)
    // 2. Dealers they created themselves
    // 3. Dealers in groups assigned to child users (hierarchy-based)
    // 4. Dealers created by child users (hierarchy-based)
    let query = baseQuery;
    
    // Check role (case-insensitive comparison)
    const userRole = (user.role || '').toLowerCase().trim();
    console.log('🔍 User role check:', userRole, '===', 'groupuser', '?', userRole === 'groupuser');
    
    if (userRole === 'groupuser') {
      console.log('🔍 Group user detected, filtering dealers with hierarchy...');
      console.log('🔍 User ID:', userId);
      console.log('🔍 User groups array:', user.groups);
      console.log('🔍 User groups length:', user.groups?.length || 0);
      
      // Helper function to get all child user IDs recursively (including nested children)
      const getAllChildUserIdsRecursive = async (parentUserId, companyId) => {
        const childUserIds = [];
        
        // Convert parentUserId to ObjectId if needed
        const parentId = mongoose.Types.ObjectId.isValid(parentUserId) 
          ? (typeof parentUserId === 'string' ? new mongoose.Types.ObjectId(parentUserId) : parentUserId)
          : parentUserId;
        
        // Get direct children - check both parentUserId field name variations
        // Note: Model uses 'hierarchy.parentUserId', but some code may use 'hierarchy.parentUser'
        const directChildren = await User.find({
          $and: [
            {
              $or: [
                { 'hierarchy.parentUserId': parentId },
                { 'hierarchy.parentUser': parentId }
              ]
            },
            {
              $or: [
                { 'companies.companyId': companyId },
                { 'defaultCompany': companyId }
              ]
            },
            { isActive: true }
          ]
        }).select('_id groups');
        
        const directChildIds = directChildren.map(child => child._id.toString());
        childUserIds.push(...directChildIds);
        
        console.log(`🔍 Found ${directChildIds.length} direct children for user ${parentUserId}:`, directChildIds);
        
        // Recursively get children of children
        for (const childId of directChildIds) {
          const nestedChildren = await getAllChildUserIdsRecursive(childId, companyId);
          childUserIds.push(...nestedChildren);
        }
        
        return childUserIds;
      };
      
      const orConditions = [];
      
      // PRIORITY: If user has directly assigned dealers, show ONLY those dealers (plus dealers they created)
      if (user.assignedDealerIds && Array.isArray(user.assignedDealerIds) && user.assignedDealerIds.length > 0) {
        console.log('🔍 User has directly assigned dealers:', user.assignedDealerIds.length);
        
        // Convert assigned dealer IDs to ObjectIds
        const assignedDealerObjectIds = user.assignedDealerIds
          .map(id => {
            if (typeof id === 'object' && id !== null && id._id) {
              return id._id;
            } else if (mongoose.Types.ObjectId.isValid(id)) {
              return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
            }
            return null;
          })
          .filter(id => id !== null);
        
        console.log('🔍 Valid assigned dealer IDs:', assignedDealerObjectIds.length, assignedDealerObjectIds);
        
        // Add condition: ONLY directly assigned dealers
        orConditions.push({
          ...baseQuery,
          _id: { $in: assignedDealerObjectIds }
        });
        console.log('✅ Added condition: directly assigned dealers only:', assignedDealerObjectIds);
        
        // Also add dealers created by this user
        const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
          ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId)
          : userId;
        
        orConditions.push({ 
          ...baseQuery,
          createdBy: userIdObjectId 
        });
        console.log('✅ Added condition: dealers created by user:', userIdObjectId);
        
        // Use $or to include only assigned dealers and user-created dealers
        query = { $or: orConditions };
        console.log('🔍 Final query for group user (directly assigned dealers):', JSON.stringify(query, null, 2));
      } else {
        // No directly assigned dealers - use group-based filtering
        console.log('🔍 No directly assigned dealers, using group-based filtering');
      
      // Get active group IDs from user's own groups array
      let userGroupIds = [];
      if (user.groups && Array.isArray(user.groups) && user.groups.length > 0) {
        console.log('🔍 Processing user groups...');
        userGroupIds = user.groups
          .filter(g => {
            const isActive = g.isActive === true || g.isActive === undefined; // Default to true if not specified
            const hasGroupId = g.groupId !== null && g.groupId !== undefined;
            console.log('🔍 Group item:', { isActive, hasGroupId, groupId: g.groupId });
            return isActive && hasGroupId;
          })
          .map(g => {
            // Handle both populated and non-populated groupId
            if (typeof g.groupId === 'object' && g.groupId !== null && g.groupId._id) {
              return g.groupId._id;
            } else if (g.groupId) {
              // Convert to ObjectId if it's a string
              if (mongoose.Types.ObjectId.isValid(g.groupId)) {
                return typeof g.groupId === 'string' ? new mongoose.Types.ObjectId(g.groupId) : g.groupId;
              }
            }
            return null;
          })
          .filter(id => id !== null);

        console.log('🔍 Active group IDs extracted from user:', userGroupIds.length, userGroupIds);

        if (userGroupIds.length > 0) {
          // Add condition: dealers in user's assigned groups (with base conditions)
          orConditions.push({ 
            ...baseQuery,
            groupId: { $in: userGroupIds } 
          });
          console.log('✅ Added condition: dealers in user\'s assigned groups:', userGroupIds);
        }
      } else {
        console.log('⚠️ User has no groups or groups array is empty');
      }
      
      // Add condition: dealers created by this user (with base conditions)
      // Convert userId to ObjectId for proper comparison
      const userIdObjectId = mongoose.Types.ObjectId.isValid(userId) 
        ? (typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId)
        : userId;
      
      orConditions.push({ 
        ...baseQuery,
        createdBy: userIdObjectId 
      });
      console.log('✅ Added condition: dealers created by user:', userIdObjectId);
      
      // HIERARCHY-BASED FILTERING: Get dealers from child users
      try {
        // Get all child user IDs recursively
        const childUserIds = await getAllChildUserIdsRecursive(userId, companyId);
        console.log('🔍 Total child users found in hierarchy:', childUserIds.length, childUserIds);
        
        if (childUserIds.length > 0) {
          // Convert child user IDs to ObjectIds
          const childUserObjectIds = childUserIds
            .map(id => mongoose.Types.ObjectId.isValid(id) ? (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) : null)
            .filter(id => id !== null);
          
          // Get groups assigned to child users
          const childUsers = await User.find({
            _id: { $in: childUserObjectIds },
            isActive: true
          }).select('groups');
          
          let childGroupIds = [];
          for (const childUser of childUsers) {
            if (childUser.groups && Array.isArray(childUser.groups) && childUser.groups.length > 0) {
              const childGroups = childUser.groups
                .filter(g => (g.isActive === true || g.isActive === undefined) && g.groupId)
                .map(g => {
                  if (typeof g.groupId === 'object' && g.groupId !== null && g.groupId._id) {
                    return g.groupId._id;
                  } else if (g.groupId && mongoose.Types.ObjectId.isValid(g.groupId)) {
                    return typeof g.groupId === 'string' ? new mongoose.Types.ObjectId(g.groupId) : g.groupId;
                  }
                  return null;
                })
                .filter(id => id !== null);
              childGroupIds.push(...childGroups);
            }
          }
          
          // Remove duplicates
          childGroupIds = [...new Set(childGroupIds.map(id => id.toString()))]
            .map(id => new mongoose.Types.ObjectId(id));
          
          console.log('🔍 Groups from child users:', childGroupIds.length, childGroupIds);
          
          if (childGroupIds.length > 0) {
            // Add condition: dealers in groups assigned to child users
            orConditions.push({ 
              ...baseQuery,
              groupId: { $in: childGroupIds } 
            });
            console.log('✅ Added condition: dealers in child users\' groups:', childGroupIds);
          }
          
          // Add condition: dealers created by child users
          orConditions.push({ 
            ...baseQuery,
            createdBy: { $in: childUserObjectIds } 
          });
          console.log('✅ Added condition: dealers created by child users:', childUserObjectIds);
        }
        
        // NEW: GROUP HIERARCHY - Get dealers from child groups based on GroupParent
        console.log('🔍 Checking for child groups based on GroupParent field...');
        if (userGroupIds.length > 0) {
          try {
            // Get the actual Group documents for user's groups
            const userGroupDocs = await Group.find({
              _id: { $in: userGroupIds },
              isActive: true,
              cmpcode: company.companyCode
            }).select('GroupGUID GroupName');
            
            console.log('🔍 User group documents:', userGroupDocs.length);
            
            // For each user group, find all child groups recursively
            const allChildGroupIds = [];
            for (const userGroupDoc of userGroupDocs) {
              console.log(`🔍 Finding child groups for ${userGroupDoc.GroupName} (${userGroupDoc.GroupGUID})`);
              
              // Use the recursive helper function from getUsersByRole
              const childGroups = await findAllChildGroups(userGroupDoc.GroupGUID, company.companyCode, companyId);
              console.log(`🔍 Found ${childGroups.length} child groups for ${userGroupDoc.GroupName}`);
              
              // Convert child group GUIDs to Group ObjectIds
              if (childGroups.length > 0) {
                const childGroupGUIDs = childGroups.map(cg => cg.GroupGUID);
                const childGroupDocs = await Group.find({
                  GroupGUID: { $in: childGroupGUIDs },
                  cmpcode: company.companyCode,
                  isActive: true
                }).select('_id GroupName');
                
                const childGroupObjectIds = childGroupDocs.map(g => g._id);
                allChildGroupIds.push(...childGroupObjectIds);
                console.log(`✅ Added ${childGroupObjectIds.length} child group IDs from ${userGroupDoc.GroupName}`);
              }
            }
            
            if (allChildGroupIds.length > 0) {
              // Remove duplicates
              const uniqueChildGroupIds = [...new Set(allChildGroupIds.map(id => id.toString()))]
                .map(id => new mongoose.Types.ObjectId(id));
              
              console.log('🔍 Total unique child group IDs from GroupParent hierarchy:', uniqueChildGroupIds.length);
              
              // Add condition: dealers in child groups (based on GroupParent hierarchy)
              orConditions.push({
                ...baseQuery,
                groupId: { $in: uniqueChildGroupIds }
              });
              console.log('✅ Added condition: dealers in child groups (GroupParent hierarchy)');
            }
          } catch (groupHierarchyError) {
            console.error('❌ Error processing group hierarchy:', groupHierarchyError);
            // Continue even if group hierarchy processing fails
          }
        }
      } catch (hierarchyError) {
        console.error('❌ Error processing hierarchy:', hierarchyError);
        // Continue with existing conditions even if hierarchy processing fails
      }
      
      if (orConditions.length > 0) {
        // Use $or to include all conditions
        query = { $or: orConditions };
        console.log('🔍 Final query for group user (with hierarchy):', JSON.stringify(query, null, 2));
      } else {
        // If user has no active groups and no created dealers, return empty list
        console.log('⚠️ No conditions found, returning empty list');
        return res.json({
          success: true,
          data: {
            dealers: [],
            totalDealers: 0
          }
        });
      }
      } // End of else block for group-based filtering
    } else {
      console.log('🔍 Admin/Superadmin user - showing all dealers');
      console.log('🔍 Query for admin:', JSON.stringify(query, null, 2));
    }

    // Get all dealers for this company (exclude password field)
    console.log('🔍 Executing query:', JSON.stringify(query, null, 2));
    const dealers = await Ledger.find(query)
      .select('-password')
      .populate('SalesMan', 'name email role')
      .populate('ASM', 'name email role')
      .populate('RSM', 'name email role')
      .populate('ZSM', 'name email role')
      .populate('groupId', 'GroupGUID GroupName GroupParent cmpcode')
      .sort({ LedgerName: 1 })
      .lean();

    console.log('🔍 Found dealers:', dealers.length);
    if (dealers.length > 0 && dealers.length <= 5) {
      console.log('🔍 Sample dealers:', dealers.map(d => ({ 
        _id: d._id, 
        LedgerName: d.LedgerName, 
        groupId: d.groupId?._id || d.groupId,
        createdBy: d.createdBy 
      })));
    }

    res.json({
      success: true,
      data: {
        dealers: dealers,
        totalDealers: dealers.length
      }
    });

  } catch (error) {
    console.error("Get all dealers error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/dealers/{dealerId}:
 *   put:
 *     summary: Update an existing dealer
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Dealer ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               LedgerName:
 *                 type: string
 *               LedgerParent:
 *                 type: string
 *                 nullable: true
 *               SalesMan:
 *                 type: string
 *               ASM:
 *                 type: string
 *               RSM:
 *                 type: string
 *               ZSM:
 *                 type: string
 *               LedgerMobile:
 *                 type: string
 *               LedgerContact:
 *                 type: string
 *               Email:
 *                 type: string
 *               LedgerAddress1:
 *                 type: string
 *               LedgerAddress2:
 *                 type: string
 *               LedgerState:
 *                 type: string
 *               LedgerOpening:
 *                 type: number
 *               LedgerOpeningDate:
 *                 type: string
 *                 format: date
 *               LedgerJoinDate:
 *                 type: string
 *                 format: date
 *               Remarks:
 *                 type: string
 *               Other1:
 *                 type: string
 *               Other2:
 *                 type: string
 *               Other3:
 *                 type: string
 *               Other4:
 *                 type: string
 *               Other5:
 *                 type: string
 *               other6:
 *                 type: string
 *               other7:
 *                 type: string
 *               other8:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Dealer updated successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       404:
 *         description: Dealer not found
 *       500:
 *         description: Server error
 */
export const updateDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const {
      LedgerGUID,
      LedgerName,
      LedgerParent,
      SalesMan,
      ASM,
      RSM,
      ZSM,
      LedgerMobile,
      LedgerContact,
      Email,
      password,
      LedgerGSTIN,
      LedgerAddress1,
      LedgerAddress2,
      LedgerState,
      LedgerOpening,
      LedgerOpeningDate,
      LedgerJoinDate,
      Remarks,
      Other1,
      Other2,
      Other3,
      Other4,
      Other5,
      other6,
      other7,
      other8,
      groupId,
      isActive
    } = req.body;

    const userId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userRole = req.user.userDetails.role || '';

    if (!dealerId) {
      return res.status(400).json({
        success: false,
        message: "Dealer ID is required"
      });
    }

    // Check if user has access to the company
    const user = await User.findById(userId).populate('defaultCompany');
    if (!user || !user.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this user"
      });
    }

    // Convert companyId to string for comparison
    const userCompanyId = user.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (userCompanyId !== targetCompanyId) {
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

    // Find the dealer
    const dealer = await Ledger.findOne({
      _id: dealerId,
      cmpcode: company.companyCode
    });

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // For group users, only allow editing dealers they created
    if ((userRole === 'groupuser' || !userRole || userRole === '') && dealer.createdBy) {
      const dealerCreatedBy = dealer.createdBy.toString();
      const currentUserId = userId.toString();
      if (dealerCreatedBy !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "You can only edit dealers you created"
        });
      }
    }

    // Validate and update LedgerGUID if provided and different from current
    if (LedgerGUID !== undefined && LedgerGUID !== null && LedgerGUID.trim() !== '') {
      const trimmedGUID = LedgerGUID.trim();
      if (trimmedGUID !== dealer.LedgerGUID) {
        // Check if the new GUID already exists for this company
        const existingLedger = await Ledger.findOne({
          LedgerGUID: trimmedGUID,
          cmpcode: company.companyCode,
          _id: { $ne: dealerId } // Exclude current dealer
        });

        if (existingLedger) {
          return res.status(409).json({
            success: false,
            message: `Ledger with GUID ${trimmedGUID} already exists for this company`
          });
        }

        dealer.LedgerGUID = trimmedGUID;
      }
    }

    // Validate LedgerParent if provided and different from current
    if (LedgerParent !== undefined && LedgerParent !== dealer.LedgerParent) {
      if (LedgerParent === null || LedgerParent === '') {
        dealer.LedgerParent = null;
      } else {
        const parentLedger = await Ledger.findOne({
          LedgerGUID: LedgerParent,
          cmpcode: company.companyCode
        });

        if (!parentLedger) {
          return res.status(400).json({
            success: false,
            message: `Parent ledger with GUID ${LedgerParent} not found`
          });
        }

        // Prevent circular reference
        if (parentLedger._id.toString() === dealerId) {
          return res.status(400).json({
            success: false,
            message: "Dealer cannot be its own parent"
          });
        }

        dealer.LedgerParent = LedgerParent;
      }
    }

    // Validate and update group if provided
    if (groupId !== undefined) {
      if (groupId === null || groupId === '') {
        dealer.groupId = null;
      } else {
        const group = await Group.findOne({ 
          _id: groupId, 
          companyId: companyId,
          isActive: true 
        });
        if (!group) {
          return res.status(400).json({
            success: false,
            message: "Group not found or not active for this company"
          });
        }
        dealer.groupId = group._id;
      }
    }

    // Update fields if provided
    if (LedgerName !== undefined) {
      if (!LedgerName || !LedgerName.trim()) {
        return res.status(400).json({
          success: false,
          message: "LedgerName cannot be empty"
        });
      }
      dealer.LedgerName = LedgerName.trim();
    }

    // Validate and update hierarchy users
    if (SalesMan !== undefined) {
      if (SalesMan === null || SalesMan === '') {
        dealer.SalesMan = null;
      } else {
        const salesman = await User.findOne({ _id: SalesMan, 'companies.companyId': companyId });
        if (!salesman) {
          return res.status(400).json({
            success: false,
            message: "SalesMan user not found"
          });
        }
        dealer.SalesMan = SalesMan;
      }
    }

    if (ASM !== undefined) {
      if (ASM === null || ASM === '') {
        dealer.ASM = null;
      } else {
        const asm = await User.findOne({ _id: ASM, 'companies.companyId': companyId });
        if (!asm) {
          return res.status(400).json({
            success: false,
            message: "ASM user not found"
          });
        }
        dealer.ASM = ASM;
      }
    }

    if (RSM !== undefined) {
      if (RSM === null || RSM === '') {
        dealer.RSM = null;
      } else {
        const rsm = await User.findOne({ _id: RSM, 'companies.companyId': companyId });
        if (!rsm) {
          return res.status(400).json({
            success: false,
            message: "RSM user not found"
          });
        }
        dealer.RSM = RSM;
      }
    }

    if (ZSM !== undefined) {
      if (ZSM === null || ZSM === '') {
        dealer.ZSM = null;
      } else {
        const zsm = await User.findOne({ _id: ZSM, 'companies.companyId': companyId });
        if (!zsm) {
          return res.status(400).json({
            success: false,
            message: "ZSM user not found"
          });
        }
        dealer.ZSM = ZSM;
      }
    }

    // Update other fields
    if (LedgerMobile !== undefined) dealer.LedgerMobile = LedgerMobile || '';
    if (LedgerContact !== undefined) dealer.LedgerContact = LedgerContact || '';
    if (Email !== undefined) dealer.Email = Email || '';
    if (LedgerGSTIN !== undefined) dealer.LedgerGSTIN = LedgerGSTIN ? LedgerGSTIN.trim().toUpperCase() : '';
    if (LedgerAddress1 !== undefined) dealer.LedgerAddress1 = LedgerAddress1 || '';
    if (LedgerAddress2 !== undefined) dealer.LedgerAddress2 = LedgerAddress2 || '';
    if (LedgerState !== undefined) dealer.LedgerState = LedgerState || '';
    if (LedgerOpening !== undefined) {
      dealer.LedgerOpening = LedgerOpening || 0;
    }
    if (LedgerOpeningDate !== undefined) {
      dealer.LedgerOpeningDate = LedgerOpeningDate ? new Date(LedgerOpeningDate) : null;
    }
    if (LedgerJoinDate !== undefined) {
      dealer.LedgerJoinDate = LedgerJoinDate ? new Date(LedgerJoinDate) : null;
    }
    if (Remarks !== undefined) dealer.Remarks = Remarks || '';
    if (Other1 !== undefined) dealer.Other1 = Other1 || '';
    if (Other2 !== undefined) dealer.Other2 = Other2 || '';
    if (Other3 !== undefined) dealer.Other3 = Other3 || '';
    if (Other4 !== undefined) dealer.Other4 = Other4 || '';
    if (Other5 !== undefined) dealer.Other5 = Other5 || '';
    if (other6 !== undefined) dealer.other6 = other6 || '';
    if (other7 !== undefined) dealer.other7 = other7 || '';
    if (other8 !== undefined) dealer.other8 = other8 || '';

    // Handle password update if provided
    if (password !== undefined && password !== null && password.trim()) {
      dealer.password = await bcrypt.hash(password.trim(), 10);
    }

    if (isActive !== undefined) {
      dealer.isActive = isActive;
    }

    dealer.updatedBy = userId;

    // Save the updated dealer
    await dealer.save();

    // Populate hierarchy users and group for response
    await dealer.populate([
      { path: 'SalesMan', select: 'name email role' },
      { path: 'ASM', select: 'name email role' },
      { path: 'RSM', select: 'name email role' },
      { path: 'ZSM', select: 'name email role' },
      { path: 'groupId', select: 'GroupGUID GroupName GroupParent cmpcode' }
    ]);

    res.json({
      success: true,
      message: "Dealer updated successfully",
      data: {
        _id: dealer._id,
        LedgerGUID: dealer.LedgerGUID,
        LedgerName: dealer.LedgerName,
        LedgerParent: dealer.LedgerParent,
        cmpcode: dealer.cmpcode,
        Cmpguid: dealer.Cmpguid,
        SalesMan: dealer.SalesMan,
        ASM: dealer.ASM,
        RSM: dealer.RSM,
        ZSM: dealer.ZSM,
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
        Remarks: dealer.Remarks,
        Other1: dealer.Other1,
        Other2: dealer.Other2,
        Other3: dealer.Other3,
        Other4: dealer.Other4,
        Other5: dealer.Other5,
        other6: dealer.other6,
        other7: dealer.other7,
        other8: dealer.other8,
        groupId: dealer.groupId,
        group: dealer.groupId ? {
          _id: dealer.groupId._id,
          GroupGUID: dealer.groupId.GroupGUID,
          GroupName: dealer.groupId.GroupName
        } : null,
        isActive: dealer.isActive,
        updatedAt: dealer.updatedAt
      }
    });

  } catch (error) {
    console.error("Update dealer error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/dealers/{dealerId}:
 *   delete:
 *     summary: Delete a dealer (soft delete by setting isActive to false)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Dealer ID to delete
 *       - in: query
 *         name: hardDelete
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, permanently delete the dealer
 *     responses:
 *       200:
 *         description: Dealer deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Dealer not found
 *       500:
 *         description: Server error
 */
export const deleteDealer = async (req, res) => {
  try {
    const { dealerId } = req.params;
    const { hardDelete } = req.query;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!dealerId) {
      return res.status(400).json({
        success: false,
        message: "Dealer ID is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Find the dealer
    const dealer = await Ledger.findOne({
      _id: dealerId,
      cmpcode: company.companyCode
    });

    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: "Dealer not found"
      });
    }

    // For group users, only allow deleting dealers they created
    if ((userRole === 'groupuser' || !userRole || userRole === '') && dealer.createdBy) {
      const dealerCreatedBy = dealer.createdBy.toString();
      const currentUserId = userId.toString();
      if (dealerCreatedBy !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: "You can only delete dealers you created"
        });
      }
    }

    if (hardDelete === 'true') {
      // Hard delete
      await Ledger.findByIdAndDelete(dealerId);
      return res.json({
        success: true,
        message: "Dealer permanently deleted"
      });
    } else {
      // Soft delete
      dealer.isActive = false;
      dealer.updatedBy = userId;
      await dealer.save();
      return res.json({
        success: true,
        message: "Dealer deactivated successfully"
      });
    }

  } catch (error) {
    console.error("Delete dealer error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ==================== SUBDEALER MANAGEMENT ====================

/**
 * @swagger
 * /api/v1/admin/subdealers:
 *   post:
 *     summary: Create a new subdealer with dealer assignment
 *     description: |
 *       Creates a new subdealer and links it to a dealer. Admin's current company is automatically assigned.
 *       - dealerId: Select a dealer from the dropdown to link with the subdealer
 *       - groupId: Optional - if not provided, the dealer's group will be auto-assigned if available
 *       - Company is auto-assigned from admin's current company
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
 *               - SDName
 *               - SDType
 *             properties:
 *               SDName:
 *                 type: string
 *                 description: Subdealer name
 *               SDType:
 *                 type: string
 *                 enum: [Sub Dealer, TSO]
 *                 description: Subdealer type
 *               dealerId:
 *                 type: string
 *                 description: Dealer ID to link with this subdealer (optional but recommended)
 *               SDAddress1:
 *                 type: string
 *               SDAddress2:
 *                 type: string
 *               SDAddress3:
 *                 type: string
 *               SDState:
 *                 type: string
 *               SDCountry:
 *                 type: string
 *                 default: India
 *               SDPincode:
 *                 type: string
 *               SDContactPerson:
 *                 type: string
 *               SDMobileNo:
 *                 type: string
 *               SDEmail:
 *                 type: string
 *               SDGSTNType:
 *                 type: string
 *               SDGSTNNumber:
 *                 type: string
 *               groupId:
 *                 type: string
 *                 description: Group ID (optional - dealer's group will be used if not provided)
 *               isActive:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       201:
 *         description: Subdealer created successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const createSubDealer = async (req, res) => {
  try {
    const {
      SDName,
      SDType,
      SDAddress1,
      SDAddress2,
      SDAddress3,
      SDState,
      SDCountry,
      SDPincode,
      SDContactPerson,
      SDMobileNo,
      SDEmail,
      SDGSTNType,
      SDGSTNNumber,
      dealerId,  // New: dealer selection
      groupId,   // Optional: group is no longer required
      isActive = true
    } = req.body;

    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Validate required fields
    if (!SDName || !SDName.trim()) {
      return res.status(400).json({
        success: false,
        message: "SDName is required"
      });
    }

    if (!SDType || !['Sub Dealer', 'TSO'].includes(SDType)) {
      return res.status(400).json({
        success: false,
        message: "SDType is required and must be 'Sub Dealer' or 'TSO'"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Validate and get dealer if provided
    let finalDealerId = null;
    let dealerGroupId = null;
    
    if (dealerId) {
      const dealer = await Ledger.findOne({
        _id: dealerId,
        companyId: companyId,
        isActive: true
      });
      
      if (!dealer) {
        return res.status(400).json({
          success: false,
          message: "Dealer not found or not active for this company"
        });
      }
      
      finalDealerId = dealer._id;
      
      // Auto-assign dealer's group to subdealer if dealer has a group
      if (dealer.groupId) {
        dealerGroupId = dealer.groupId;
      }
    }

    // Validate and assign group if provided (optional, can override dealer's group)
    let finalGroupId = dealerGroupId; // Start with dealer's group
    
    if (groupId) {
      const group = await Group.findOne({ 
        _id: groupId, 
        companyId: companyId,
        isActive: true 
      });
      if (!group) {
        return res.status(400).json({
          success: false,
          message: "Group not found or not active for this company"
        });
      }
      finalGroupId = group._id; // Override with explicitly provided group
    }

    // Create the subdealer
    const newSubDealer = await SubDealer.create({
      SDName: SDName.trim(),
      SDType: SDType.trim(),
      SDAddress1: SDAddress1 || '',
      SDAddress2: SDAddress2 || '',
      SDAddress3: SDAddress3 || '',
      SDState: SDState || '',
      SDCountry: SDCountry || 'India',
      SDPincode: SDPincode || '',
      SDContactPerson: SDContactPerson || '',
      SDMobileNo: SDMobileNo || '',
      SDEmail: SDEmail || '',
      SDGSTNType: SDGSTNType || '',
      SDGSTNNumber: SDGSTNNumber ? SDGSTNNumber.trim().toUpperCase() : '',
      dealerId: finalDealerId,    // Link to dealer
      groupId: finalGroupId,      // Optional group assignment
      companyId: companyId,       // Auto-assigned from admin's company
      cmpcode: company.companyCode,
      Cmpguid: company.guid || company.companyCode,
      isActive: isActive !== false,
      createdBy: adminId
    });

    // Populate dealer and group if assigned
    if (finalDealerId) {
      await newSubDealer.populate('dealerId', 'LedgerGUID LedgerName LedgerMobile Email');
    }
    if (finalGroupId) {
      await newSubDealer.populate('groupId', 'GroupGUID GroupName GroupParent cmpcode');
    }

    res.status(201).json({
      success: true,
      message: "Subdealer created successfully",
      data: {
        _id: newSubDealer._id,
        SDName: newSubDealer.SDName,
        SDType: newSubDealer.SDType,
        SDAddress1: newSubDealer.SDAddress1,
        SDAddress2: newSubDealer.SDAddress2,
        SDAddress3: newSubDealer.SDAddress3,
        SDState: newSubDealer.SDState,
        SDCountry: newSubDealer.SDCountry,
        SDPincode: newSubDealer.SDPincode,
        SDContactPerson: newSubDealer.SDContactPerson,
        SDMobileNo: newSubDealer.SDMobileNo,
        SDEmail: newSubDealer.SDEmail,
        SDGSTNType: newSubDealer.SDGSTNType,
        SDGSTNNumber: newSubDealer.SDGSTNNumber,
        dealerId: newSubDealer.dealerId,
        dealer: newSubDealer.dealerId ? {
          _id: newSubDealer.dealerId._id,
          LedgerGUID: newSubDealer.dealerId.LedgerGUID,
          LedgerName: newSubDealer.dealerId.LedgerName
        } : null,
        groupId: newSubDealer.groupId,
        group: newSubDealer.groupId ? {
          _id: newSubDealer.groupId._id,
          GroupGUID: newSubDealer.groupId.GroupGUID,
          GroupName: newSubDealer.groupId.GroupName
        } : null,
        cmpcode: newSubDealer.cmpcode,
        Cmpguid: newSubDealer.Cmpguid,
        isActive: newSubDealer.isActive,
        createdAt: newSubDealer.createdAt
      }
    });

  } catch (error) {
    console.error("Create subdealer error:", error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Subdealer with this information already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/subdealers:
 *   get:
 *     summary: Get all subdealers for admin's company
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, include inactive subdealers
 *     responses:
 *       200:
 *         description: Subdealers retrieved successfully
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */
export const getAllSubDealers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { includeInactive } = req.query;

    // Check if user has access to the company
    const user = await User.findById(userId).populate('defaultCompany');
    if (!user || !user.defaultCompany) {
      return res.status(403).json({
        success: false,
        message: "No company assigned to this user"
      });
    }

    // Convert companyId to string for comparison
    const userCompanyId = user.defaultCompany._id.toString();
    const targetCompanyId = companyId.toString();

    if (userCompanyId !== targetCompanyId) {
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

    // Build query
    const query = {
      companyId: companyId
    };

    if (includeInactive !== 'true') {
      query.isActive = true;
    }

    // For group users, filter by their assigned group(s)
    // Superadmin and admin can see all subdealers, but group users should only see subdealers in their group
    if (user.role === 'groupuser' && user.groups && user.groups.length > 0) {
      // Get active group IDs from user's groups array
      const activeGroupIds = user.groups
        .filter(g => g.isActive && g.groupId)
        .map(g => {
          // Handle both populated and non-populated groupId
          return typeof g.groupId === 'object' && g.groupId._id 
            ? g.groupId._id 
            : (g.groupId || null);
        })
        .filter(id => id !== null);

      if (activeGroupIds.length > 0) {
        // Filter subdealers by groupId - only show subdealers in the user's group(s)
        query.groupId = { $in: activeGroupIds };
        console.log('🔍 Group user filtering subdealers by groupIds:', activeGroupIds);
      } else {
        // If user has no active groups, return empty list
        return res.json({
          success: true,
          data: {
            subdealers: [],
            totalSubDealers: 0
          }
        });
      }
    }

    // Get all subdealers for this company
    const subdealers = await SubDealer.find(query)
      .select('_id SDName SDType SDAddress1 SDAddress2 SDAddress3 SDState SDCountry SDPincode SDContactPerson SDMobileNo SDEmail SDGSTNType SDGSTNNumber dealerId groupId cmpcode Cmpguid isActive createdAt')
      .populate('dealerId', 'LedgerGUID LedgerName LedgerMobile Email')
      .populate('groupId', 'GroupGUID GroupName GroupParent cmpcode')
      .sort({ SDName: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        subdealers: subdealers,
        totalSubDealers: subdealers.length
      }
    });

  } catch (error) {
    console.error("Get all subdealers error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/subdealers/{subdealerId}:
 *   put:
 *     summary: Update an existing subdealer
 *     description: Update subdealer information including dealer assignment
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subdealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Subdealer ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               SDName:
 *                 type: string
 *               SDType:
 *                 type: string
 *                 enum: [Sub Dealer, TSO]
 *               dealerId:
 *                 type: string
 *                 description: Dealer ID to link with this subdealer
 *               SDAddress1:
 *                 type: string
 *               SDAddress2:
 *                 type: string
 *               SDAddress3:
 *                 type: string
 *               SDState:
 *                 type: string
 *               SDCountry:
 *                 type: string
 *               SDPincode:
 *                 type: string
 *               SDContactPerson:
 *                 type: string
 *               SDMobileNo:
 *                 type: string
 *               SDEmail:
 *                 type: string
 *               SDGSTNType:
 *                 type: string
 *               SDGSTNNumber:
 *                 type: string
 *               groupId:
 *                 type: string
 *                 description: Group ID (optional)
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Subdealer updated successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 *       404:
 *         description: Subdealer not found
 *       500:
 *         description: Server error
 */
export const updateSubDealer = async (req, res) => {
  try {
    const { subdealerId } = req.params;
    const {
      SDName,
      SDType,
      SDAddress1,
      SDAddress2,
      SDAddress3,
      SDState,
      SDCountry,
      SDPincode,
      SDContactPerson,
      SDMobileNo,
      SDEmail,
      SDGSTNType,
      SDGSTNNumber,
      dealerId,   // New: dealer assignment update
      groupId,
      isActive
    } = req.body;

    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!subdealerId) {
      return res.status(400).json({
        success: false,
        message: "Subdealer ID is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Find the subdealer
    const subdealer = await SubDealer.findOne({
      _id: subdealerId,
      companyId: companyId
    });

    if (!subdealer) {
      return res.status(404).json({
        success: false,
        message: "Subdealer not found"
      });
    }

    // Validate and update dealer if provided
    if (dealerId !== undefined) {
      if (dealerId === null || dealerId === '') {
        subdealer.dealerId = null;
      } else {
        const dealer = await Ledger.findOne({
          _id: dealerId,
          companyId: companyId,
          isActive: true
        });
        
        if (!dealer) {
          return res.status(400).json({
            success: false,
            message: "Dealer not found or not active for this company"
          });
        }
        subdealer.dealerId = dealer._id;
      }
    }

    // Validate and update group if provided
    if (groupId !== undefined) {
      if (groupId === null || groupId === '') {
        subdealer.groupId = null;
      } else {
        const group = await Group.findOne({ 
          _id: groupId, 
          companyId: companyId,
          isActive: true 
        });
        if (!group) {
          return res.status(400).json({
            success: false,
            message: "Group not found or not active for this company"
          });
        }
        subdealer.groupId = group._id;
      }
    }

    // Update fields if provided
    if (SDName !== undefined) {
      if (!SDName || !SDName.trim()) {
        return res.status(400).json({
          success: false,
          message: "SDName cannot be empty"
        });
      }
      subdealer.SDName = SDName.trim();
    }

    if (SDType !== undefined) {
      if (!['Sub Dealer', 'TSO'].includes(SDType)) {
        return res.status(400).json({
          success: false,
          message: "SDType must be 'Sub Dealer' or 'TSO'"
        });
      }
      subdealer.SDType = SDType.trim();
    }

    // Update other fields
    if (SDAddress1 !== undefined) subdealer.SDAddress1 = SDAddress1 || '';
    if (SDAddress2 !== undefined) subdealer.SDAddress2 = SDAddress2 || '';
    if (SDAddress3 !== undefined) subdealer.SDAddress3 = SDAddress3 || '';
    if (SDState !== undefined) subdealer.SDState = SDState || '';
    if (SDCountry !== undefined) subdealer.SDCountry = SDCountry || 'India';
    if (SDPincode !== undefined) subdealer.SDPincode = SDPincode || '';
    if (SDContactPerson !== undefined) subdealer.SDContactPerson = SDContactPerson || '';
    if (SDMobileNo !== undefined) subdealer.SDMobileNo = SDMobileNo || '';
    if (SDEmail !== undefined) subdealer.SDEmail = SDEmail || '';
    if (SDGSTNType !== undefined) subdealer.SDGSTNType = SDGSTNType || '';
    if (SDGSTNNumber !== undefined) subdealer.SDGSTNNumber = SDGSTNNumber ? SDGSTNNumber.trim().toUpperCase() : '';
    if (isActive !== undefined) subdealer.isActive = isActive;

    subdealer.updatedBy = adminId;

    // Save the updated subdealer
    await subdealer.save();

    // Populate dealer and group for response
    await subdealer.populate('dealerId', 'LedgerGUID LedgerName LedgerMobile Email');
    await subdealer.populate('groupId', 'GroupGUID GroupName GroupParent cmpcode');

    res.json({
      success: true,
      message: "Subdealer updated successfully",
      data: {
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
        dealerId: subdealer.dealerId,
        dealer: subdealer.dealerId ? {
          _id: subdealer.dealerId._id,
          LedgerGUID: subdealer.dealerId.LedgerGUID,
          LedgerName: subdealer.dealerId.LedgerName
        } : null,
        groupId: subdealer.groupId,
        group: subdealer.groupId ? {
          _id: subdealer.groupId._id,
          GroupGUID: subdealer.groupId.GroupGUID,
          GroupName: subdealer.groupId.GroupName
        } : null,
        cmpcode: subdealer.cmpcode,
        Cmpguid: subdealer.Cmpguid,
        isActive: subdealer.isActive,
        updatedAt: subdealer.updatedAt
      }
    });

  } catch (error) {
    console.error("Update subdealer error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/admin/subdealers/{subdealerId}:
 *   delete:
 *     summary: Delete a subdealer (soft delete by setting isActive to false)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subdealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Subdealer ID to delete
 *       - in: query
 *         name: hardDelete
 *         schema:
 *           type: boolean
 *           default: false
 *         description: If true, permanently delete the subdealer
 *     responses:
 *       200:
 *         description: Subdealer deleted successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Subdealer not found
 *       500:
 *         description: Server error
 */
export const deleteSubDealer = async (req, res) => {
  try {
    const { subdealerId } = req.params;
    const { hardDelete } = req.query;
    const adminId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    if (!subdealerId) {
      return res.status(400).json({
        success: false,
        message: "Subdealer ID is required"
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

    // Get company code
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found"
      });
    }

    // Find the subdealer
    const subdealer = await SubDealer.findOne({
      _id: subdealerId,
      companyId: companyId
    });

    if (!subdealer) {
      return res.status(404).json({
        success: false,
        message: "Subdealer not found"
      });
    }

    if (hardDelete === 'true') {
      // Hard delete
      await SubDealer.findByIdAndDelete(subdealerId);
      return res.json({
        success: true,
        message: "Subdealer permanently deleted"
      });
    } else {
      // Soft delete
      subdealer.isActive = false;
      subdealer.updatedBy = adminId;
      await subdealer.save();
      return res.json({
        success: true,
        message: "Subdealer deactivated successfully"
      });
    }

  } catch (error) {
    console.error("Delete subdealer error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
