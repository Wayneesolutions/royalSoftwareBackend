import Order from '../models/order/orderModel.js';
import Target from '../models/target/targetModel.js';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';
import mongoose from 'mongoose';

// GET: Tally can fetch approved orders for sync
export const getApprovedOrders = async (req, res) => {
  try {
    const { companyId, fromDate, toDate, limit = 100, offset = 0 } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    // Build query for approved orders
    let query = {
      companyId: new mongoose.Types.ObjectId(companyId),
      status: 'approved',
      isActive: true
    };

    // Add date filters if provided
    if (fromDate || toDate) {
      query.orderDate = {};
      if (fromDate) query.orderDate.$gte = new Date(fromDate);
      if (toDate) query.orderDate.$lte = new Date(toDate);
    }

    // Fetch orders with pagination
    const orders = await Order.find(query)
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .sort({ orderDate: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    // Get total count for pagination
    const totalCount = await Order.countDocuments(query);

    // Format orders for Tally
    const formattedOrders = orders.map(order => ({
      appOrderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerMobile: order.customerMobile,
      customerAddress: order.customerAddress,
      items: order.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        productCode: item.productCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        discount: item.discount,
        tax: item.tax
      })),
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate,
      totalAmount: order.totalAmount,
      discountAmount: order.discountAmount,
      taxAmount: order.taxAmount,
      finalAmount: order.finalAmount,
      paymentMethod: order.paymentMethod,
      priority: order.priority,
      notes: order.notes,
      createdBy: {
        id: order.createdBy._id,
        name: order.createdBy.name,
        role: order.createdBy.role
      },
      approvedBy: order.approvedBy ? {
        id: order.approvedBy._id,
        name: order.approvedBy.name,
        role: order.approvedBy.role
      } : null,
      approvedAt: order.approvedAt,
      shippingAddress: order.shippingAddress
    }));

    res.status(200).json({
      success: true,
      data: formattedOrders,
      pagination: {
        total: totalCount,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: (parseInt(offset) + parseInt(limit)) < totalCount
      },
      message: 'Approved orders retrieved successfully'
    });

    } catch (error) {
    console.error('Error fetching approved orders for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approved orders',
      error: error.message
    });
  }
};

// POST: Tally can send back Tally GUID after creating voucher
export const updateOrderTallyInfo = async (req, res) => {
  try {
    const { appOrderId, tallyGUID, tallyVoucherNumber, syncStatus = 'synced' } = req.body;

    if (!appOrderId || !tallyGUID) {
      return res.status(400).json({
        success: false,
        message: 'App Order ID and Tally GUID are required'
      });
    }

    // Find and update the order
    const order = await Order.findById(appOrderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order with Tally information
    order.tallyGUID = tallyGUID;
    order.tallyVoucherNumber = tallyVoucherNumber;
    order.tallySyncStatus = syncStatus;
    order.tallySyncAt = new Date();
    order.status = 'sent_to_tally'; // Update status

    await order.save();

    res.status(200).json({
      success: true,
      order: {
        appOrderId: order._id,
        orderNumber: order.orderNumber,
        tallyGUID: order.tallyGUID,
        tallyVoucherNumber: order.tallyVoucherNumber,
        tallySyncStatus: order.tallySyncStatus,
        tallySyncAt: order.tallySyncAt,
        status: order.status
      },
      message: 'Order Tally information updated successfully'
    });

  } catch (error) {
    console.error('Error updating order Tally info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order Tally information',
      error: error.message
    });
  }
};

// GET: Tally can fetch targets for comparison
export const getTargets = async (req, res) => {
  try {
    const { companyId, year, month, role } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    // Build query
    let query = {
      companyId: new mongoose.Types.ObjectId(companyId),
      isActive: true,
      status: 'active'
    };

    if (year) query['period.year'] = parseInt(year);
    if (month) query['period.month'] = parseInt(month);
    if (role) query.role = role;

    // Fetch targets
    const targets = await Target.find(query)
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .sort({ hierarchyLevel: 1, 'assignedTo.name': 1 });

    // Format targets for Tally
    const formattedTargets = targets.map(target => ({
      appTargetId: target._id,
      targetId: target.targetId,
      assignedTo: {
        id: target.assignedTo._id,
        name: target.assignedTo.name,
        role: target.assignedTo.role
      },
      assignedBy: {
        id: target.assignedBy._id,
        name: target.assignedBy.name,
        role: target.assignedBy.role
      },
      targetType: target.targetType,
      period: target.period,
      targetAmount: target.targetAmount,
      targetQuantity: target.targetQuantity,
      achievedAmount: target.achievedAmount,
      achievedQuantity: target.achievedQuantity,
      achievementPercentage: target.achievementPercentage,
      hierarchyLevel: target.hierarchyLevel,
      role: target.role,
      status: target.status,
      assignedAt: target.assignedAt,
      lastUpdated: target.lastUpdated
    }));

    res.status(200).json({
      success: true,
      data: formattedTargets,
      count: formattedTargets.length,
      message: 'Targets retrieved successfully'
    });

    } catch (error) {
    console.error('Error fetching targets for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch targets',
      error: error.message
    });
  }
};

// POST: Tally can send updated targets
export const updateTargetsFromTally = async (req, res) => {
  try {
    const { targets } = req.body;

    if (!targets || !Array.isArray(targets)) {
      return res.status(400).json({
        success: false,
        message: 'Targets array is required'
      });
    }

    const updatedTargets = [];

    for (const targetData of targets) {
      const { appTargetId, tallyTargetId, achievedAmount, achievedQuantity, tallySyncStatus = 'synced' } = targetData;

      if (!appTargetId) {
        continue; // Skip if no app target ID
      }

      // Find and update target
      const target = await Target.findById(appTargetId);
      if (target) {
        // Update achievement data from Tally
        if (achievedAmount !== undefined) target.achievedAmount = achievedAmount;
        if (achievedQuantity !== undefined) target.achievedQuantity = achievedQuantity;
        target.tallyGUID = tallyTargetId;
        target.tallySyncStatus = tallySyncStatus;
        target.tallySyncAt = new Date();
        target.lastUpdated = new Date();

        await target.save();
        updatedTargets.push(target);
      }
    }

    res.status(200).json({
      success: true,
      updatedCount: updatedTargets.length,
      message: `Successfully updated ${updatedTargets.length} targets from Tally`
    });

  } catch (error) {
    console.error('Error updating targets from Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update targets from Tally',
      error: error.message
    });
  }
};

// GET: Tally can fetch company and user information
export const getCompanyInfo = async (req, res) => {
  try {
    const { companyId } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    // Fetch company information
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // Fetch users in the company
    const users = await User.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      isActive: true
    }).select('_id name email role hierarchyLevel');

    // Format response
    const companyInfo = {
      company: {
        id: company._id,
        companyName: company.companyName,
        companyCode: company.companyCode,
        companyEmail: company.companyEmail,
        companyMobile: company.companyMobile,
        gstin: company.gstin,
        address: company.address
      },
      users: users.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hierarchyLevel: user.hierarchyLevel
      }))
    };

    res.status(200).json({
      success: true,
      data: companyInfo,
      message: 'Company information retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching company info for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch company information',
      error: error.message
    });
  }
};

// GET: Tally can fetch order statistics
export const getOrderStats = async (req, res) => {
  try {
    const { companyId, fromDate, toDate } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    // Build date filter
    let dateFilter = {};
    if (fromDate || toDate) {
      dateFilter.orderDate = {};
      if (fromDate) dateFilter.orderDate.$gte = new Date(fromDate);
      if (toDate) dateFilter.orderDate.$lte = new Date(toDate);
    }

    // Get order statistics
    const stats = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          isActive: true,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' }
        }
      }
    ]);

    // Format statistics
    const orderStats = {
      totalOrders: 0,
      totalAmount: 0,
      byStatus: {}
    };

    stats.forEach(stat => {
      orderStats.totalOrders += stat.count;
      orderStats.totalAmount += stat.totalAmount;
      orderStats.byStatus[stat._id] = {
        count: stat.count,
        totalAmount: stat.totalAmount
      };
    });

    res.status(200).json({
        success: true,
      data: orderStats,
      message: 'Order statistics retrieved successfully'
      });

  } catch (error) {
    console.error('Error fetching order stats for Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order statistics',
      error: error.message
    });
  }
};

// POST: Tally can send ledger/outstanding data
export const syncLedgerData = async (req, res) => {
  try {
    const { companyId, ledgerData } = req.body;

    if (!companyId || !ledgerData) {
      return res.status(400).json({
        success: false,
        message: 'Company ID and ledger data are required'
      });
    }

    // Here you would typically save ledger data to a Ledger model
    // For now, we'll just acknowledge the receipt
    console.log('Received ledger data from Tally:', {
      companyId,
      dataCount: Array.isArray(ledgerData) ? ledgerData.length : 1,
      timestamp: new Date()
    });

    res.status(200).json({
      success: true,
      message: 'Ledger data received successfully',
      receivedAt: new Date(),
      dataCount: Array.isArray(ledgerData) ? ledgerData.length : 1
    });

  } catch (error) {
    console.error('Error syncing ledger data from Tally:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync ledger data',
      error: error.message
    });
  }
};