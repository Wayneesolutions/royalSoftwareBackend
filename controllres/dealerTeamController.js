import User from "../models/user/userModel.js"
import Company from "../models/company/companyModel.js"
import SubDealer from "../models/subdealer/subdealerModel.js"
import Ledger from "../models/ledger/ledgerModel.js"
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
    const { 
      SDName, 
      SDEmail, 
      SDMobileNo, 
      SDContactPerson, 
      SDAddress1, 
      SDAddress2, 
      SDAddress3,
      SDState, 
      SDCountry,
      SDPincode, 
      SDType,
      SDGSTNType,
      SDGSTNNumber
    } = req.body;
    const dealerId = req.user.userId;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    console.log('createSubDealer - Dealer:', req.user.userDetails.name, 'Role:', req.user.userDetails.role);
    console.log('createSubDealer - Company ID:', companyId);
    console.log('createSubDealer - Dealer ID:', dealerId);

    // Validate required fields
    if (!SDName || !SDMobileNo) {
      return res.status(400).json({
        success: false,
        message: 'Sub-dealer name and mobile are required'
      });
    }

    // Get dealer's groupId from Ledger model
    let dealerGroupId = null;
    try {
      const dealer = await Ledger.findById(dealerId).lean();
      if (dealer && dealer.groupId) {
        dealerGroupId = dealer.groupId;
        console.log('createSubDealer - Dealer groupId:', dealerGroupId);
      } else {
        // If dealer not found in Ledger, try User model (for backward compatibility)
        const dealerUser = await User.findById(dealerId).lean();
        if (dealerUser && dealerUser.groups && dealerUser.groups.length > 0) {
          const activeGroup = dealerUser.groups.find((g) => g.isActive);
          if (activeGroup && activeGroup.groupId) {
            dealerGroupId = typeof activeGroup.groupId === 'object' 
              ? activeGroup.groupId._id 
              : activeGroup.groupId;
            console.log('createSubDealer - Dealer groupId from User model:', dealerGroupId);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching dealer groupId:', error);
    }

    if (!dealerGroupId) {
      return res.status(400).json({
        success: false,
        message: 'Dealer group not found. Please ensure dealer is assigned to a group.'
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

    // Check if subdealer already exists with same mobile or email
    const existingSubDealer = await SubDealer.findOne({
      $or: [
        { SDMobileNo: SDMobileNo },
        ...(SDEmail ? [{ SDEmail: SDEmail }] : [])
      ],
      companyId: companyId,
      isActive: true
    });
    
    if (existingSubDealer) {
      return res.status(400).json({
        success: false,
        message: 'Sub-dealer with this mobile or email already exists'
      });
    }

    // Create sub-dealer in SubDealer model
    const newSubDealer = await SubDealer.create({
      SDName: SDName,
      SDType: SDType || 'Sub Dealer',
      SDEmail: SDEmail || '',
      SDMobileNo: SDMobileNo,
      SDContactPerson: SDContactPerson || SDName,
      SDAddress1: SDAddress1 || '',
      SDAddress2: SDAddress2 || '',
      SDAddress3: SDAddress3 || '',
      SDState: SDState || '',
      SDCountry: SDCountry || 'India',
      SDPincode: SDPincode || '',
      SDGSTNType: SDGSTNType || '',
      SDGSTNNumber: SDGSTNNumber || '',
      companyId: companyId,
      cmpcode: company.companyCode || '',
      Cmpguid: company.companyGUID || '',
      groupId: dealerGroupId, // Assign to dealer's group
      createdBy: dealerId,
      isActive: true
    });

    // Return sub-dealer
    const subDealerResponse = await SubDealer.findById(newSubDealer._id)
      .populate('createdBy', 'name email')
      .populate('groupId', 'GroupName GroupGUID')
      .populate('companyId', 'companyName companyCode')
      .lean();

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

    // Match sub dealers created by this dealer OR explicitly linked to this dealer
    // (dealerId is set when admin/group user creates a sub dealer on behalf of a dealer)
    const ownershipOr = { $or: [{ createdBy: dealerId }, { dealerId: dealerId }] };

    let query;
    if (search) {
      const searchOr = {
        $or: [
          { SDName: { $regex: search, $options: 'i' } },
          { SDEmail: { $regex: search, $options: 'i' } },
          { SDMobileNo: { $regex: search, $options: 'i' } },
          { SDContactPerson: { $regex: search, $options: 'i' } }
        ]
      };
      query = {
        companyId: companyId,
        isActive: true,
        $and: [ownershipOr, searchOr]
      };
    } else {
      query = {
        companyId: companyId,
        isActive: true,
        ...ownershipOr
      };
    }

    const subDealers = await SubDealer.find(query)
      .populate('createdBy', 'name email')
      .populate('groupId', 'GroupName GroupGUID')
      .populate('companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalSubDealers = await SubDealer.countDocuments(query);
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

    // Check if subdealer exists and was created by this dealer
    const subDealer = await SubDealer.findOne({
      _id: subDealerId,
      createdBy: dealerId,
      companyId: companyId,
      isActive: true
    })
      .populate('createdBy', 'name email')
      .populate('groupId', 'GroupName GroupGUID')
      .populate('companyId', 'companyName companyCode')
      .lean();

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

    // Map frontend fields to SubDealer model fields
    const subDealerUpdateData = {};
    if (updateData.SDName !== undefined) subDealerUpdateData.SDName = updateData.SDName;
    if (updateData.name !== undefined) subDealerUpdateData.SDName = updateData.name; // Support both
    if (updateData.SDMobileNo !== undefined) subDealerUpdateData.SDMobileNo = updateData.SDMobileNo;
    if (updateData.mobile !== undefined) subDealerUpdateData.SDMobileNo = updateData.mobile; // Support both
    if (updateData.SDEmail !== undefined) subDealerUpdateData.SDEmail = updateData.SDEmail;
    if (updateData.email !== undefined) subDealerUpdateData.SDEmail = updateData.email; // Support both
    if (updateData.SDContactPerson !== undefined) subDealerUpdateData.SDContactPerson = updateData.SDContactPerson;
    if (updateData.SDAddress1 !== undefined) subDealerUpdateData.SDAddress1 = updateData.SDAddress1;
    if (updateData.SDAddress2 !== undefined) subDealerUpdateData.SDAddress2 = updateData.SDAddress2;
    if (updateData.SDAddress3 !== undefined) subDealerUpdateData.SDAddress3 = updateData.SDAddress3;
    if (updateData.SDState !== undefined) subDealerUpdateData.SDState = updateData.SDState;
    if (updateData.SDCountry !== undefined) subDealerUpdateData.SDCountry = updateData.SDCountry;
    if (updateData.SDPincode !== undefined) subDealerUpdateData.SDPincode = updateData.SDPincode;
    if (updateData.SDType !== undefined) subDealerUpdateData.SDType = updateData.SDType;
    if (updateData.SDGSTNType !== undefined) subDealerUpdateData.SDGSTNType = updateData.SDGSTNType;
    if (updateData.SDGSTNNumber !== undefined) subDealerUpdateData.SDGSTNNumber = updateData.SDGSTNNumber;
    if (updateData.isActive !== undefined) subDealerUpdateData.isActive = updateData.isActive;
    
    // Handle address object if provided (for backward compatibility)
    if (updateData.address) {
      if (updateData.address.street) subDealerUpdateData.SDAddress1 = updateData.address.street;
      if (updateData.address.city) subDealerUpdateData.SDAddress2 = updateData.address.city;
      if (updateData.address.state) subDealerUpdateData.SDState = updateData.address.state;
      if (updateData.address.pincode) subDealerUpdateData.SDPincode = updateData.address.pincode;
      if (updateData.address.country) subDealerUpdateData.SDCountry = updateData.address.country;
    }

    subDealerUpdateData.updatedBy = dealerId;

    // Only allow updating subdealers created by this dealer
    const subDealer = await SubDealer.findOneAndUpdate(
      {
        _id: subDealerId,
        createdBy: dealerId,
        companyId: companyId,
        isActive: true
      },
      subDealerUpdateData,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('groupId', 'GroupName GroupGUID')
      .populate('companyId', 'companyName companyCode')
      .lean();

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

    // Only allow deactivating subdealers created by this dealer
    const subDealer = await SubDealer.findOneAndUpdate(
      {
        _id: subDealerId,
        createdBy: dealerId,
        companyId: companyId,
        isActive: true
      },
      { 
        isActive: false,
        updatedBy: dealerId
      },
      { new: true }
    )
      .populate('createdBy', 'name email')
      .populate('groupId', 'GroupName GroupGUID')
      .populate('companyId', 'companyName companyCode')
      .lean();

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
