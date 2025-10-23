import Order from '../models/order/orderModel.js';
import User from '../models/user/userModel.js';

// Get hierarchy-based approval workflow
const getApprovalHierarchy = () => {
  return {
    'dealers': ['salesman', 'asm', 'rsm', 'zonal', 'admin'],
    'salesman': ['asm', 'rsm', 'zonal', 'admin'],
    'asm': ['rsm', 'zonal', 'admin'],
    'rsm': ['zonal', 'admin'],
    'zonal': ['admin'],
    'admin': [], // Admin is the final approver
    'subdealer': ['dealers', 'salesman', 'asm', 'rsm', 'zonal', 'admin'],
    'distibutors': ['asm', 'rsm', 'zonal', 'admin']
  };
};

// Find the next approver in hierarchy
const findNextApprover = async (orderCreator, companyId) => {
  try {
    const hierarchy = getApprovalHierarchy();
    const creatorRole = orderCreator.role;
    const approvalChain = hierarchy[creatorRole] || [];

    if (approvalChain.length === 0) {
      // Self-approval case
      return orderCreator;
    }

    // Find the first approver in the chain who exists in the company
    for (const role of approvalChain) {
      const approver = await User.findOne({
        role: role,
        $or: [
          { defaultCompany: companyId },
          { 'companies.companyId': companyId }
        ],
        isActive: true
      }).select('_id name role email mobile');

      if (approver) {
        return approver;
      }
    }

    // If no approver found in hierarchy, return admin
    const admin = await User.findOne({
      role: 'admin',
      $or: [
        { defaultCompany: companyId },
        { 'companies.companyId': companyId }
      ],
      isActive: true
    }).select('_id name role email mobile');

    return admin;
  } catch (error) {
    console.error('Error finding next approver:', error);
    return null;
  }
};

// Find the next approver after current approver
const findNextApproverAfterCurrent = async (currentApproverRole, companyId) => {
  try {
    const hierarchy = getApprovalHierarchy();
    const approvalChain = hierarchy[currentApproverRole] || [];

    if (approvalChain.length === 0) {
      // No more approvers - this is the final approval
      return null;
    }

    // Find the first approver in the chain who exists in the company
    for (const role of approvalChain) {
      const approver = await User.findOne({
        role: role,
        $or: [
          { defaultCompany: companyId },
          { 'companies.companyId': companyId }
        ],
        isActive: true
      }).select('_id name role email mobile');

      if (approver) {
        return approver;
      }
    }

    // If no approver found in hierarchy, return admin
    const admin = await User.findOne({
      role: 'admin',
      $or: [
        { defaultCompany: companyId },
        { 'companies.companyId': companyId }
      ],
      isActive: true
    }).select('_id name role email mobile');

    return admin;
  } catch (error) {
    console.error('Error finding next approver after current:', error);
    return null;
  }
};

// Submit order for approval
export const submitOrderForApproval = async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;

    // Find the order
    const order = await Order.findOne({
      _id: orderId,
      companyId,
      createdBy: userId,
      isActive: true
    }).populate('createdBy', 'name role email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or you are not authorized to submit this order'
      });
    }

    // Check if order is in draft status
    if (order.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Order is not in draft status and cannot be submitted for approval'
      });
    }

    // Find the next approver
    const nextApprover = await findNextApprover(order.createdBy, companyId);

    if (!nextApprover) {
      return res.status(500).json({
        success: false,
        message: 'No approver found in the hierarchy'
      });
    }

    // Check for self-approval
    if (nextApprover._id.toString() === userId.toString()) {
      // Self-approval case
      order.status = 'approved';
      order.approvedBy = userId;
      order.approvedAt = new Date();
      order.approvalNotes = 'Self-approved';

      // Add to approval history
      order.approvalHistory.push({
        approverId: userId,
        approverName: order.createdBy.name,
        approverRole: order.createdBy.role,
        action: 'approved',
        notes: 'Self-approved',
        timestamp: new Date()
      });

      await order.save();

      return res.json({
        success: true,
        message: 'Order has been self-approved',
        order,
        isSelfApproved: true
      });
    }

    // Regular approval workflow
    order.status = 'pending_approval';
    order.nextApprover = nextApprover._id;

    // Add to approval history
    order.approvalHistory.push({
      approverId: nextApprover._id,
      approverName: nextApprover.name,
      approverRole: nextApprover.role,
      action: 'pending',
      notes: 'Submitted for approval',
      timestamp: new Date()
    });

    await order.save();

    res.json({
      success: true,
      message: 'Order submitted for approval successfully',
      order,
      nextApprover: {
        _id: nextApprover._id,
        name: nextApprover.name,
        role: nextApprover.role
      }
    });

  } catch (error) {
    console.error('Submit order for approval error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get orders pending approval for current user
export const getPendingApprovals = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;
    const { page = 1, limit = 20, status } = req.query;

    const query = {
      companyId,
      nextApprover: userId,
      isActive: true
    };

    if (status) {
      query.status = status;
    } else {
      query.status = 'pending_approval';
    }

    const orders = await Order.find(query)
      .populate('createdBy', 'name role email mobile')
      .populate('customerId', 'name email mobile')
      .populate('nextApprover', 'name role')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Approve or reject an order
export const approveRejectOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action, notes } = req.body; // action: 'approved' or 'rejected'
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;
    const userRole = req.user.userDetails.role;

    // Validate action
    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approved" or "rejected"'
      });
    }

    // Find the order
    const order = await Order.findOne({
      _id: orderId,
      companyId,
      nextApprover: userId,
      status: 'pending_approval',
      isActive: true
    }).populate('createdBy', 'name role email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or you are not authorized to approve this order'
      });
    }

    // Update approval history
    order.approvalHistory.push({
      approverId: userId,
      approverName: req.user.userDetails.name,
      approverRole: userRole,
      action: action,
      notes: notes || '',
      timestamp: new Date()
    });

    if (action === 'rejected') {
      // Reject the order
      order.status = 'cancelled';
      order.nextApprover = null;
      order.approvalNotes = notes || 'Order rejected';
    } else {
      // Approve the order
      // Find the next approver after the current approver
      const nextApprover = await findNextApproverAfterCurrent(userRole, companyId);
      
      if (!nextApprover) {
        // Final approval - no more approvers in chain
        order.status = 'approved';
        order.approvedBy = userId;
        order.approvedAt = new Date();
        order.nextApprover = null;
        order.approvalNotes = notes || 'Order approved';
      } else {
        // Move to next approver
        order.nextApprover = nextApprover._id;
        order.approvalNotes = notes || 'Approved, forwarded to next level';
        
        // Add pending entry for next approver
        order.approvalHistory.push({
          approverId: nextApprover._id,
          approverName: nextApprover.name,
          approverRole: nextApprover.role,
          action: 'pending',
          notes: 'Forwarded for approval',
          timestamp: new Date()
        });
      }
    }

    await order.save();

    res.json({
      success: true,
      message: `Order ${action} successfully`,
      order,
      nextApprover: order.nextApprover ? {
        _id: order.nextApprover,
        name: order.approvalHistory[order.approvalHistory.length - 1]?.approverName,
        role: order.approvalHistory[order.approvalHistory.length - 1]?.approverRole
      } : null
    });

  } catch (error) {
    console.error('Approve/reject order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get approval history for an order
export const getApprovalHistory = async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const order = await Order.findOne({
      _id: orderId,
      companyId,
      isActive: true
    }).populate('approvalHistory.approverId', 'name role email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      approvalHistory: order.approvalHistory,
      currentStatus: order.status,
      nextApprover: order.nextApprover
    });

  } catch (error) {
    console.error('Get approval history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get orders created by current user (for tracking)
export const getMyOrders = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;
    const { page = 1, limit = 20, status } = req.query;

    const query = {
      companyId,
      createdBy: userId,
      isActive: true
    };

    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('approvedBy', 'name role')
      .populate('nextApprover', 'name role')
      .populate('customerId', 'name email mobile')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalOrders: total,
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get my orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
