import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Universal login for all user types (email or mobile)
 *     tags: [Authentication]
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
 *                 description: User email address or mobile number
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful with role-specific data
 *       401:
 *         description: Invalid credentials
 */
export const universalLogin = async (req, res) => {
  try {
    // Accept both 'email' and 'emailOrMobile' for backward compatibility
    const { email, emailOrMobile, password } = req.body;
    
    // Use emailOrMobile if provided, otherwise fall back to email
    const userIdentifier = emailOrMobile || email;

    if (!userIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Mobile and password are required'
      });
    }

    // Find user by email or mobile (with password for verification)
    // Check if the identifier is an email or mobile number
    const isEmail = userIdentifier.includes('@');
    const userQuery = isEmail 
      ? { email: userIdentifier }
      : { mobile: userIdentifier };
    
    const userWithPassword = await User.findOne(userQuery);

    if (!userWithPassword || !userWithPassword.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordCorrect = await bcrypt.compare(password, userWithPassword.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Get user data with populated fields (without password)
    const user = await User.findOne(userQuery)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile contactDetails')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    // Update last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "7d" }
    );

    // Get role-specific data
    const roleSpecificData = await getRoleSpecificData(user);

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          mobile: user.mobile,
          role: user.role,
          defaultCompany: user.defaultCompany,
          companies: user.companies,
          hierarchy: user.hierarchy,
          createdBy: user.createdBy,
          lastLogin: user.lastLogin
        },
        roleSpecificData,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get role-specific data based on user role
 */
async function getRoleSpecificData(user) {
  const role = user.role;
  const userId = user._id;

  switch (role) {
    case 'superadmin':
      return await getSuperAdminData();
    
    case 'admin':
      return await getAdminData(user);
    
    case 'zonal':
      return await getZonalData(user);
    
    case 'rsm':
      return await getRSMData(user);
    
    case 'asm':
      return await getASMData(user);
    
    case 'salesman':
      return await getSalesmanData(user);
    
    case 'dealers':
    case 'distibutors':
      return await getDealerData(user);
    
    case 'subdealer':
      return await getSubDealerData(user);
    
    default:
      return { message: 'No specific data for this role' };
  }
}

/**
 * Super Admin specific data
 */
async function getSuperAdminData() {
  try {
    // Get all companies count
    const totalCompanies = await Company.countDocuments({ isActive: true });
    
    // Get all admins count
    const totalAdmins = await User.countDocuments({ role: 'admin', isActive: true });
    
    // Get total users count
    const totalUsers = await Company.aggregate([
      { $match: { isActive: true } },
      { $lookup: { from: 'users', localField: '_id', foreignField: 'companies.companyId', as: 'users' } },
      { $unwind: '$users' },
      { $count: 'total' }
    ]);

    return {
      dashboard: {
        totalCompanies,
        totalAdmins,
        totalUsers: totalUsers[0]?.total || 0,
        recentActivity: [] // Can be implemented later
      },
      permissions: {
        canCreateCompanies: true,
        canCreateAdmins: true,
        canViewAllData: true,
        canManageSystem: true
      }
    };
  } catch (error) {
    console.error('Error getting super admin data:', error);
    return { error: 'Failed to load super admin data' };
  }
}

/**
 * Admin specific data
 */
async function getAdminData(user) {
  try {
    const companyIds = user.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId._id);

    // Get company statistics
    const companyStats = await Promise.all(
      companyIds.map(async (companyId) => {
        const company = await Company.findById(companyId);
        const userCount = await User.countDocuments({
          'companies.companyId': companyId,
          'companies.isActive': true
        });

        const userByRole = await User.aggregate([
          {
            $match: {
              'companies.companyId': companyId,
              'companies.isActive': true,
              role: { $ne: 'admin' }
            }
          },
          {
            $group: {
              _id: '$role',
              count: { $sum: 1 }
            }
          }
        ]);

        return {
          companyId,
          companyName: company.companyName,
          companyCode: company.companyCode,
          totalUsers: userCount,
          maxUsers: company.maxUser,
          usagePercentage: Math.round((userCount / company.maxUser) * 100),
          userByRole
        };
      })
    );

    return {
      dashboard: {
        companies: companyStats,
        totalCompanies: companyIds.length,
        totalUsers: companyStats.reduce((sum, comp) => sum + comp.totalUsers, 0)
      },
      permissions: {
        canCreateUsers: true,
        canManageCompany: true,
        canViewCompanyData: true,
        canAssignTargets: true
      }
    };
  } catch (error) {
    console.error('Error getting admin data:', error);
    return { error: 'Failed to load admin data' };
  }
}

/**
 * Zonal Manager specific data
 */
async function getZonalData(user) {
  try {
    const companyIds = user.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId._id);

    // Get RSM users under this zonal
    const rsmUsers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      'hierarchy.parentUser': user._id,
      role: 'rsm'
    }).select('name email mobile lastLogin');

    // Get all users under this zonal (through hierarchy)
    const allSubUsers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      $or: [
        { 'hierarchy.parentUser': user._id },
        { 'hierarchy.parentUser': { $in: rsmUsers.map(rsm => rsm._id) } }
      ]
    }).select('name email role hierarchy.parentUser');

    return {
      dashboard: {
        rsmCount: rsmUsers.length,
        totalSubUsers: allSubUsers.length,
        rsmUsers,
        userHierarchy: allSubUsers
      },
      permissions: {
        canViewRSMData: true,
        canAssignTargets: true,
        canViewReports: true,
        canApproveOrders: true
      }
    };
  } catch (error) {
    console.error('Error getting zonal data:', error);
    return { error: 'Failed to load zonal data' };
  }
}

/**
 * RSM specific data
 */
async function getRSMData(user) {
  try {
    const companyIds = user.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId._id);

    // Get ASM users under this RSM
    const asmUsers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      'hierarchy.parentUser': user._id,
      role: 'asm'
    }).select('name email mobile lastLogin');

    // Get all users under this RSM
    const allSubUsers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      $or: [
        { 'hierarchy.parentUser': user._id },
        { 'hierarchy.parentUser': { $in: asmUsers.map(asm => asm._id) } }
      ]
    }).select('name email role hierarchy.parentUser');

    return {
      dashboard: {
        asmCount: asmUsers.length,
        totalSubUsers: allSubUsers.length,
        asmUsers,
        userHierarchy: allSubUsers
      },
      permissions: {
        canViewASMData: true,
        canAssignTargets: true,
        canViewReports: true,
        canApproveOrders: true
      }
    };
  } catch (error) {
    console.error('Error getting RSM data:', error);
    return { error: 'Failed to load RSM data' };
  }
}

/**
 * ASM specific data
 */
async function getASMData(user) {
  try {
    const companyIds = user.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId._id);

    // Get Sales Officers under this ASM
    const salesOfficers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      'hierarchy.parentUser': user._id,
      role: 'salesman'
    }).select('name email mobile lastLogin');

    // Get Dealers under this ASM
    const dealers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      'hierarchy.parentUser': user._id,
      role: { $in: ['dealers', 'distibutors'] }
    }).select('name email mobile lastLogin');

    return {
      dashboard: {
        salesOfficerCount: salesOfficers.length,
        dealerCount: dealers.length,
        totalSubUsers: salesOfficers.length + dealers.length,
        salesOfficers,
        dealers
      },
      permissions: {
        canViewSalesOfficerData: true,
        canViewDealerData: true,
        canAssignTargets: true,
        canViewReports: true,
        canApproveOrders: true
      }
    };
  } catch (error) {
    console.error('Error getting ASM data:', error);
    return { error: 'Failed to load ASM data' };
  }
}

/**
 * Sales Officer specific data
 */
async function getSalesmanData(user) {
  try {
    const companyIds = user.companies
      .filter(comp => comp.isActive)
      .map(comp => comp.companyId._id);

    // Get Dealers under this Sales Officer
    const dealers = await User.find({
      'companies.companyId': { $in: companyIds },
      'companies.isActive': true,
      'hierarchy.parentUser': user._id,
      role: { $in: ['dealers', 'distibutors'] }
    }).select('name email mobile lastLogin');

    return {
      dashboard: {
        dealerCount: dealers.length,
        dealers
      },
      permissions: {
        canViewDealerData: true,
        canCreateOrders: true,
        canViewOwnOrders: true,
        canViewReports: true
      }
    };
  } catch (error) {
    console.error('Error getting salesman data:', error);
    return { error: 'Failed to load salesman data' };
  }
}

/**
 * Dealer/Distributor specific data
 */
async function getDealerData(user) {
  try {
    return {
      dashboard: {
        // Dealer-specific dashboard data
        recentOrders: [], // Will be implemented with order system
        targets: [], // Will be implemented with target system
        outstanding: [] // Will be implemented with ledger system
      },
      permissions: {
        canCreateOrders: true,
        canViewOwnOrders: true,
        canViewOwnTargets: true,
        canViewOwnOutstanding: true
      }
    };
  } catch (error) {
    console.error('Error getting dealer data:', error);
    return { error: 'Failed to load dealer data' };
  }
}

/**
 * Sub Dealer specific data
 */
async function getSubDealerData(user) {
  try {
    return {
      dashboard: {
        // Sub Dealer-specific dashboard data
        recentOrders: [],
        targets: [],
        outstanding: []
      },
      permissions: {
        canCreateOrders: true,
        canViewOwnOrders: true,
        canViewOwnTargets: true,
        canViewOwnOutstanding: true
      }
    };
  } catch (error) {
    console.error('Error getting sub dealer data:', error);
    return { error: 'Failed to load sub dealer data' };
  }
}
