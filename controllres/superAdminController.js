import bcrypt from 'bcryptjs';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';
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

// Update an admin (email, name, password)
export const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params
    const { email, name, password } = req.body

    const update = {}
    if (email) update.email = email
    if (name) update.name = name
    if (password) update.password = await bcrypt.hash(password, 10)

    const updated = await User.findOneAndUpdate(
      { _id: id, role: 'admin' },
      { $set: update },
      { new: true }
    ).select('-password')

    if (!updated) {
      return res.json({ success: false, message: 'Admin not found' })
    }

    return res.json({ success: true, message: 'Admin updated', data: updated })
  } catch (err) {
    return res.json({ success: false, message: 'Failed to update admin' })
  }
}

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