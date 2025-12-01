import Order from '../models/order/orderModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';
import mongoose from 'mongoose';

const DEFAULT_GST_RATE = 18;

const normalizePaymentMethod = (value) => {
  if (!value) {
    return 'other';
  }

  const normalized = value.toString().trim().toLowerCase();

  switch (normalized) {
    case 'cash':
      return 'cash';
    case 'cheque':
    case 'check':
      return 'cheque';
    case 'bank transfer':
    case 'bank_transfer':
    case 'bank-transfer':
    case 'neft':
    case 'rtgs':
      return 'bank_transfer';
    case 'upi':
      return 'upi';
    case 'credit card':
    case 'debit card':
    case 'card':
    case 'card payment':
    case 'card-payment':
      return 'card';
    case 'credit':
      return 'credit';
    default:
      return 'other';
  }
};

const extractState = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    return value.trim();
  }
  return value.state ? String(value.state).trim() : '';
};

const normalizeState = (value) => extractState(value).toLowerCase();

const determineGstType = (sellerState, buyerState) => {
  if (!sellerState || !buyerState) {
    return 'UNKNOWN';
  }
  return normalizeState(sellerState) === normalizeState(buyerState)
    ? 'INTRA_STATE'
    : 'INTER_STATE';
};

const safeNumber = (value, fallback = 0) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }
  if (value === null || value === undefined) {
    return fallback;
  }
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const computeGstComponents = ({
  quantity,
  unitPrice,
  discountPercent,
  gstRate,
  gstType
}) => {
  const qty = safeNumber(quantity, 0);
  const price = safeNumber(unitPrice, 0);
  const discountRate = safeNumber(discountPercent, 0);
  const normalizedGstRate = Math.max(0, safeNumber(gstRate, DEFAULT_GST_RATE));

  const baseAmount = qty * price;
  const discountAmount = (baseAmount * discountRate) / 100;
  const taxableValue = Math.max(0, baseAmount - discountAmount);

  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;

  if (gstType === 'INTRA_STATE') {
    cgstRate = normalizedGstRate / 2;
    sgstRate = normalizedGstRate / 2;
  } else if (gstType === 'INTER_STATE') {
    igstRate = normalizedGstRate;
  } else {
    // Unknown tax type - fall back to IGST for safe handling
    igstRate = normalizedGstRate;
  }

  const cgstAmount = (taxableValue * cgstRate) / 100;
  const sgstAmount = (taxableValue * sgstRate) / 100;
  const igstAmount = (taxableValue * igstRate) / 100;
  const totalTaxAmount = cgstAmount + sgstAmount + igstAmount;
  const lineTotal = taxableValue + totalTaxAmount;

  return {
    gstRate: normalizedGstRate,
    baseAmount,
    discountAmount,
    taxableValue,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    totalTaxAmount,
    lineTotal
  };
};

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
      shippingAddress,
      mode,
      modeSelection,
      customMode,
      termsOfPayment,
      otherReference,
      termsOfDelivery1,
      termsOfDelivery2
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

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for the current user'
      });
    }

    let dealerDoc = null;
    let subDealerDoc = null;

    if (dealerId) {
      dealerDoc = await User.findById(dealerId).lean();
    }

    if (subDealerId) {
      subDealerDoc = await User.findById(subDealerId).lean();
    }

    const sellerState =
      extractState(company.companyState) ||
      extractState(company?.contactDetails?.address?.state);

    const buyerState =
      extractState(shippingAddress?.state) ||
      extractState(customerAddress?.state) ||
      extractState(customer?.address?.state) ||
      extractState(subDealerDoc?.address?.state) ||
      extractState(dealerDoc?.address?.state);

    const gstType = determineGstType(sellerState, buyerState);

    // Validate and process items with GST calculations
    const processedItems = [];
    let grossAmountTotal = 0;
    let discountTotal = 0;
    let taxableValueTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    let taxAmountTotal = 0;

    for (const item of items) {
      const product = await Product.findOne({
        _id: item.productId,
        companyId,
        isActive: true
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.productId} not found or not available`
        });
      }

      const unitPrice = product.sellingPrice;
      const discountPercent = item.discount || 0;
      const gstRateInput = item.gstRate !== undefined ? item.gstRate : product.gstRate;

      const taxDetails = computeGstComponents({
        quantity: item.quantity,
        unitPrice,
        discountPercent,
        gstRate: gstRateInput,
        gstType
      });

      processedItems.push({
        productId: product._id,
        productName: product.productName,
        productCode: product.productCode,
        quantity: item.quantity,
        unitPrice,
        discount: discountPercent,
        tax: taxDetails.gstRate,
        gstRate: taxDetails.gstRate,
        taxType: gstType,
        taxableValue: taxDetails.taxableValue,
        cgstRate: taxDetails.cgstRate,
        cgstAmount: taxDetails.cgstAmount,
        sgstRate: taxDetails.sgstRate,
        sgstAmount: taxDetails.sgstAmount,
        igstRate: taxDetails.igstRate,
        igstAmount: taxDetails.igstAmount,
        totalTaxAmount: taxDetails.totalTaxAmount,
        totalPrice: taxDetails.lineTotal
      });

      grossAmountTotal += taxDetails.baseAmount;
      discountTotal += taxDetails.discountAmount;
      taxableValueTotal += taxDetails.taxableValue;
      cgstTotal += taxDetails.cgstAmount;
      sgstTotal += taxDetails.sgstAmount;
      igstTotal += taxDetails.igstAmount;
      taxAmountTotal += taxDetails.totalTaxAmount;
    }

    // Determine payment information
    const resolvedModeSelectionRaw = (modeSelection || paymentMethod || mode || '').toString().trim();
    const resolvedModeSelection = resolvedModeSelectionRaw || '';
    const resolvedMode =
      modeSelection === 'Other'
        ? (mode || customMode || 'Other')
        : (mode || resolvedModeSelection || '');
    const normalizedPaymentMethod = normalizePaymentMethod(resolvedModeSelection || resolvedMode || paymentMethod);
    const sanitizedTermsOfPayment = termsOfPayment || '';
    const sanitizedOtherReference = otherReference || '';
    const sanitizedTermsOfDelivery1 = termsOfDelivery1 || '';
    const sanitizedTermsOfDelivery2 = termsOfDelivery2 || '';

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
      paymentMethod: normalizedPaymentMethod || 'cash',
      modeSelection: resolvedModeSelection || null,
      mode: resolvedMode || null,
      termsOfPayment: sanitizedTermsOfPayment,
      otherReference: sanitizedOtherReference,
      termsOfDelivery1: sanitizedTermsOfDelivery1,
      termsOfDelivery2: sanitizedTermsOfDelivery2,
      notes,
      shippingAddress: shippingAddress || customerAddress,
      createdBy,
      totalAmount: grossAmountTotal,
      discountAmount: discountTotal,
      taxAmount: taxAmountTotal,
      taxableValueTotal,
      cgstTotal,
      sgstTotal,
      igstTotal,
      finalAmount: taxableValueTotal + taxAmountTotal,
      sellerState,
      buyerState,
      gstType
    });

    // Calculate totals to ensure consistency
    order.calculateTotals();

    // Save order
    await order.save();

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
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const updateData = { ...req.body };

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID'
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

    const company = await Company.findById(companyId).lean();
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for the current user'
      });
    }

    // Handle payment mode normalization
    if (updateData.customMode !== undefined) {
      if (updateData.modeSelection === 'Other' && !updateData.mode) {
        updateData.mode = updateData.customMode;
      }
      delete updateData.customMode;
    }

    const resolvedModeSelectionRaw = (
      updateData.modeSelection ??
      updateData.paymentMethod ??
      updateData.mode ??
      order.modeSelection ??
      order.mode ??
      order.paymentMethod ??
      ''
    ).toString().trim();
    const resolvedModeSelection = resolvedModeSelectionRaw || '';
    let resolvedMode = updateData.mode ?? order.mode ?? '';
    if ((updateData.modeSelection ?? order.modeSelection) === 'Other') {
      resolvedMode = updateData.mode || updateData.modeSelection || order.mode || '';
    }
    const normalizedPaymentMethod = normalizePaymentMethod(
      resolvedModeSelection || resolvedMode || updateData.paymentMethod || order.paymentMethod
    );

    // Determine customer/dealer/sub-dealer details
    const nextCustomerId = updateData.customerId ?? order.customerId;
    let customer = null;
    if (nextCustomerId) {
      try {
        customer = await User.findOne({
          _id: nextCustomerId,
          $or: [
            { defaultCompany: companyId },
            { 'companies.companyId': companyId }
          ]
        }).lean();
      } catch (error) {
        console.log('updateOrder - invalid customerId:', nextCustomerId);
      }
    }

    const dealerId = updateData.dealerId ?? order.dealerId;
    const subDealerId = updateData.subDealerId ?? order.subDealerId;

    const dealerDoc = dealerId ? await User.findById(dealerId).lean() : null;
    const subDealerDoc = subDealerId ? await User.findById(subDealerId).lean() : null;

    const customerAddress =
      updateData.customerAddress ??
      (customer ? customer.address : null) ??
      order.customerAddress ??
      {};

    const shippingAddress =
      updateData.shippingAddress ??
      order.shippingAddress ??
      customerAddress;

    const sellerState =
      extractState(company.companyState) ||
      extractState(company?.contactDetails?.address?.state);

    const buyerState =
      extractState(shippingAddress?.state) ||
      extractState(customerAddress?.state) ||
      extractState(customer?.address?.state) ||
      extractState(subDealerDoc?.address?.state) ||
      extractState(dealerDoc?.address?.state);

    const gstType = determineGstType(sellerState, buyerState);

    const rawItems = (updateData.items && Array.isArray(updateData.items))
      ? updateData.items
      : order.items.map(item => (typeof item.toObject === 'function' ? item.toObject() : item));

    if (!rawItems || rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item'
      });
    }

    const productIds = [
      ...new Set(
        rawItems
          .map(item => item.productId)
          .filter(Boolean)
          .map(id => (typeof id === 'object' ? id.toString() : id))
      )
    ];

    const products = productIds.length
      ? await Product.find({
          _id: { $in: productIds },
          companyId
        }).lean()
      : [];

    const productMap = new Map(products.map(prod => [prod._id.toString(), prod]));

    const processedItems = [];
    let grossAmountTotal = 0;
    let discountTotal = 0;
    let taxableValueTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    let taxAmountTotal = 0;

    for (const item of rawItems) {
      const productId =
        typeof item.productId === 'object' && item.productId !== null
          ? item.productId.toString()
          : item.productId;

      const productDoc = productMap.get(productId || '') || null;
      const quantity = safeNumber(item.quantity, 0);
      if (quantity <= 0) {
        continue;
      }

      const unitPrice = safeNumber(
        item.unitPrice ?? item.price,
        productDoc?.sellingPrice ?? productDoc?.price ?? 0
      );
      const discountPercent = safeNumber(item.discount, 0);
      const gstRateInput =
        item.gstRate !== undefined
          ? item.gstRate
          : productDoc?.gstRate ?? DEFAULT_GST_RATE;

      const taxDetails = computeGstComponents({
        quantity,
        unitPrice,
        discountPercent,
        gstRate: gstRateInput,
        gstType
      });

      processedItems.push({
        productId: productId,
        productName: item.productName || productDoc?.productName || '',
        productCode: item.productCode || productDoc?.productCode || '',
        quantity,
        unitPrice,
        discount: discountPercent,
        tax: taxDetails.gstRate,
        gstRate: taxDetails.gstRate,
        taxType: gstType,
        taxableValue: taxDetails.taxableValue,
        cgstRate: taxDetails.cgstRate,
        cgstAmount: taxDetails.cgstAmount,
        sgstRate: taxDetails.sgstRate,
        sgstAmount: taxDetails.sgstAmount,
        igstRate: taxDetails.igstRate,
        igstAmount: taxDetails.igstAmount,
        totalTaxAmount: taxDetails.totalTaxAmount,
        totalPrice: taxDetails.lineTotal
      });

      grossAmountTotal += taxDetails.baseAmount;
      discountTotal += taxDetails.discountAmount;
      taxableValueTotal += taxDetails.taxableValue;
      cgstTotal += taxDetails.cgstAmount;
      sgstTotal += taxDetails.sgstAmount;
      igstTotal += taxDetails.igstAmount;
      taxAmountTotal += taxDetails.totalTaxAmount;
    }

    if (processedItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item with valid quantity'
      });
    }

    // Update order fields
    order.customerId = customer ? customer._id : nextCustomerId || null;
    order.customerName = updateData.customerName ?? (customer ? customer.name : order.customerName);
    order.customerEmail = updateData.customerEmail ?? (customer ? customer.email : order.customerEmail);
    order.customerMobile = updateData.customerMobile ?? (customer ? customer.mobile : order.customerMobile);
    order.customerAddress = customerAddress || {};
    order.dealerId = dealerId || null;
    order.dealerName = updateData.dealerName ?? (dealerDoc ? dealerDoc.name : order.dealerName);
    order.subDealerId = subDealerId || null;
    order.subDealerName = updateData.subDealerName ?? (subDealerDoc ? subDealerDoc.name : order.subDealerName);
    order.items = processedItems;
    order.deliveryDate = updateData.deliveryDate ?? order.deliveryDate;
    order.priority = updateData.priority ?? order.priority;
    order.paymentMethod = normalizedPaymentMethod;
    order.modeSelection = updateData.modeSelection ?? order.modeSelection ?? null;
    order.mode = resolvedMode || null;
    order.termsOfPayment = updateData.termsOfPayment ?? order.termsOfPayment;
    order.otherReference = updateData.otherReference ?? order.otherReference;
    order.termsOfDelivery1 = updateData.termsOfDelivery1 ?? order.termsOfDelivery1;
    order.termsOfDelivery2 = updateData.termsOfDelivery2 ?? order.termsOfDelivery2;
    order.notes = updateData.notes ?? order.notes;
    order.shippingAddress = shippingAddress || {};
    order.status = updateData.status ?? order.status;
    order.taxableValueTotal = taxableValueTotal;
    order.totalAmount = grossAmountTotal;
    order.discountAmount = discountTotal;
    order.taxAmount = taxAmountTotal;
    order.cgstTotal = cgstTotal;
    order.sgstTotal = sgstTotal;
    order.igstTotal = igstTotal;
    order.finalAmount = taxableValueTotal + taxAmountTotal;
    order.sellerState = sellerState;
    order.buyerState = buyerState;
    order.gstType = gstType;
    order.updatedAt = new Date();

    order.calculateTotals();
    await order.save();

    await order.populate([
      { path: 'customerId', select: 'name email mobile' },
      { path: 'createdBy', select: 'name role' },
      { path: 'companyId', select: 'companyName companyCode' }
    ]);

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
