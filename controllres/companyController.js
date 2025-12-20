import Company from "../models/company/companyModel.js";
import User from "../models/user/userModel.js";
import Order from "../models/order/orderModel.js";
import mongoose from "mongoose";

/**
 * @swagger
 * /api/v1/superadmin/create-company:
 *   post:
 *     summary: Create a new company
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyName
 *               - companyState
 *               - companyCountry
 *               - companyMobile
 *               - companyEmail
 *               - companyCode
 *               - maxUser
 *               - guid
 *             properties:
 *               companyName:
 *                 type: string
 *               companyState:
 *                 type: string
 *               companyCountry:
 *                 type: string
 *               companyMobile:
 *                 type: string
 *               companyEmail:
 *                 type: string
 *                 format: email
 *               companyCode:
 *                 type: string
 *               maxUser:
 *                 type: number
 *               guid:
 *                 type: number
 *               contactDetails:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   website:
 *                     type: string
 *                   address:
 *                     type: object
 *                     properties:
 *                       street:
 *                         type: string
 *                       city:
 *                         type: string
 *                       state:
 *                         type: string
 *                       country:
 *                         type: string
 *                       pincode:
 *                         type: string
 *     responses:
 *       201:
 *         description: Company created successfully
 *       400:
 *         description: Bad request - Company code, email, or mobile already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Create Company
export const createCompany = async (req, res) => {
    try {
        const { companyCode, companyEmail, companyMobile } = req.body;

    // Normalize optional GSTIN: remove if empty to avoid null uniqueness conflicts
    if (!req.body.gstin || String(req.body.gstin).trim() === '') {
      delete req.body.gstin;
    }

    // If guid not provided, generate a unique alphanumeric GUID. If provided, accept as string (alphanumeric).
    if (!req.body.guid) {
      let candidate;
      let attempts = 0;
      do {
        // Generate alphanumeric GUID: 8 characters (letters and numbers)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        candidate = '';
        for (let i = 0; i < 8; i++) {
          candidate += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        attempts += 1;
        // Avoid infinite loops
        if (attempts > 10) break;
      } while (await Company.exists({ guid: candidate }));
      req.body.guid = candidate;
    } else {
      // Accept guid from frontend as alphanumeric string
      const incoming = String(req.body.guid).trim();
      if (!incoming) {
        return res.status(400).json({
          success: false,
          message: 'GUID cannot be empty'
        });
      }
      req.body.guid = incoming;
    }

    // Check if companyCode exists
    const existingCode = await Company.findOne({ companyCode });
    if (existingCode) {
      return res.status(400).json({ 
        success: false, 
        message: `Company code "${companyCode}" is already in use.` 
      });
    }

    // Check if companyEmail exists
    const existingEmail = await Company.findOne({ companyEmail });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        message: `Company email "${companyEmail}" is already in use.` 
      });
    }

    // Check if companyMobile exists
    const existingMobile = await Company.findOne({ companyMobile });
    if (existingMobile) {
      return res.status(400).json({ 
        success: false, 
        message: `Company mobile "${companyMobile}" is already in use.` 
      });
    }

        const companyData = {
            ...req.body,
            createdBy: req.user.userId
        };
        
        const company = await Company.create(companyData);
        res.status(201).json({ success: true, message: 'Company created successfully', data: company });
    } catch (error) {
        console.error('Error creating company:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create company',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @swagger
 * /api/v1/superadmin/list-all-companies:
 *   get:
 *     summary: Get all companies
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Number of companies per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by company name or code
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Get All Companies with Statistics
export const getCompanies = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        // Build search query
        const searchQuery = {
            ...(search && {
                $or: [
                    { companyName: { $regex: search, $options: 'i' } },
                    { companyCode: { $regex: search, $options: 'i' } }
                ]
            })
        };

        const companies = await Company.find(searchQuery)
            .populate('createdBy', 'name email')
            .populate('assignedAdmins.adminId', 'name email mobile')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get statistics for each company
        const companiesWithStats = await Promise.all(
            companies.map(async (company) => {
                const companyId = company._id;
                
                // Get user statistics
                const userStats = await User.aggregate([
                    { $match: { defaultCompany: companyId } },
                    {
                        $group: {
                            _id: null,
                            totalUsers: { $sum: 1 },
                            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                            inactiveUsers: { $sum: { $cond: ['$isActive', 0, 1] } }
                        }
                    }
                ]);

                // Get order statistics
                const orderStats = await Order.aggregate([
                    { $match: { companyId: companyId } },
                    {
                        $group: {
                            _id: null,
                            totalOrders: { $sum: 1 },
                            pendingOrders: { 
                                $sum: { 
                                    $cond: [ 
                                        { $in: ['$status', ['pending', 'confirmed', 'processing']] }, 
                                        1, 
                                        0
                                    ] 
                                } 
                            },
                            completedOrders: { 
                                $sum: { 
                                    $cond: [
                                        { $in: ['$status', ['delivered', 'shipped']] }, 
                                        1, 
                                        0
                                    ] 
                                } 
                            },
                            totalSales: { $sum: '$finalAmount' }
                        }
                    }
                ]);

                // Get assigned admin information (for backward compatibility - default admin)
                const assignedAdmin = await User.findOne({ 
                    defaultCompany: companyId, 
                    role: 'admin' 
                }).select('name email mobile');

                // Get all assigned admins from company.assignedAdmins (already populated)
                const allAssignedAdmins = company.assignedAdmins && Array.isArray(company.assignedAdmins)
                    ? company.assignedAdmins
                        .filter((a) => a.isActive)
                        .map((a) => {
                            const admin = a.adminId;
                            if (typeof admin === 'object' && admin) {
                                return {
                                    _id: admin._id || admin.toString(),
                                    name: admin.name || '',
                                    email: admin.email || '',
                                    mobile: admin.mobile || ''
                                };
                            }
                            return null;
                        })
                        .filter(Boolean)
                    : [];

                return {
                    ...company.toObject(),
                    stats: {
                        totalUsers: userStats[0]?.totalUsers || 0,
                        activeUsers: userStats[0]?.activeUsers || 0,
                        inactiveUsers: userStats[0]?.inactiveUsers || 0,
                        totalOrders: orderStats[0]?.totalOrders || 0,
                        pendingOrders: orderStats[0]?.pendingOrders || 0,
                        completedOrders: orderStats[0]?.completedOrders || 0,
                        totalSales: orderStats[0]?.totalSales || 0
                    },
                    assignedAdmin: assignedAdmin ? {
                        name: assignedAdmin.name,
                        email: assignedAdmin.email,
                        mobile: assignedAdmin.mobile
                    } : null,
                    assignedAdmins: allAssignedAdmins
                };
            })
        );

        const totalCompanies = await Company.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalCompanies / limit);

        res.json({ 
            success: true, 
            data: {
                companies: companiesWithStats,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCompanies,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting companies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get companies',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get Single Company with Detailed Statistics
export const getCompanyById = async (req, res) => {
    try {
        const companyId = req.params.id;
        
        if (!mongoose.Types.ObjectId.isValid(companyId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid company ID'
            });
        }

        const company = await Company.findById(companyId)
            .populate('createdBy', 'name email')
            .populate('assignedAdmins.adminId', 'name email mobile');

        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }

        // Get detailed user statistics
        const userStats = await User.aggregate([
            { $match: { defaultCompany: companyId } },
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                    inactiveUsers: { $sum: { $cond: ['$isActive', 0, 1] } },
                    usersByRole: {
                        $push: {
                            role: '$role',
                            isActive: '$isActive',
                            lastLogin: '$lastLogin'
                        }
                    }
                }
            }
        ]);

        // Get detailed order statistics
        const orderStats = await Order.aggregate([
            { $match: { companyId: companyId } },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    pendingOrders: { 
                        $sum: { 
                            $cond: [
                                { $in: ['$status', ['pending', 'confirmed', 'processing']] }, 
                                1, 
                                0
                            ] 
                        } 
                    },
                    completedOrders: { 
                        $sum: { 
                            $cond: [
                                { $in: ['$status', ['delivered', 'shipped']] }, 
                                1, 
                                0
                            ] 
                        } 
                    },
                    totalSales: { $sum: '$finalAmount' },
                    ordersByStatus: {
                        $push: {
                            status: '$status',
                            amount: '$finalAmount',
                            createdAt: '$createdAt'
                        }
                    }
                }
            }
        ]);

        // Get recent orders
        const recentOrders = await Order.find({ companyId: companyId })
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(10)
            .select('orderNumber finalAmount status createdAt createdBy');

        // Get assigned admin information
        const assignedAdmin = await User.findOne({ 
            defaultCompany: companyId, 
            role: 'admin' 
        }).select('name email mobile lastLogin');

        // Get all users for the company
        const allUsers = await User.find({ defaultCompany: companyId })
            .select('name email role isActive lastLogin createdAt')
            .sort({ createdAt: -1 });

        // Get all assigned admins from company.assignedAdmins (already populated)
        const allAssignedAdmins = company.assignedAdmins && Array.isArray(company.assignedAdmins)
            ? company.assignedAdmins
                .filter((a) => a.isActive)
                .map((a) => {
                    const admin = a.adminId;
                    if (typeof admin === 'object' && admin && admin._id) {
                        return {
                            _id: admin._id.toString(),
                            name: admin.name || '',
                            email: admin.email || '',
                            mobile: admin.mobile || ''
                        };
                    }
                    return null;
                })
                .filter(Boolean)
            : [];

        const companyWithDetails = {
            ...company.toObject(),
            stats: {
                totalUsers: userStats[0]?.totalUsers || 0,
                activeUsers: userStats[0]?.activeUsers || 0,
                inactiveUsers: userStats[0]?.inactiveUsers || 0,
                totalOrders: orderStats[0]?.totalOrders || 0,
                pendingOrders: orderStats[0]?.pendingOrders || 0,
                completedOrders: orderStats[0]?.completedOrders || 0,
                totalSales: orderStats[0]?.totalSales || 0
            },
            assignedAdmin: assignedAdmin ? {
                name: assignedAdmin.name,
                email: assignedAdmin.email,
                mobile: assignedAdmin.mobile,
                lastLogin: assignedAdmin.lastLogin
            } : null,
            assignedAdmins: allAssignedAdmins,
            recentOrders: recentOrders,
            allUsers: allUsers
        };

        res.json({ 
            success: true, 
            data: companyWithDetails 
        });
    } catch (error) {
        console.error('Error getting company details:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get company details',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update Company
export const updateCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        // If guid is being set to null or empty, remove it from update to preserve existing value
        if (updateData.guid === null || updateData.guid === '' || updateData.guid === undefined) {
            delete updateData.guid;
        }

        // If guid is provided as a number (from frontend), convert to string
        if (updateData.guid !== undefined && typeof updateData.guid === 'number') {
            updateData.guid = String(updateData.guid);
        }

        const company = await Company.findByIdAndUpdate(id, updateData, { 
            new: true,
            runValidators: true 
        });
        
        if (!company) {
            return res.json({ success: false, message: "Company not found" });
        }
        
        res.json({ success: true, data: company });
    } catch (error) {
        // Handle duplicate key errors
        if (error.code === 11000 || (error.name === 'MongoServerError' && error.code === 11000)) {
            const field = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'field';
            return res.status(400).json({ 
                success: false, 
                message: `Duplicate ${field}: A company with this ${field} already exists`,
                error: 'DUPLICATE_ENTRY',
                field
            });
        }
        
        console.error('Error updating company:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to update company',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete Company
export const deleteCompany = async (req, res) => {
    try {
        const company = await Company.findByIdAndDelete(req.params.id);
        if (!company) return res.json({ success: false, message: "Company not found" });
        res.json({ success: true, message: "Company deleted successfully" });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Get System Overview Statistics
export const getSystemStats = async (req, res) => {
    try {
        // Get total companies count
        const totalCompanies = await Company.countDocuments();

        // Get total admins count
        const totalAdmins = await User.countDocuments({ role: 'admin' });

        // Get total users count
        const totalUsers = await User.countDocuments();

        // Get total orders and sales across all companies
        const orderStats = await Order.aggregate([
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalSales: { $sum: '$finalAmount' },
                    pendingOrders: { 
                        $sum: { 
                            $cond: [ 
                                { $in: ['$status', ['pending', 'confirmed', 'processing']] }, 
                                1, 
                                0
                            ] 
                        } 
                    },
                    completedOrders: { 
                        $sum: { 
                            $cond: [
                                { $in: ['$status', ['delivered', 'shipped']] }, 
                                1, 
                                0
                            ] 
                        } 
                    }
                }
            }
        ]);

        const stats = orderStats[0] || {
            totalOrders: 0,
            totalSales: 0,
            pendingOrders: 0,
            completedOrders: 0
        };

        res.json({
            success: true,
            data: {
                totalCompanies,
                totalAdmins,
                totalUsers,
                totalOrders: stats.totalOrders,
                totalSales: stats.totalSales,
                pendingOrders: stats.pendingOrders,
                completedOrders: stats.completedOrders
            }
        });
    } catch (error) {
        console.error('Error fetching system stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch system statistics'
        });
    }
};
