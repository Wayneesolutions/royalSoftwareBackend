import bcrypt from 'bcryptjs';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';
import Order from '../models/order/orderModel.js';
import Outstanding from '../models/outstanding/outstandingModel.js';
import jwt from 'jsonwebtoken';
export const createSuperAdmin = async (req, res) => {
  try {
    const { email, password, name, mobile } = req.body;

    // Validate required fields
    if (!email || !password || !name || !mobile) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required: email, password, name, mobile' 
      });
    }

    const exist = await User.findOne({ 
      $or: [{ email }, { mobile }],
      role: 'superadmin' 
    });
    if (exist) {
      return res.status(400).json({ 
        success: false, 
        message: 'Super admin with this email or mobile already exists' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const superAdmin = await User.create({
      email,
      password: hashedPassword,
      name,
      mobile,
      role: 'superadmin',
      hierarchy: {
        level: 0
      }
    });

    return res.status(201).json({ 
      success: true, 
      message: 'Super admin created successfully', 
      data: { 
        _id: superAdmin._id, 
        email: superAdmin.email, 
        name: superAdmin.name, 
        mobile: superAdmin.mobile,
        role: superAdmin.role 
      } 
    });
  } catch (err) {
    console.error('Error creating super admin:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Error creating super admin',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

export const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email, role: 'superadmin' });
    if (!admin) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign({ userId: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({ success: true, message: 'Login successful', data:{ admin: { _id: admin._id, email: admin.email, name: admin.name, role: admin.role }, token: token }});
  } catch (err) {
    console.log(err);
    
    return res.json({ success: false, message: 'Login failed' });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/create-admin:
 *   post:
 *     summary: Create a new admin user
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
 *               - email
 *               - password
 *               - name
 *               - mobile
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
 *               companyId:
 *                 type: string
 *                 description: Company ID to assign to admin
 *     responses:
 *       200:
 *         description: Admin created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const createAdmin = async (req, res) => {
  try {
    const { email, password, name, mobile, companyId } = req.body;

    // Validate required fields
    if (!email || !password || !name || !mobile || !companyId) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required: email, password, name, mobile, companyId' 
      });
    }

    // Check if admin already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { mobile }] 
    });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'User with this email or mobile already exists' 
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

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      email,
      password: hashedPassword,
      name,
      mobile,
      role: 'admin',
      defaultCompany: companyId,
      companies: [{
        companyId: companyId,
        role: 'admin',
        isActive: true,
        assignedBy: req.user.userId
      }],
      hierarchy: {
        level: 1
      },
      createdBy: req.user.userId
    });

    // Update company with admin assignment
    await Company.findByIdAndUpdate(companyId, {
      $push: {
        assignedAdmins: {
          adminId: admin._id,
          isActive: true
        }
      }
    });

    // Return admin without password
    const adminResponse = await User.findById(admin._id)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode')
      .populate('companies.companyId', 'companyName companyCode');

    return res.status(201).json({ 
      success: true, 
      message: 'Admin created successfully', 
      data: adminResponse 
    });
  } catch (err) {
    console.error('Error creating admin:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to create admin',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/list-admins:
 *   get:
 *     summary: List all admin users
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
 *         description: Number of admins per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: List of admins retrieved successfully
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
 *                     admins:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/User'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalAdmins:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const listAdmins = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    // Build search query
    const searchQuery = {
      role: 'admin',
      ...(search && {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      })
    };

    const admins = await User.find(searchQuery)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalAdmins = await User.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalAdmins / limit);

    return res.json({ 
      success: true, 
      data: {
        admins,
        pagination: {
          currentPage: page,
          totalPages,
          totalAdmins,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (err) {
    console.error('Error listing admins:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to list admins',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Update an admin (email, name, password, mobile, company assignment)
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, password, mobile, companyId } = req.body;

    // Validate required fields
    if (!email || !name || !mobile) {
      return res.status(400).json({
        success: false,
        message: 'Email, name, and mobile are required'
      });
    }

    // Check if email already exists for another admin
    const existingAdmin = await User.findOne({
      email,
      role: 'admin',
      _id: { $ne: id }
    });

    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists for another admin'
      });
    }

    // Check if mobile already exists for another admin
    const existingMobile = await User.findOne({
      mobile,
      role: 'admin',
      _id: { $ne: id }
    });

    if (existingMobile) {
      return res.status(400).json({
        success: false,
        message: 'Mobile number already exists for another admin'
      });
    }

    // Build update object
    const update = {
      email,
      name,
      mobile
    };

    // Hash password if provided
    if (password && password.trim() !== '') {
      update.password = await bcrypt.hash(password, 10);
    }

    // Update company assignment if provided
    if (companyId) {
      // Verify company exists
      const company = await Company.findById(companyId);
      if (!company) {
        return res.status(400).json({
          success: false,
          message: 'Company not found'
        });
      }

      // Update default company
      update.defaultCompany = companyId;

      // Update companies array
      update.companies = [{
        companyId: companyId,
        role: 'admin',
        isActive: true,
        assignedBy: req.user.userId
      }];
    }

    const updated = await User.findOneAndUpdate(
      { _id: id, role: 'admin' },
      { $set: update },
      { new: true }
    )
    .select('-password')
    .populate('defaultCompany', 'companyName companyCode')
    .populate('companies.companyId', 'companyName companyCode');

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Update company with admin assignment if company was changed
    if (companyId) {
      await Company.findByIdAndUpdate(companyId, {
        $push: {
          assignedAdmins: {
            adminId: id,
            isActive: true
          }
        }
      });
    }

    return res.json({
      success: true,
      message: 'Admin updated successfully',
      data: updated
    });
  } catch (err) {
    console.error('Error updating admin:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update admin',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Delete an admin
export const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params
    const deleted = await User.findOneAndDelete({ _id: id, role: 'admin' })
    if (!deleted) {
      return res.json({ success: false, message: 'Admin not found' })
    }
    return res.json({ success: true, message: 'Admin deleted' })
  } catch (err) {
    return res.json({ success: false, message: 'Failed to delete admin' })
  }
}

/**
 * @swagger
 * /api/v1/superadmin/assign-company/{adminId}:
 *   post:
 *     summary: Assign a company to an admin
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin user ID
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
 *                 description: Company ID to assign
 *               setAsDefault:
 *                 type: boolean
 *                 description: Set as default company for admin
 *                 default: false
 *     responses:
 *       200:
 *         description: Company assigned successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Admin or company not found
 */
export const assignCompanyToAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { companyId, setAsDefault = false } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    // Verify admin exists
    const admin = await User.findOne({ _id: adminId, role: 'admin' });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Check if admin is already assigned to this company
    const existingAssignment = admin.companies.find(
      comp => comp.companyId.toString() === companyId
    );

    if (existingAssignment) {
      return res.status(400).json({
        success: false,
        message: 'Admin is already assigned to this company'
      });
    }

    // Add company to admin's companies array
    admin.companies.push({
      companyId: companyId,
      role: 'admin',
      isActive: true,
      assignedBy: req.user.userId
    });

    // Set as default company if requested
    if (setAsDefault) {
      admin.defaultCompany = companyId;
    }

    await admin.save();

    // Update company with admin assignment
    await Company.findByIdAndUpdate(companyId, {
      $push: {
        assignedAdmins: {
          adminId: adminId,
          isActive: true
        }
      }
    });

    // Return updated admin
    const updatedAdmin = await User.findById(adminId)
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode')
      .populate('companies.companyId', 'companyName companyCode');

    return res.json({
      success: true,
      message: 'Company assigned to admin successfully',
      data: updatedAdmin
    });
  } catch (err) {
    console.error('Error assigning company to admin:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign company to admin',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/admin/{adminId}:
 *   get:
 *     summary: Get admin details by ID
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *         description: Admin user ID
 *     responses:
 *       200:
 *         description: Admin details retrieved successfully
 *       404:
 *         description: Admin not found
 */
export const getAdminById = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await User.findOne({ _id: adminId, role: 'admin' })
      .select('-password')
      .populate('defaultCompany', 'companyName companyCode companyEmail companyMobile')
      .populate('companies.companyId', 'companyName companyCode companyEmail companyMobile')
      .populate('createdBy', 'name email')
      .populate('companies.assignedBy', 'name email');

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    return res.json({
      success: true,
      data: admin
    });
  } catch (err) {
    console.error('Error getting admin details:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get admin details',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/sales-report:
 *   get:
 *     summary: Get comprehensive sales report for super admin
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [3months, 6months, 1year, custom]
 *           default: 6months
 *         description: Time period for the report
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Filter by specific company ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for custom period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for custom period
 *     responses:
 *       200:
 *         description: Sales report retrieved successfully
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
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalSales:
 *                           type: number
 *                         totalOrders:
 *                           type: number
 *                         avgGrowth:
 *                           type: number
 *                         totalCompanies:
 *                           type: number
 *                     monthlyData:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                           sales:
 *                             type: number
 *                           orders:
 *                             type: number
 *                           growth:
 *                             type: number
 *                           previousMonthSales:
 *                             type: number
 *                     companyPerformance:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           totalSales:
 *                             type: number
 *                           totalOrders:
 *                             type: number
 *                           monthlyData:
 *                             type: array
 *                     insights:
 *                       type: object
 *                       properties:
 *                         bestMonth:
 *                           type: string
 *                         growthRate:
 *                           type: number
 *                         topCompany:
 *                           type: string
 *                         peakSeason:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const getSalesReport = async (req, res) => {
  try {
    const { period = '6months', companyId, startDate, endDate } = req.query;
    
    // Calculate date range based on period
    let dateFilter = {};
    const now = new Date();
    
    switch (period) {
      case '3months':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getFullYear(), now.getMonth() - 3, 1)
          }
        };
        break;
      case '6months':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getFullYear(), now.getMonth() - 6, 1)
          }
        };
        break;
      case '1year':
        dateFilter = {
          createdAt: {
            $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1)
          }
        };
        break;
      case 'custom':
        if (startDate && endDate) {
          dateFilter = {
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          };
        }
        break;
    }

    // Add company filter if specified
    if (companyId) {
      dateFilter.companyId = companyId;
    }

    // Get orders with date filter
    const orders = await Order.find(dateFilter)
      .populate('companyId', 'companyName companyCode')
      .sort({ createdAt: -1 });

    // Calculate monthly data
    const monthlyData = calculateMonthlyData(orders);
    
    // Calculate company performance
    const companyPerformance = calculateCompanyPerformance(orders);
    
    // Calculate summary statistics
    const summary = calculateSummaryStats(orders, monthlyData);
    
    // Generate insights
    const insights = generateInsights(monthlyData, companyPerformance);

    return res.json({
      success: true,
      data: {
        summary,
        monthlyData,
        companyPerformance,
        insights,
        filters: {
          period,
          companyId: companyId || 'all',
          dateRange: dateFilter.createdAt || 'all'
        }
      }
    });
  } catch (err) {
    console.error('Error getting sales report:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get sales report',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/sales-report/export:
 *   get:
 *     summary: Export sales report in various formats
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [pdf, excel, csv]
 *           default: pdf
 *         description: Export format
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [3months, 6months, 1year, custom]
 *           default: 6months
 *         description: Time period for the report
 *     responses:
 *       200:
 *         description: Report exported successfully
 *       400:
 *         description: Invalid format
 */
export const exportSalesReport = async (req, res) => {
  try {
    const { format = 'pdf', period = '6months' } = req.query;
    
    // For now, return a success response with mock data
    // In a real implementation, you would generate actual PDF/Excel files
    const exportData = {
      format,
      period,
      generatedAt: new Date(),
      downloadUrl: `/exports/sales-report-${period}-${Date.now()}.${format}`
    };

    return res.json({
      success: true,
      message: `${format.toUpperCase()} report generated successfully`,
      data: exportData
    });
  } catch (err) {
    console.error('Error exporting sales report:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to export sales report',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Helper function to calculate monthly data
const calculateMonthlyData = (orders) => {
  const monthlyMap = new Map();
  
  orders.forEach(order => {
    const orderDate = new Date(order.createdAt);
    const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
    const monthName = orderDate.toLocaleString('default', { month: 'long' });
    
    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        month: monthName,
        sales: 0,
        orders: 0,
        monthKey
      });
    }
    
    const monthData = monthlyMap.get(monthKey);
    monthData.sales += order.finalAmount || 0;
    monthData.orders += 1;
  });

  // Convert to array and sort by month
  const monthlyArray = Array.from(monthlyMap.values())
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  // Calculate growth for each month
  return monthlyArray.map((month, index) => {
    const previousMonth = index > 0 ? monthlyArray[index - 1] : null;
    const growth = previousMonth 
      ? ((month.sales - previousMonth.sales) / previousMonth.sales) * 100
      : 0;

    return {
      month: month.month,
      sales: month.sales,
      orders: month.orders,
      growth: Math.round(growth * 100) / 100,
      previousMonthSales: previousMonth ? previousMonth.sales : 0
    };
  });
};

// Helper function to calculate company performance
const calculateCompanyPerformance = (orders) => {
  const companyMap = new Map();
  
  orders.forEach(order => {
    if (!order.companyId) return;
    
    const companyId = order.companyId._id || order.companyId;
    const companyName = order.companyId.companyName || 'Unknown Company';
    
    if (!companyMap.has(companyId)) {
      companyMap.set(companyId, {
        companyId,
        companyName,
        totalSales: 0,
        totalOrders: 0,
        monthlyData: new Map()
      });
    }
    
    const companyData = companyMap.get(companyId);
    companyData.totalSales += order.finalAmount || 0;
    companyData.totalOrders += 1;
    
    // Add to monthly data
    const orderDate = new Date(order.createdAt);
    const monthKey = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
    const monthName = orderDate.toLocaleString('default', { month: 'long' });
    
    if (!companyData.monthlyData.has(monthKey)) {
      companyData.monthlyData.set(monthKey, {
        month: monthName,
        sales: 0,
        orders: 0
      });
    }
    
    const monthData = companyData.monthlyData.get(monthKey);
    monthData.sales += order.finalAmount || 0;
    monthData.orders += 1;
  });

  // Convert to array format
  return Array.from(companyMap.values()).map(company => ({
    companyId: company.companyId,
    companyName: company.companyName,
    totalSales: company.totalSales,
    totalOrders: company.totalOrders,
    monthlyData: Array.from(company.monthlyData.values())
      .sort((a, b) => a.month.localeCompare(b.month))
  }));
};

// Helper function to calculate summary statistics
const calculateSummaryStats = (orders, monthlyData) => {
  const totalSales = orders.reduce((sum, order) => sum + (order.finalAmount || 0), 0);
  const totalOrders = orders.length;
  const avgGrowth = monthlyData.length > 0 
    ? monthlyData.reduce((sum, month) => sum + month.growth, 0) / monthlyData.length
    : 0;
  
  // Get unique companies
  const uniqueCompanies = new Set(orders.map(order => 
    order.companyId ? (order.companyId._id || order.companyId) : null
  ).filter(Boolean));

  return {
    totalSales,
    totalOrders,
    avgGrowth: Math.round(avgGrowth * 100) / 100,
    totalCompanies: uniqueCompanies.size
  };
};

// Helper function to generate insights
const generateInsights = (monthlyData, companyPerformance) => {
  if (monthlyData.length === 0) {
    return {
      bestMonth: 'N/A',
      growthRate: 0,
      topCompany: 'N/A',
      peakSeason: 'N/A'
    };
  }

  // Find best month
  const bestMonth = monthlyData.reduce((best, current) => 
    current.sales > best.sales ? current : best
  );

  // Calculate average growth rate
  const growthRate = monthlyData.reduce((sum, month) => sum + month.growth, 0) / monthlyData.length;

  // Find top company
  const topCompany = companyPerformance.reduce((top, current) => 
    current.totalSales > top.totalSales ? current : top
  );

  // Determine peak season (quarter with highest sales)
  const quarterlySales = {};
  monthlyData.forEach(month => {
    const monthNum = new Date(`${month.month} 1, 2024`).getMonth();
    const quarter = Math.floor(monthNum / 3) + 1;
    if (!quarterlySales[quarter]) quarterlySales[quarter] = 0;
    quarterlySales[quarter] += month.sales;
  });

  const peakQuarter = Object.keys(quarterlySales).reduce((peak, quarter) => 
    quarterlySales[quarter] > quarterlySales[peak] ? quarter : peak
  );

  return {
    bestMonth: bestMonth.month,
    growthRate: Math.round(growthRate * 100) / 100,
    topCompany: topCompany.companyName,
    peakSeason: `Q${peakQuarter} 2024`
  };
};

/**
 * @swagger
 * /api/v1/superadmin/outstanding-summary:
 *   get:
 *     summary: Get system-wide outstanding summary for super admin
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Filter by specific company ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, overdue, partially_paid, paid, written_off, disputed]
 *         description: Filter by outstanding status
 *       - in: query
 *         name: riskLevel
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by risk level
 *       - in: query
 *         name: daysOverdue
 *         schema:
 *           type: integer
 *         description: Filter by minimum days overdue
 *     responses:
 *       200:
 *         description: Outstanding summary retrieved successfully
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
 *                     systemSummary:
 *                       type: object
 *                       properties:
 *                         totalOutstanding:
 *                           type: number
 *                         totalOrders:
 *                           type: number
 *                         overdueCount:
 *                           type: number
 *                         overdueAmount:
 *                           type: number
 *                         pendingCount:
 *                           type: number
 *                         pendingAmount:
 *                           type: number
 *                         averageDaysOverdue:
 *                           type: number
 *                     companyBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           totalOutstanding:
 *                             type: number
 *                           totalOrders:
 *                             type: number
 *                           overdueCount:
 *                             type: number
 *                           overdueAmount:
 *                             type: number
 *                     statusBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: number
 *                           totalAmount:
 *                             type: number
 *                     agingAnalysis:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           ageRange:
 *                             type: string
 *                           count:
 *                             type: number
 *                           totalAmount:
 *                             type: number
 *                     topOutstandingParties:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           partyName:
 *                             type: string
 *                           companyName:
 *                             type: string
 *                           totalOutstanding:
 *                             type: number
 *                           orderCount:
 *                             type: number
 *                           maxDaysOverdue:
 *                             type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const getSuperAdminOutstandingSummary = async (req, res) => {
  try {
    const { companyId, status, riskLevel, daysOverdue } = req.query;
    
    // Build filter query
    let filters = { isActive: true };
    if (status) filters.status = status;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (daysOverdue) {
      const days = parseInt(daysOverdue);
      filters.daysOverdue = { $gte: days };
    }
    if (companyId) {
      filters.companyId = companyId;
    }

    // Get system-wide summary
    const systemSummary = await Outstanding.aggregate([
      { $match: filters },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$outstandingAmount' },
          totalOrders: { $sum: 1 },
          overdueCount: {
            $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
          },
          overdueAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$outstandingAmount', 0] }
          },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$outstandingAmount', 0] }
          },
          averageDaysOverdue: { $avg: '$daysOverdue' }
        }
      }
    ]);

    // Get company breakdown
    const companyBreakdown = await Outstanding.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'company'
        }
      },
      { $unwind: '$company' },
      {
        $group: {
          _id: '$companyId',
          companyName: { $first: '$company.companyName' },
          totalOutstanding: { $sum: '$outstandingAmount' },
          totalOrders: { $sum: 1 },
          overdueCount: {
            $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
          },
          overdueAmount: {
            $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$outstandingAmount', 0] }
          }
        }
      },
      { $sort: { totalOutstanding: -1 } }
    ]);

    // Get status breakdown
    const statusBreakdown = await Outstanding.aggregate([
      { $match: filters },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$outstandingAmount' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Get aging analysis
    const agingAnalysis = await Outstanding.aggregate([
      { $match: filters },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lte: ['$daysOverdue', 0] }, then: 'current' },
                { case: { $lte: ['$daysOverdue', 30] }, then: '1-30_days' },
                { case: { $lte: ['$daysOverdue', 60] }, then: '31-60_days' },
                { case: { $lte: ['$daysOverdue', 90] }, then: '61-90_days' },
                { case: { $gt: ['$daysOverdue', 90] }, then: 'over_90_days' }
              ],
              default: 'current'
            }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$outstandingAmount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top outstanding parties
    const topOutstandingParties = await Outstanding.aggregate([
      { $match: filters },
      {
        $lookup: {
          from: 'companies',
          localField: 'companyId',
          foreignField: '_id',
          as: 'company'
        }
      },
      { $unwind: '$company' },
      {
        $group: {
          _id: '$partyId',
          partyName: { $first: '$partyName' },
          companyName: { $first: '$company.companyName' },
          totalOutstanding: { $sum: '$outstandingAmount' },
          orderCount: { $sum: 1 },
          maxDaysOverdue: { $max: '$daysOverdue' }
        }
      },
      { $sort: { totalOutstanding: -1 } },
      { $limit: 10 }
    ]);

    return res.json({
      success: true,
      data: {
        systemSummary: systemSummary[0] || {
          totalOutstanding: 0,
          totalOrders: 0,
          overdueCount: 0,
          overdueAmount: 0,
          pendingCount: 0,
          pendingAmount: 0,
          averageDaysOverdue: 0
        },
        companyBreakdown,
        statusBreakdown,
        agingAnalysis,
        topOutstandingParties,
        filters: {
          companyId: companyId || 'all',
          status: status || 'all',
          riskLevel: riskLevel || 'all',
          daysOverdue: daysOverdue || 'all'
        }
      }
    });
  } catch (err) {
    console.error('Error getting super admin outstanding summary:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get outstanding summary',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/outstanding-list:
 *   get:
 *     summary: Get system-wide outstanding list for super admin
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
 *           default: 20
 *         description: Number of items per page
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Filter by company ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, overdue, partially_paid, paid, written_off, disputed]
 *         description: Filter by status
 *       - in: query
 *         name: riskLevel
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by risk level
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by party name or order number
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: dueDate
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Outstanding list retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const getSuperAdminOutstandingList = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      companyId,
      status,
      riskLevel,
      search,
      sortBy = 'dueDate',
      sortOrder = 'asc'
    } = req.query;

    // Build filter query
    let filters = { isActive: true };
    
    if (companyId) filters.companyId = companyId;
    if (status) filters.status = status;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (search) {
      filters.$or = [
        { partyName: { $regex: search, $options: 'i' } },
        { orderNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort query
    const sortQuery = {};
    sortQuery[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get outstanding list with company information
    const outstandingList = await Outstanding.find(filters)
      .populate('companyId', 'companyName companyCode')
      .populate('partyId', 'name email mobile')
      .populate('orderId', 'orderNumber orderDate finalAmount')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalCount = await Outstanding.countDocuments(filters);

    return res.json({
      success: true,
      data: {
        outstandingList,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNext: skip + outstandingList.length < totalCount,
          hasPrev: parseInt(page) > 1
        }
      }
    });
  } catch (err) {
    console.error('Error getting super admin outstanding list:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get outstanding list',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/outstanding/{outstandingId}:
 *   get:
 *     summary: Get outstanding details by ID for super admin
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: outstandingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Outstanding record ID
 *     responses:
 *       200:
 *         description: Outstanding details retrieved successfully
 *       404:
 *         description: Outstanding record not found
 */
export const getSuperAdminOutstandingDetails = async (req, res) => {
  try {
    const { outstandingId } = req.params;

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      isActive: true
    })
    .populate('companyId', 'companyName companyCode companyEmail companyMobile')
    .populate('partyId', 'name email mobile address')
    .populate('orderId')
    .populate('assignedTo', 'name email mobile')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .populate('collectionNotes.addedBy', 'name email');

    if (!outstanding) {
      return res.status(404).json({
        success: false,
        message: 'Outstanding record not found'
      });
    }

    return res.json({
      success: true,
      data: outstanding
    });
  } catch (err) {
    console.error('Error getting super admin outstanding details:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to get outstanding details',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/outstanding/{outstandingId}/update:
 *   patch:
 *     summary: Update outstanding record for super admin
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: outstandingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Outstanding record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, overdue, partially_paid, paid, written_off, disputed]
 *               riskLevel:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               assignedTo:
 *                 type: string
 *               followUpDate:
 *                 type: string
 *                 format: date
 *               followUpNotes:
 *                 type: string
 *               paidAmount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Outstanding record updated successfully
 *       404:
 *         description: Outstanding record not found
 */
export const updateSuperAdminOutstanding = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const userId = req.user.userId;
    const updateData = req.body;

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      isActive: true
    });

    if (!outstanding) {
      return res.status(404).json({
        success: false,
        message: 'Outstanding record not found'
      });
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] !== undefined) {
        outstanding[key] = updateData[key];
      }
    });

    // Update outstanding amount if paid amount is updated
    if (updateData.paidAmount !== undefined) {
      outstanding.outstandingAmount = outstanding.totalAmount - updateData.paidAmount;
      
      // Update status based on payment
      if (outstanding.outstandingAmount <= 0) {
        outstanding.status = 'paid';
      } else if (updateData.paidAmount > 0) {
        outstanding.status = 'partially_paid';
      }
    }

    outstanding.updatedBy = userId;
    await outstanding.save();

    return res.json({
      success: true,
      data: outstanding,
      message: 'Outstanding record updated successfully'
    });
  } catch (err) {
    console.error('Error updating super admin outstanding:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update outstanding record',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/superadmin/outstanding/{outstandingId}/add-note:
 *   post:
 *     summary: Add collection note to outstanding record
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: outstandingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Outstanding record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 description: Collection note
 *     responses:
 *       200:
 *         description: Collection note added successfully
 *       404:
 *         description: Outstanding record not found
 */
export const addSuperAdminCollectionNote = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const userId = req.user.userId;
    const { note } = req.body;

    if (!note || note.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Note is required'
      });
    }

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      isActive: true
    });

    if (!outstanding) {
      return res.status(404).json({
        success: false,
        message: 'Outstanding record not found'
      });
    }

    outstanding.collectionNotes.push({
      note: note.trim(),
      addedBy: userId,
      addedAt: new Date()
    });

    outstanding.updatedBy = userId;
    await outstanding.save();

    return res.json({
      success: true,
      data: outstanding,
      message: 'Collection note added successfully'
    });
  } catch (err) {
    console.error('Error adding super admin collection note:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to add collection note',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};