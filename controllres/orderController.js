import Order from '../models/order/orderModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';

// Create a new order
export const createOrder = async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      customerEmail,
      customerMobile,
      customerAddress,
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
      search
    } = req.query;

    const filter = { companyId, isActive: true };

    // Apply filters
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
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
      .populate('createdBy', 'name role')
      .populate('approvedBy', 'name role')
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalOrders = await Order.countDocuments(filter);

    res.json({
      success: true,
      orders,
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
      .populate('createdBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('items.productId', 'productName productCode price specifications');

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

    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    
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
    if (status === 'confirmed' && order.status === 'pending') {
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
