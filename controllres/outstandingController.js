import Outstanding from '../models/outstanding/outstandingModel.js';
import Order from '../models/order/orderModel.js';
import User from '../models/user/userModel.js';
import mongoose from 'mongoose';

// Get outstanding summary and statistics
export const getOutstandingSummary = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { status, riskLevel, daysOverdue } = req.query;

    // Build filter query
    let filters = {};
    if (status) filters.status = status;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (daysOverdue) {
      const days = parseInt(daysOverdue);
      filters.daysOverdue = { $gte: days };
    }

    // Get summary statistics
    const summary = await Outstanding.getOutstandingSummary(companyId, filters);

    // Get outstanding by status
    const statusBreakdown = await Outstanding.aggregate([
      { $match: { companyId, isActive: true, ...filters } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$outstandingAmount' }
        }
      }
    ]);

    // Get top outstanding parties
    const topParties = await Outstanding.aggregate([
      { $match: { companyId, isActive: true, ...filters } },
      {
        $group: {
          _id: '$partyId',
          partyName: { $first: '$partyName' },
          totalOutstanding: { $sum: '$outstandingAmount' },
          orderCount: { $sum: 1 },
          maxDaysOverdue: { $max: '$daysOverdue' }
        }
      },
      { $sort: { totalOutstanding: -1 } },
      { $limit: 10 }
    ]);

    // Get aging analysis
    const agingAnalysis = await Outstanding.aggregate([
      { $match: { companyId, isActive: true, ...filters } },
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
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary,
        statusBreakdown,
        topParties,
        agingAnalysis
      },
      message: 'Outstanding summary retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching outstanding summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding summary',
      error: error.message
    });
  }
};

// Get outstanding list with filters and pagination
export const getOutstandingList = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const {
      page = 1,
      limit = 20,
      status,
      riskLevel,
      partyType,
      daysOverdue,
      search,
      sortBy = 'dueDate',
      sortOrder = 'asc'
    } = req.query;

    // Build filter query
    let filters = { companyId, isActive: true };
    
    if (status) filters.status = status;
    if (riskLevel) filters.riskLevel = riskLevel;
    if (partyType) filters.partyType = partyType;
    if (daysOverdue) {
      const days = parseInt(daysOverdue);
      filters.daysOverdue = { $gte: days };
    }
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

    // Get outstanding list
    const outstandingList = await Outstanding.find(filters)
      .populate('partyId', 'name email mobile')
      .populate('orderId', 'orderNumber orderDate finalAmount')
      .populate('assignedTo', 'name email')
      .populate('createdBy', 'name email')
      .sort(sortQuery)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalCount = await Outstanding.countDocuments(filters);

    res.status(200).json({
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
      },
      message: 'Outstanding list retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching outstanding list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding list',
      error: error.message
    });
  }
};

// Get outstanding details by ID
export const getOutstandingDetails = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      companyId,
      isActive: true
    })
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

    res.status(200).json({
      success: true,
      data: outstanding,
      message: 'Outstanding details retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching outstanding details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch outstanding details',
      error: error.message
    });
  }
};

// Update outstanding record
export const updateOutstanding = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const updateData = req.body;

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      companyId,
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

    outstanding.updatedBy = userId;
    await outstanding.save();

    res.status(200).json({
      success: true,
      data: outstanding,
      message: 'Outstanding record updated successfully'
    });

  } catch (error) {
    console.error('Error updating outstanding:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update outstanding record',
      error: error.message
    });
  }
};

// Add collection note
export const addCollectionNote = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { note } = req.body;

    if (!note || note.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Note is required'
      });
    }

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      companyId,
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

    res.status(200).json({
      success: true,
      data: outstanding,
      message: 'Collection note added successfully'
    });

  } catch (error) {
    console.error('Error adding collection note:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add collection note',
      error: error.message
    });
  }
};

// Assign outstanding to user
export const assignOutstanding = async (req, res) => {
  try {
    const { outstandingId } = req.params;
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Assigned user is required'
      });
    }

    // Verify assigned user exists
    const assignedUser = await User.findOne({
      _id: assignedTo,
      isActive: true
    });

    if (!assignedUser) {
      return res.status(404).json({
        success: false,
        message: 'Assigned user not found'
      });
    }

    const outstanding = await Outstanding.findOne({
      _id: outstandingId,
      companyId,
      isActive: true
    });

    if (!outstanding) {
      return res.status(404).json({
        success: false,
        message: 'Outstanding record not found'
      });
    }

    outstanding.assignedTo = assignedTo;
    outstanding.updatedBy = userId;
    await outstanding.save();

    res.status(200).json({
      success: true,
      data: outstanding,
      message: 'Outstanding assigned successfully'
    });

  } catch (error) {
    console.error('Error assigning outstanding:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign outstanding',
      error: error.message
    });
  }
};

// Generate outstanding from orders (automatically called when orders are approved)
export const generateOutstandingFromOrder = async (orderId, companyId) => {
  try {
    const order = await Order.findById(orderId).populate('createdBy', 'name email');
    
    if (!order || order.status !== 'approved') {
      return null;
    }

    // Check if outstanding already exists for this order
    const existingOutstanding = await Outstanding.findOne({ orderId });
    if (existingOutstanding) {
      return existingOutstanding;
    }

    // Calculate due date based on payment terms
    const paymentTerms = order.paymentMethod || '30_days';
    const dueDate = new Date(order.orderDate);
    
    switch (paymentTerms) {
      case 'immediate':
        dueDate.setDate(dueDate.getDate());
        break;
      case '7_days':
        dueDate.setDate(dueDate.getDate() + 7);
        break;
      case '15_days':
        dueDate.setDate(dueDate.getDate() + 15);
        break;
      case '30_days':
        dueDate.setDate(dueDate.getDate() + 30);
        break;
      case '45_days':
        dueDate.setDate(dueDate.getDate() + 45);
        break;
      case '60_days':
        dueDate.setDate(dueDate.getDate() + 60);
        break;
      case '90_days':
        dueDate.setDate(dueDate.getDate() + 90);
        break;
      default:
        dueDate.setDate(dueDate.getDate() + 30);
    }

    // Generate unique outstanding ID
    const outstandingId = `OUT-${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${orderId.toString().slice(-6)}`;

    const outstanding = new Outstanding({
      outstandingId,
      companyId,
      partyId: order.createdBy,
      partyName: order.createdBy.name,
      partyType: 'customer',
      partyContact: {
        mobile: order.createdBy.mobile || '',
        email: order.createdBy.email || ''
      },
      orderId,
      orderNumber: order.orderNumber,
      orderDate: order.orderDate,
      totalAmount: order.finalAmount,
      paidAmount: 0,
      outstandingAmount: order.finalAmount,
      paymentTerms,
      dueDate,
      status: 'pending',
      daysOverdue: 0,
      createdBy: order.createdBy._id,
      isActive: true
    });

    await outstanding.save();
    return outstanding;

  } catch (error) {
    console.error('Error generating outstanding from order:', error);
    return null;
  }
};

// Get users for assignment
export const getUsersForAssignment = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const users = await User.find({
      isActive: true,
      role: { $in: ['admin', 'zonal', 'rsm', 'asm', 'salesman'] }
    })
    .select('_id name email role')
    .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: { users },
      message: 'Users for assignment retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching users for assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users for assignment',
      error: error.message
    });
  }
};
