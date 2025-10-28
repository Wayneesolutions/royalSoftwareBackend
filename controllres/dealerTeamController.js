import User from "../models/user/userModel.js"
import Company from "../models/company/companyModel.js"
import bcrypt from 'bcryptjs'

/**
 * @swagger
 * /api/v1/dealer/create-subdealer:
 *   post:
 *     summary: Create a new sub-dealer under the dealer
 *     tags: [Dealer]
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
 *       201:
 *         description: Sub-dealer created successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 */
export const createSubDealer = async (req, res) => {
  try {
    const { email, password, name, mobile, address } = req.body;
    const dealerId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    console.log('createSubDealer - Dealer:', req.user.userDetails.name, 'Role:', req.user.userDetails.role);
    console.log('createSubDealer - Company ID:', companyId);
    console.log('createSubDealer - Dealer ID:', dealerId);

    // Validate required fields
    if (!email || !password || !name || !mobile) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: email, password, name, mobile'
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

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(400).json({
        success: false,
        message: 'Company not found'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create sub-dealer
    const newSubDealer = await User.create({
      email,
      password: hashedPassword,
      name,
      mobile,
      role: 'subdealer',
      companies: [{
        companyId: companyId,
        role: 'subdealer',
        isActive: true,
        assignedBy: dealerId
      }],
      hierarchy: {
        parentUser: dealerId,
        level: 7 // Sub-dealer level
      },
      createdBy: dealerId,
      address: address || {}
    });

    // Return sub-dealer without password
    const subDealerResponse = await User.findById(newSubDealer._id)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    console.log('createSubDealer - Sub-dealer created successfully:', subDealerResponse._id);

    return res.status(201).json({
      success: true,
      message: 'Sub-dealer created successfully',
      data: subDealerResponse
    });
  } catch (error) {
    console.error('Sub-dealer creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create sub-dealer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/dealer/subdealers:
 *   get:
 *     summary: Get all sub-dealers under the dealer
 *     tags: [Dealer]
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
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: Sub-dealers retrieved successfully
 *       403:
 *         description: Access denied
 */
export const getSubDealers = async (req, res) => {
  try {
    const dealerId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { page = 1, limit = 10, search } = req.query;
    const skip = (page - 1) * limit;

    console.log('getSubDealers - Dealer:', req.user.userDetails.name, 'Role:', req.user.userDetails.role);
    console.log('getSubDealers - Company ID:', companyId);
    console.log('getSubDealers - Dealer ID:', dealerId);

    // Build query
    const query = {
      role: 'subdealer',
      'companies.companyId': companyId,
      'companies.isActive': true,
      'hierarchy.parentUser': dealerId
    };

    // Add search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    const subDealers = await User.find(query)
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalSubDealers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalSubDealers / limit);

    console.log('getSubDealers - Found sub-dealers:', subDealers.length);

    return res.json({
      success: true,
      data: {
        subDealers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalSubDealers,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error getting sub-dealers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sub-dealers',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/dealer/subdealers/{subDealerId}:
 *   get:
 *     summary: Get sub-dealer by ID
 *     tags: [Dealer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subDealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Sub-dealer ID
 *     responses:
 *       200:
 *         description: Sub-dealer retrieved successfully
 *       404:
 *         description: Sub-dealer not found
 *       403:
 *         description: Access denied
 */
export const getSubDealerById = async (req, res) => {
  try {
    const { subDealerId } = req.params;
    const dealerId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const subDealer = await User.findOne({
      _id: subDealerId,
      role: 'subdealer',
      'companies.companyId': companyId,
      'companies.isActive': true,
      'hierarchy.parentUser': dealerId
    })
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    if (!subDealer) {
      return res.status(404).json({
        success: false,
        message: 'Sub-dealer not found'
      });
    }

    return res.json({
      success: true,
      data: subDealer
    });
  } catch (error) {
    console.error('Error getting sub-dealer by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sub-dealer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/dealer/subdealers/{subDealerId}:
 *   put:
 *     summary: Update sub-dealer
 *     tags: [Dealer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subDealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Sub-dealer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               mobile:
 *                 type: string
 *               address:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Sub-dealer updated successfully
 *       404:
 *         description: Sub-dealer not found
 *       403:
 *         description: Access denied
 */
export const updateSubDealer = async (req, res) => {
  try {
    const { subDealerId } = req.params;
    const dealerId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const updateData = req.body;

    // Remove fields that shouldn't be updated directly
    delete updateData.email;
    delete updateData.password;
    delete updateData.role;
    delete updateData.companies;
    delete updateData.hierarchy;
    delete updateData.createdBy;
    delete updateData.createdAt;

    const subDealer = await User.findOneAndUpdate(
      {
        _id: subDealerId,
        role: 'subdealer',
        'companies.companyId': companyId,
        'companies.isActive': true,
        'hierarchy.parentUser': dealerId
      },
      updateData,
      { new: true, runValidators: true }
    )
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    if (!subDealer) {
      return res.status(404).json({
        success: false,
        message: 'Sub-dealer not found'
      });
    }

    return res.json({
      success: true,
      message: 'Sub-dealer updated successfully',
      data: subDealer
    });
  } catch (error) {
    console.error('Error updating sub-dealer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update sub-dealer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @swagger
 * /api/v1/dealer/subdealers/{subDealerId}:
 *   delete:
 *     summary: Deactivate sub-dealer
 *     tags: [Dealer]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subDealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Sub-dealer ID
 *     responses:
 *       200:
 *         description: Sub-dealer deactivated successfully
 *       404:
 *         description: Sub-dealer not found
 *       403:
 *         description: Access denied
 */
export const deactivateSubDealer = async (req, res) => {
  try {
    const { subDealerId } = req.params;
    const dealerId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const subDealer = await User.findOneAndUpdate(
      {
        _id: subDealerId,
        role: 'subdealer',
        'companies.companyId': companyId,
        'companies.isActive': true,
        'hierarchy.parentUser': dealerId
      },
      { 
        'companies.$.isActive': false,
        isActive: false 
      },
      { new: true }
    )
      .select('-password')
      .populate('companies.companyId', 'companyName companyCode')
      .populate('hierarchy.parentUser', 'name email role')
      .populate('createdBy', 'name email');

    if (!subDealer) {
      return res.status(404).json({
        success: false,
        message: 'Sub-dealer not found'
      });
    }

    return res.json({
      success: true,
      message: 'Sub-dealer deactivated successfully',
      data: subDealer
    });
  } catch (error) {
    console.error('Error deactivating sub-dealer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate sub-dealer',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
