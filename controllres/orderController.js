import Order from '../models/order/orderModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';
import mongoose from 'mongoose';

// Create a new order
export const createOrder = async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      customerEmail,
      customerMobile,
      customerAddress,
      dealerId,
      dealerName,
      subDealerId,
      subDealerName,
      items,
      deliveryDate,
      priority,
      paymentMethod,
      notes,
      shippingAddress
    } = req.body;

    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const createdBy = req.user.userDetails._id;

    // Validate required fields - now customerName is required instead of customerId
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and items are required'
      });
    }

    // If customerId is provided and it's not a temp ID, verify customer exists
    let customer = null;
    if (customerId && customerId !== 'temp-customer') {
      try {
        customer = await User.findOne({
          _id: customerId,
          $or: [
            { defaultCompany: companyId },
            { 'companies.companyId': companyId }
          ]
        });
      } catch (error) {
        // If customerId is invalid ObjectId, treat as new customer
        console.log('Invalid customerId, treating as new customer:', customerId);
      }
    }

    // Validate and process items
    const processedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        companyId,
        isActive: true,
        isAvailable: true
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.productId} not found or not available`
        });
      }

      // Check stock availability
      if (!product.isInStock(item.quantity)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product ${product.productName}. Available: ${product.stock.current}`
        });
      }

      const unitPrice = product.sellingPrice;
      const itemTotal = item.quantity * unitPrice;
      const discount = item.discount || 0;
      const tax = item.tax || product.taxRate;

      processedItems.push({
        productId: product._id,
        productName: product.productName,
        productCode: product.productCode,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal,
        discount,
        tax
      });

      totalAmount += itemTotal;
    }

    // Generate order number
    const orderNumber = await Order.generateOrderNumber(companyId);

    // Create order
    const order = new Order({
      orderNumber,
      companyId,
      customerId: customer ? customer._id : null, // Only set if we have a valid customer
      customerName: customerName || (customer ? customer.name : 'Unknown Customer'),
      customerEmail: customerEmail || (customer ? customer.email : ''),
      customerMobile: customerMobile || (customer ? customer.mobile : ''),
      customerAddress: customerAddress || (customer ? customer.address : {}),
      dealerId: dealerId || customerId, // Use dealerId if provided, fallback to customerId
      dealerName: dealerName || customerName,
      subDealerId: subDealerId || null,
      subDealerName: subDealerName || null,
      items: processedItems,
      deliveryDate,
      priority: priority || 'medium',
      paymentMethod: paymentMethod || 'cash',
      notes,
      shippingAddress: shippingAddress || customerAddress,
      createdBy,
      totalAmount,
      finalAmount: totalAmount
    });

    // Calculate totals
    order.calculateTotals();

    // Save order
    await order.save();

    // Update product stock
    for (const item of items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { 'stock.current': -item.quantity } }
      );
    }

    // Populate order details
    await order.populate([
      { path: 'customerId', select: 'name email mobile' },
      { path: 'createdBy', select: 'name role' },
      { path: 'companyId', select: 'companyName companyCode' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all orders for a company
export const getOrders = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const {
      page = 1,
      limit = 10,
      status,
      customerId,
      startDate,
      endDate,
      search,
      orderType,
      createdBy // Filter by createdBy (user ID)
    } = req.query;

    const filter = { companyId, isActive: true };

    // Apply filters
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (orderType) filter.orderType = orderType; // Filter by orderType (e.g., 'zonal_created', 'admin_created')
    if (createdBy) {
      // Convert to ObjectId if it's a string
      try {
        filter.createdBy = mongoose.Types.ObjectId.isValid(createdBy) 
          ? new mongoose.Types.ObjectId(createdBy) 
          : createdBy;
      } catch (error) {
        console.error('Error converting createdBy to ObjectId:', error);
      }
    }
    if (startDate || endDate) {
      filter.orderDate = {};
      if (startDate) filter.orderDate.$gte = new Date(startDate);
      if (endDate) filter.orderDate.$lte = new Date(endDate);
    }
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('customerId', 'name email mobile role')
      .populate('dealerId', 'name email mobile role')
      .populate('subDealerId', 'name email mobile role address')
      .populate('createdBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('items.productId', 'productName productCode sellingPrice specifications')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(filter);

    // Calculate order statistics using the same filter
    const statsMatch = { ...filter }; 
    
    // Convert createdBy to ObjectId if it's a string (for aggregation pipeline)
    if (statsMatch.createdBy && typeof statsMatch.createdBy === 'string') {
      try {
        statsMatch.createdBy = new mongoose.Types.ObjectId(statsMatch.createdBy);
      } catch (error) {
        console.error('Error converting createdBy to ObjectId:', error);
        // If conversion fails, remove it from filter
        delete statsMatch.createdBy;
      }
    }
    
    const statsPipeline = [
      { $match: statsMatch },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' },
          draftOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'draft'] }, 1, 0]
            }
          },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending_approval'] }, 1, 0]
            }
          },
          confirmedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'approved'] }, 1, 0]
            }
          },
          processingOrders: {
            $sum: {
              $cond: [{ $in: ['$status', ['sent_to_tally']] }, 1, 0]
            }
          },
          shippedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'dispatched'] }, 1, 0]
            }
          },
          deliveredOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0]
            }
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0]
            }
          }
        }
      }
    ];

    const statsResult = await Order.aggregate(statsPipeline);
    const stats = statsResult.length > 0 ? statsResult[0] : {
      totalOrders: 0,
      totalAmount: 0,
      draftOrders: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0
    };

    res.json({
      success: true,
      orders,
      stats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNext: page < Math.ceil(totalOrders / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get order by ID
export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const order = await Order.findOne({
      _id: orderId,
      companyId,
      isActive: true
    })
      .populate('customerId', 'name email mobile role address')
      .populate('dealerId', 'name email mobile role address')
      .populate('subDealerId', 'name email mobile role address')
      .populate('createdBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('items.productId', 'productName productCode sellingPrice specifications description category brand');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      order
    });

  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;

    const validStatuses = ['draft', 'pending_approval', 'approved', 'sent_to_tally', 'dispatched', 'delivered', 'cancelled', 'returned'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      companyId,
      isActive: true
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // If approving the order
    if (status === 'approved' && (order.status === 'draft' || order.status === 'pending_approval')) {
      order.approvedBy = userId;
      order.approvedAt = new Date();
    }

    order.status = status;
    if (notes) order.notes = notes;
    order.updatedAt = new Date();

    await order.save();

    res.json({
      success: true,
      message: 'Order status updated successfully',
      order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update order
export const updateOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateData = req.body;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Remove fields that shouldn't be updated directly
    delete updateData.orderNumber;
    delete updateData.companyId;
    delete updateData.createdBy;
    delete updateData.createdAt;

    // Process items to ensure totalPrice is calculated correctly
    if (updateData.items && Array.isArray(updateData.items)) {
      updateData.items = updateData.items.map(item => {
        const quantity = item.quantity || 0;
        const unitPrice = item.unitPrice || item.price || 0;
        const totalPrice = quantity * unitPrice;
        
        return {
          ...item,
          unitPrice: unitPrice,
          quantity: quantity,
          totalPrice: totalPrice, // Ensure totalPrice is calculated
          // Keep other fields as they are
          productId: item.productId,
          productCode: item.productCode,
          productName: item.productName,
          unit: item.unit,
          discount: item.discount || 0,
          tax: item.tax || 0
        };
      });
    }

    const order = await Order.findOneAndUpdate(
      { _id: orderId, companyId, isActive: true },
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    )
      .populate('customerId', 'name email mobile')
      .populate('createdBy', 'name role');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      order
    });

  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete order (soft delete)
export const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const order = await Order.findOneAndUpdate(
      { _id: orderId, companyId, isActive: true },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { 'stock.current': item.quantity } }
      );
    }

    res.json({
      success: true,
      message: 'Order deleted successfully'
    });

  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get order statistics
export const getOrderStats = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { startDate, endDate } = req.query;

    const filter = { companyId, isActive: true };
    
    if (startDate || endDate) {
      filter.orderDate = {};
      if (startDate) filter.orderDate.$gte = new Date(startDate);
      if (endDate) filter.orderDate.$lte = new Date(endDate);
    }

    const stats = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: '$finalAmount' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          confirmedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'shipped'] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          }
        }
      }
    ]);

    const result = stats[0] || {
      totalOrders: 0,
      totalAmount: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      processingOrders: 0,
      shippedOrders: 0,
      deliveredOrders: 0,
      cancelledOrders: 0
    };

    res.json({
      success: true,
      stats: result
    });

  } catch (error) {
    console.error('Get order stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
