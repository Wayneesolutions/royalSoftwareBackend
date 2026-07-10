import Order from '../models/order/orderModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import SubDealer from '../models/subdealer/subdealerModel.js';
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
      isManualShippingAddress,
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
    const creatorRole = req.user.userDetails.role || '';
    // 'sale' = created by company-side staff (admin/groupuser/zonal/rsm/asm/salesman)
    // 'purchase' = created by a buyer-side user (dealer/distributor/subdealer)
    const orderCategory = ['dealers', 'distibutors', 'distributor', 'subdealer'].includes(creatorRole)
      ? 'purchase'
      : 'sale';

    // Validate required fields - now customerName is required instead of customerId
    if (!customerName || !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and items are required'
      });
    }

    // If customerId is provided and it's not a temp ID, verify customer exists
    // Check Ledger model first (for dealers), then User model (for backward compatibility)
    let customer = null;
    if (customerId && customerId !== 'temp-customer') {
      try {
        // Try to find in Ledger model first (dealers)
        customer = await Ledger.findById(customerId).lean();
        if (!customer) {
          // Fallback to User model for backward compatibility
          customer = await User.findOne({
            _id: customerId,
            $or: [
              { defaultCompany: companyId },
              { 'companies.companyId': companyId }
            ]
          }).lean();
        }
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
      // Try to find dealer in Ledger table first
      dealerDoc = await Ledger.findById(dealerId).lean();
      // If not found in Ledger, fallback to User (for backward compatibility)
      if (!dealerDoc) {
        dealerDoc = await User.findById(dealerId).lean();
      }
    }

    if (subDealerId) {
      // Try to find subdealer in SubDealer table first
      subDealerDoc = await SubDealer.findById(subDealerId).lean();
      // If not found in SubDealer, fallback to User (for backward compatibility)
      if (!subDealerDoc) {
        subDealerDoc = await User.findById(subDealerId).lean();
      }
    }

    const sellerState =
      extractState(company.companyState) ||
      extractState(company?.contactDetails?.address?.state);

    // Determine shipping address for buyer state calculation
    // Priority: manual shipping address > subdealer address > dealer address > customer address
    const finalShippingAddress = isManualShippingAddress && shippingAddress
      ? shippingAddress
      : (shippingAddress || 
         (subDealerDoc?.address || subDealerDoc) ||
         (dealerDoc?.address || dealerDoc) ||
         customerAddress ||
         customer?.address ||
         {});

    const buyerState =
      extractState(finalShippingAddress?.state) ||
      extractState(shippingAddress?.state) ||
      extractState(customerAddress?.state) ||
      extractState(customer?.address?.state) ||
      extractState(subDealerDoc?.SDState || subDealerDoc?.address?.state) ||
      extractState(dealerDoc?.LedgerState || dealerDoc?.address?.state);

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
    // Use provided IDs directly - they may be from Ledger/SubDealer models
    const finalCustomerId = customerId || (customer ? customer._id : null);
    const finalDealerId = dealerId || finalCustomerId; // Use dealerId if provided, fallback to customerId
    const finalSubDealerId = subDealerId || null;
    
    const order = new Order({
      orderNumber,
      companyId,
      orderCategory,
      customerId: finalCustomerId, // Use provided customerId (from Ledger) or customer._id (from User)
      customerName: customerName || (customer ? customer.name : 'Unknown Customer'),
      customerEmail: customerEmail || (customer ? customer.email : ''),
      customerMobile: customerMobile || (customer ? customer.mobile : ''),
      customerAddress: customerAddress || (customer ? customer.address : {}),
      dealerId: finalDealerId, // Use dealerId if provided, fallback to customerId
      dealerName: dealerName || customerName,
      subDealerId: finalSubDealerId,
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
      shippingAddress: finalShippingAddress || shippingAddress || customerAddress,
      isManualShippingAddress: isManualShippingAddress || false,
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

// Helper function to get all child user IDs recursively (including nested children)
const getAllChildUserIdsForOrders = async (parentUserId, companyId) => {
  const childUserIds = [];
  
  // Get direct children
  const directChildren = await User.find({
    'hierarchy.parentUserId': parentUserId,
    'companies.companyId': companyId,
    'companies.isActive': true,
    isActive: true
  }).select('_id');
  
  const directChildIds = directChildren.map(child => child._id.toString());
  childUserIds.push(...directChildIds);
  
  // Recursively get children of children
  for (const childId of directChildIds) {
    const nestedChildren = await getAllChildUserIdsForOrders(childId, companyId);
    childUserIds.push(...nestedChildren);
  }
  
  // Remove duplicates
  return [...new Set(childUserIds)];
};

// Get all orders for a company
export const getOrders = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.userDetails.role;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const {
      page = 1,
      limit = 10,
      status,
      customerId,
      dealerId, // Filter by dealerId (for received orders)
      startDate,
      endDate,
      search,
      orderType,
      orderCategory, // 'sale' | 'purchase'
      sortBy = 'orderDate', // 'orderDate' | 'finalAmount' | 'orderNumber'
      createdBy // Filter by createdBy (user ID)
    } = req.query;

    const filter = { companyId, isActive: true };

    // Apply hierarchy-based filtering for createdBy
    // If user is not admin/superadmin, only show orders created by their child users
    // EXCEPTION: If dealerId filter is set and matches current user, allow orders created by anyone
    // (This allows dealers to see orders assigned to them, even if created by admin/group users)
    if (userRole !== 'admin' && userRole !== 'superadmin') {
      // Check if this is a dealer querying for orders assigned to them (received orders)
      // Convert both to strings for comparison to handle ObjectId/string differences
      const dealerIdStr = dealerId ? dealerId.toString() : null;
      const userIdStr = userId.toString();
      const isDealerQueryingAssignedOrders = dealerIdStr && dealerIdStr === userIdStr;
      
      // For group users — own orders + assigned dealers + their subdealers (NOT other groupusers)
      if (userRole === 'groupuser') {
        const currentUser = await User.findById(userId)
          .select('groups assignedDealerIds')
          .lean();

        // ── 1. Dealers via direct assignment (assignedDealerIds) ──────────────
        const directDealerIds = (currentUser?.assignedDealerIds || []).map(id => id.toString());

        // ── 2. Dealers via Tally group membership ────────────────────────────
        let groupDealerIds = [];
        let groupSubdealerIds = [];

        const activeGroupIds = (currentUser?.groups || [])
          .filter(g => g.isActive && g.groupId)
          .map(g => (typeof g.groupId === 'object' && g.groupId._id ? g.groupId._id : g.groupId))
          .filter(Boolean);

        if (activeGroupIds.length > 0) {
          const dealersInGroup = await Ledger.find({
            groupId: { $in: activeGroupIds },
            isActive: true
          }).select('_id').lean();
          groupDealerIds = dealersInGroup.map(d => d._id.toString());

          const subdealersInGroup = await SubDealer.find({
            groupId: { $in: activeGroupIds },
            isActive: true
          }).select('_id').lean();
          groupSubdealerIds = subdealersInGroup.map(s => s._id.toString());
        }

        // ── 3. Merge dealer IDs from both sources ────────────────────────────
        const allDealerIds = [...new Set([...directDealerIds, ...groupDealerIds])];

        // ── 4. Subdealers for directly-assigned dealers (by dealerId field) ──
        if (directDealerIds.length > 0) {
          const subdealersOfDirect = await SubDealer.find({
            dealerId: { $in: directDealerIds.map(id => new mongoose.Types.ObjectId(id)) },
            isActive: true
          }).select('_id').lean();
          subdealersOfDirect.forEach(s => groupSubdealerIds.push(s._id.toString()));
        }

        const allSubdealerIds = [...new Set(groupSubdealerIds)];

        // ── 5. Build filter ──────────────────────────────────────────────────
        const allowedIds = [userIdStr, ...allDealerIds, ...allSubdealerIds];

        console.log('🔍 groupuser visible IDs — self:1 dealers:', allDealerIds.length, 'subdealers:', allSubdealerIds.length);

        if (allDealerIds.length > 0 || allSubdealerIds.length > 0) {
          const orderConditions = [
            { createdBy: { $in: allowedIds.map(id => new mongoose.Types.ObjectId(id)) } },
            { dealerId: { $in: allDealerIds.map(id => new mongoose.Types.ObjectId(id)) } },
            { customerId: { $in: allDealerIds.map(id => new mongoose.Types.ObjectId(id)) } },
            { subDealerId: { $in: allSubdealerIds.map(id => new mongoose.Types.ObjectId(id)) } }
          ];

          if (createdBy) {
            if (!allowedIds.includes(createdBy.toString())) {
              return res.json({
                success: true,
                orders: [],
                pagination: { currentPage: parseInt(page), totalPages: 0, totalOrders: 0, hasNext: false, hasPrev: false },
                stats: { totalOrders: 0, totalAmount: 0, pendingOrders: 0, completedOrders: 0 }
              });
            }
            filter.createdBy = mongoose.Types.ObjectId.isValid(createdBy)
              ? new mongoose.Types.ObjectId(createdBy)
              : createdBy;
          } else {
            filter.$or = orderConditions;
          }
        } else {
          // No dealers assigned — show own orders only
          console.log('ℹ️ groupuser has no dealers assigned, showing own orders only');
          filter.createdBy = new mongoose.Types.ObjectId(userIdStr);
        }
      } else if (!isDealerQueryingAssignedOrders) {
        // For other non-admin roles, use hierarchy-based filtering
        // Get all child user IDs
        const childUserIds = await getAllChildUserIdsForOrders(userId, companyId);
        
        // Include the current user's own orders
        const allowedUserIds = [userId.toString(), ...childUserIds];
        
        // If createdBy is specified, check if it's in the allowed list
        if (createdBy) {
          const createdById = createdBy.toString();
          if (!allowedUserIds.includes(createdById)) {
            // User doesn't have access to this user's orders
            return res.json({
              success: true,
              orders: [],
              pagination: {
                currentPage: parseInt(page),
                totalPages: 0,
                totalOrders: 0,
                hasNext: false,
                hasPrev: false
              },
              stats: {
                totalOrders: 0,
                totalAmount: 0,
                pendingOrders: 0,
                completedOrders: 0
              }
            });
          }
          filter.createdBy = mongoose.Types.ObjectId.isValid(createdBy) 
            ? new mongoose.Types.ObjectId(createdBy) 
            : createdBy;
        } else {
          // Filter to only show orders created by the user or their children
          filter.createdBy = { $in: allowedUserIds.map(id => new mongoose.Types.ObjectId(id)) };
        }
      }
      // If isDealerQueryingAssignedOrders is true, don't filter by createdBy
      // This allows dealers to see orders assigned to them regardless of who created them
    } else {
      // Admin and superadmin can see all orders, but if createdBy is specified, use it
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
    }

    // Apply other filters
    if (status) filter.status = status;
    if (customerId) filter.customerId = customerId;
    if (orderType) filter.orderType = orderType; // Filter by orderType (e.g., 'zonal_created', 'admin_created')
    if (orderCategory) filter.orderCategory = orderCategory; // 'sale' | 'purchase'
    if (startDate || endDate) {
      filter.orderDate = {};
      if (startDate) filter.orderDate.$gte = new Date(startDate);
      if (endDate) filter.orderDate.$lte = new Date(endDate);
    }
    
    // Handle search filter first (before dealerId to avoid conflicts)
    const searchConditions = [];
    if (search) {
      searchConditions.push(
        { orderNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } }
      );
    }
    
    // Handle dealerId filter - check both dealerId and customerId
    const dealerConditions = [];
    if (dealerId) {
      // Filter by dealerId - used for received orders where dealer is assigned
      // Also check customerId in case dealerId wasn't explicitly set (falls back to customerId)
      // The dealerId could be from either User or Ledger model, so we need to match the ID directly
      const dealerIdObj = mongoose.Types.ObjectId.isValid(dealerId) 
        ? new mongoose.Types.ObjectId(dealerId) 
        : dealerId;
      
      dealerConditions.push(
        { dealerId: dealerIdObj },
        { customerId: dealerIdObj }
      );
      
      console.log('🔍 Filtering orders for dealerId:', dealerIdObj.toString());
    }
    
    // Combine search and dealer conditions using $and if both exist
    // Also handle group filter ($or) if it exists
    if (filter.$or) {
      // Group filter already set - need to combine with search/dealer filters
      const groupConditions = filter.$or;
      delete filter.$or; // Remove from filter to rebuild with $and
      
      const combinedConditions = [];
      
      // Add group conditions
      combinedConditions.push({ $or: groupConditions });
      
      // Add search conditions if they exist
      if (searchConditions.length > 0) {
        combinedConditions.push({ $or: searchConditions });
      }
      
      // Add dealer conditions if they exist
      if (dealerConditions.length > 0) {
        combinedConditions.push({ $or: dealerConditions });
      }
      
      // Use $and to combine all conditions
      if (combinedConditions.length > 1) {
        filter.$and = combinedConditions;
      } else if (combinedConditions.length === 1) {
        // Only one condition, use it directly
        Object.assign(filter, combinedConditions[0]);
      }
    } else if (searchConditions.length > 0 && dealerConditions.length > 0) {
      // Both search and dealer filter - use $and to combine
      filter.$and = [
        { $or: searchConditions },
        { $or: dealerConditions }
      ];
    } else if (searchConditions.length > 0) {
      // Only search
      filter.$or = searchConditions;
    } else if (dealerConditions.length > 0) {
      // Only dealer filter
      filter.$or = dealerConditions;
    }

    const skip = (page - 1) * limit;

    // Fetch orders without populate first, then manually populate from Ledger/SubDealer models
    // This is because dealers are stored in Ledger model, not User model
    // Build sort object from sortBy param
    const sortMap = {
      orderDate: { orderDate: -1 },
      finalAmount: { finalAmount: -1 },
      orderNumber: { orderNumber: 1 },
    };
    const sortObj = sortMap[sortBy] || { orderDate: -1 };

    let orders = await Order.find(filter)
      .populate('createdBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('items.productId', 'productName productCode sellingPrice specifications')
      .sort(sortObj)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean() for better performance

    // Manually populate dealerId, customerId, and subDealerId from Ledger/SubDealer models
    // Prioritize Ledger model over User model since dealers are stored in Ledger
    for (const order of orders) {
      // Populate dealerId from Ledger model (primary source for dealers)
      if (order.dealerId) {
        const dealerId = typeof order.dealerId === 'object' ? order.dealerId._id : order.dealerId;
        if (dealerId) {
          try {
            // Try Ledger model first (dealers are stored here)
            const ledgerDealer = await Ledger.findById(dealerId).lean();
            if (ledgerDealer) {
              order.dealerId = {
                _id: ledgerDealer._id,
                name: ledgerDealer.LedgerName,
                email: ledgerDealer.Email || '',
                mobile: ledgerDealer.LedgerMobile || '',
                role: 'dealer'
              };
            } else {
              // Fallback to User model if not found in Ledger
              const userDealer = await User.findById(dealerId).select('name email mobile role').lean();
              if (userDealer) {
                order.dealerId = {
                  _id: userDealer._id,
                  name: userDealer.name,
                  email: userDealer.email || '',
                  mobile: userDealer.mobile || '',
                  role: userDealer.role || 'dealer'
                };
              } else {
                // Keep as is if not found in either model
                order.dealerId = typeof order.dealerId === 'object' ? order.dealerId : { _id: dealerId };
              }
            }
          } catch (error) {
            console.error('Error populating dealerId:', error);
          }
        }
      }
      
      // Populate customerId from Ledger model (primary source for dealers)
      if (order.customerId) {
        const customerId = typeof order.customerId === 'object' ? order.customerId._id : order.customerId;
        if (customerId) {
          try {
            // Try Ledger model first (dealers are stored here)
            const ledgerCustomer = await Ledger.findById(customerId).lean();
            if (ledgerCustomer) {
              order.customerId = {
                _id: ledgerCustomer._id,
                name: ledgerCustomer.LedgerName,
                email: ledgerCustomer.Email || '',
                mobile: ledgerCustomer.LedgerMobile || '',
                role: 'dealer'
              };
            } else {
              // Fallback to User model if not found in Ledger
              const userCustomer = await User.findById(customerId).select('name email mobile role').lean();
              if (userCustomer) {
                order.customerId = {
                  _id: userCustomer._id,
                  name: userCustomer.name,
                  email: userCustomer.email || '',
                  mobile: userCustomer.mobile || '',
                  role: userCustomer.role || 'dealer'
                };
              } else {
                // Keep as is if not found in either model
                order.customerId = typeof order.customerId === 'object' ? order.customerId : { _id: customerId };
              }
            }
          } catch (error) {
            console.error('Error populating customerId:', error);
          }
        }
      }
      
      // Populate subDealerId from SubDealer model
      if (order.subDealerId) {
        const subDealerId = typeof order.subDealerId === 'object' ? order.subDealerId._id : order.subDealerId;
        if (subDealerId) {
          try {
            // Try SubDealer model first
            const subDealer = await SubDealer.findById(subDealerId).lean();
            if (subDealer) {
              // Map SubDealer model fields properly
              order.subDealerId = {
                _id: subDealer._id,
                // SubDealer model fields (primary)
                SDName: subDealer.SDName || '',
                SDEmail: subDealer.SDEmail || '',
                SDMobileNo: subDealer.SDMobileNo || '',
                SDAddress1: subDealer.SDAddress1 || '',
                SDAddress2: subDealer.SDAddress2 || '',
                SDAddress3: subDealer.SDAddress3 || '',
                SDState: subDealer.SDState || '',
                SDCountry: subDealer.SDCountry || 'India',
                SDPincode: subDealer.SDPincode || '',
                SDContactPerson: subDealer.SDContactPerson || '',
                // Backward compatibility fields (for legacy support)
                name: subDealer.SDName || '',
                email: subDealer.SDEmail || '',
                mobile: subDealer.SDMobileNo || '',
                role: 'subdealer',
                // Construct address object from SubDealer fields
                address: {
                  street: subDealer.SDAddress1 || '',
                  city: subDealer.SDAddress2 || '',
                  state: subDealer.SDState || '',
                  pincode: subDealer.SDPincode || '',
                  country: subDealer.SDCountry || 'India',
                }
              };
            } else {
              // Fallback to User model if not found in SubDealer
              const userSubDealer = await User.findById(subDealerId).select('name email mobile role address').lean();
              if (userSubDealer) {
                order.subDealerId = {
                  _id: userSubDealer._id,
                  name: userSubDealer.name,
                  email: userSubDealer.email || '',
                  mobile: userSubDealer.mobile || '',
                  role: userSubDealer.role || 'subdealer',
                  address: userSubDealer.address || {}
                };
              } else {
                // Keep as is if not found in either model
                order.subDealerId = typeof order.subDealerId === 'object' ? order.subDealerId : { _id: subDealerId };
              }
            }
          } catch (error) {
            console.error('Error populating subDealerId:', error);
          }
        }
      }
    }

    console.log('🔍 Final filter for orders:', JSON.stringify(filter, null, 2));
    console.log('🔍 Current user ID:', userId);
    console.log('🔍 Current user role:', userRole);
    console.log('🔍 DealerId filter:', dealerId);

    const totalOrders = await Order.countDocuments(filter);
    console.log(`📊 Total orders matching filter: ${totalOrders}`);
    
    // Also check raw orders without filter to see what dealerIds exist
    if (totalOrders === 0 && dealerId) {
      const sampleOrders = await Order.find({ companyId, isActive: true })
        .select('dealerId customerId createdBy orderNumber')
        .limit(5)
        .lean();
      console.log('📋 Sample orders in database (first 5):', sampleOrders.map(o => ({
        orderNumber: o.orderNumber,
        dealerId: o.dealerId,
        customerId: o.customerId,
        createdBy: o.createdBy
      })));
    }

    // Calculate order statistics using the same filter
    const statsMatch = { ...filter }; 
    
    // Handle createdBy filter for aggregation pipeline
    // If it's an object with $in, keep it as is
    // If it's a string, convert to ObjectId
    if (statsMatch.createdBy) {
      if (typeof statsMatch.createdBy === 'string') {
        try {
          statsMatch.createdBy = new mongoose.Types.ObjectId(statsMatch.createdBy);
        } catch (error) {
          console.error('Error converting createdBy to ObjectId:', error);
          delete statsMatch.createdBy;
        }
      } else if (statsMatch.createdBy.$in) {
        // If it's an $in operator, convert all IDs to ObjectId
        statsMatch.createdBy.$in = statsMatch.createdBy.$in.map(id => 
          typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
        );
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

    // Fetch order without populate first, then manually populate from Ledger/SubDealer models
    let order = await Order.findOne({
      _id: orderId,
      companyId,
      isActive: true
    })
      .populate('createdBy', 'name role')
      .populate('approvedBy', 'name role')
      .populate('items.productId', 'productName productCode sellingPrice specifications description category brand')
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Manually populate dealerId, customerId, and subDealerId from Ledger/SubDealer models
    // Populate dealerId from Ledger model
    if (order.dealerId) {
      const dealerId = typeof order.dealerId === 'object' ? order.dealerId._id : order.dealerId;
      if (dealerId) {
        try {
          const ledgerDealer = await Ledger.findById(dealerId).lean();
          if (ledgerDealer) {
            order.dealerId = {
              _id: ledgerDealer._id,
              name: ledgerDealer.LedgerName,
              email: ledgerDealer.Email || '',
              mobile: ledgerDealer.LedgerMobile || '',
              role: 'dealer'
            };
          } else {
            const userDealer = await User.findById(dealerId).select('name email mobile role').lean();
            if (userDealer) {
              order.dealerId = {
                _id: userDealer._id,
                name: userDealer.name,
                email: userDealer.email || '',
                mobile: userDealer.mobile || '',
                role: userDealer.role || 'dealer'
              };
            }
          }
        } catch (error) {
          console.error('Error populating dealerId:', error);
        }
      }
    }

    // Populate customerId from Ledger model
    if (order.customerId) {
      const customerId = typeof order.customerId === 'object' ? order.customerId._id : order.customerId;
      if (customerId) {
        try {
          const ledgerCustomer = await Ledger.findById(customerId).lean();
          if (ledgerCustomer) {
            order.customerId = {
              _id: ledgerCustomer._id,
              name: ledgerCustomer.LedgerName,
              email: ledgerCustomer.Email || '',
              mobile: ledgerCustomer.LedgerMobile || '',
              role: 'dealer'
            };
          } else {
            const userCustomer = await User.findById(customerId).select('name email mobile role').lean();
            if (userCustomer) {
              order.customerId = {
                _id: userCustomer._id,
                name: userCustomer.name,
                email: userCustomer.email || '',
                mobile: userCustomer.mobile || '',
                role: userCustomer.role || 'dealer'
              };
            }
          }
        } catch (error) {
          console.error('Error populating customerId:', error);
        }
      }
    }

    // Populate subDealerId from SubDealer model
    if (order.subDealerId) {
      const subDealerId = typeof order.subDealerId === 'object' ? order.subDealerId._id : order.subDealerId;
      if (subDealerId) {
        try {
          const subDealer = await SubDealer.findById(subDealerId).lean();
          if (subDealer) {
            // Map SubDealer model fields properly
            order.subDealerId = {
              _id: subDealer._id,
              // SubDealer model fields (primary)
              SDName: subDealer.SDName || '',
              SDEmail: subDealer.SDEmail || '',
              SDMobileNo: subDealer.SDMobileNo || '',
              SDAddress1: subDealer.SDAddress1 || '',
              SDAddress2: subDealer.SDAddress2 || '',
              SDAddress3: subDealer.SDAddress3 || '',
              SDState: subDealer.SDState || '',
              SDCountry: subDealer.SDCountry || 'India',
              SDPincode: subDealer.SDPincode || '',
              SDContactPerson: subDealer.SDContactPerson || '',
              // Backward compatibility fields (for legacy support)
              name: subDealer.SDName || '',
              email: subDealer.SDEmail || '',
              mobile: subDealer.SDMobileNo || '',
              role: 'subdealer',
              // Construct address object from SubDealer fields
              address: {
                street: subDealer.SDAddress1 || '',
                city: subDealer.SDAddress2 || '',
                state: subDealer.SDState || '',
                pincode: subDealer.SDPincode || '',
                country: subDealer.SDCountry || 'India',
              }
            };
          } else {
            const userSubDealer = await User.findById(subDealerId).select('name email mobile role address').lean();
            if (userSubDealer) {
              order.subDealerId = {
                _id: userSubDealer._id,
                name: userSubDealer.name,
                email: userSubDealer.email || '',
                mobile: userSubDealer.mobile || '',
                role: userSubDealer.role || 'subdealer',
                address: userSubDealer.address || {}
              };
            }
          }
        } catch (error) {
          console.error('Error populating subDealerId:', error);
        }
      }
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

    // Try to find dealer in Ledger model first, then User model (for backward compatibility)
    let dealerDoc = null;
    if (dealerId) {
      try {
        dealerDoc = await Ledger.findById(dealerId).lean();
        if (!dealerDoc) {
          // Fallback to User model for backward compatibility
          dealerDoc = await User.findById(dealerId).lean();
        }
      } catch (error) {
        console.log('updateOrder - error finding dealer:', error.message);
        // Try User model as fallback
        try {
          dealerDoc = await User.findById(dealerId).lean();
        } catch (userError) {
          console.log('updateOrder - error finding dealer in User model:', userError.message);
        }
      }
    }

    // Try to find subdealer in SubDealer model first, then User model (for backward compatibility)
    let subDealerDoc = null;
    if (subDealerId) {
      try {
        subDealerDoc = await SubDealer.findById(subDealerId).lean();
        if (!subDealerDoc) {
          // Fallback to User model for backward compatibility
          subDealerDoc = await User.findById(subDealerId).lean();
        }
      } catch (error) {
        console.log('updateOrder - error finding subdealer:', error.message);
        // Try User model as fallback
        try {
          subDealerDoc = await User.findById(subDealerId).lean();
        } catch (userError) {
          console.log('updateOrder - error finding subdealer in User model:', userError.message);
        }
      }
    }

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

    // Extract buyer state from various sources, handling both Ledger/SubDealer and User models
    let buyerStateFromSubDealer = '';
    let buyerStateFromDealer = '';
    
    if (subDealerDoc) {
      // Check if it's from SubDealer model (has SDState field)
      if (subDealerDoc.SDState) {
        buyerStateFromSubDealer = extractState(subDealerDoc.SDState);
      } else if (subDealerDoc.address?.state) {
        // User model or address object
        buyerStateFromSubDealer = extractState(subDealerDoc.address.state);
      }
    }
    
    if (dealerDoc) {
      // Check if it's from Ledger model (has LedgerState field)
      if (dealerDoc.LedgerState) {
        buyerStateFromDealer = extractState(dealerDoc.LedgerState);
      } else if (dealerDoc.address?.state) {
        // User model or address object
        buyerStateFromDealer = extractState(dealerDoc.address.state);
      }
    }

    const buyerState =
      extractState(shippingAddress?.state) ||
      extractState(customerAddress?.state) ||
      extractState(customer?.address?.state) ||
      buyerStateFromSubDealer ||
      buyerStateFromDealer;

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
            $sum: { $cond: [{ $in: ['$status', ['pending', 'pending_approval', 'draft']] }, 1, 0] }
          },
          pendingAmount: {
            $sum: { $cond: [{ $in: ['$status', ['pending', 'pending_approval', 'draft']] }, '$finalAmount', 0] }
          },
          averageOrderValue: { $avg: '$finalAmount' },
          confirmedOrders: {
            $sum: { $cond: [{ $in: ['$status', ['confirmed', 'approved']] }, 1, 0] }
          },
          processingOrders: {
            $sum: { $cond: [{ $in: ['$status', ['processing', 'sent_to_tally']] }, 1, 0] }
          },
          shippedOrders: {
            $sum: { $cond: [{ $in: ['$status', ['shipped', 'dispatched']] }, 1, 0] }
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          ordersByStatus: { $push: '$status' },
          ordersByPriority: { $push: '$priority' },
          ordersByPaymentMethod: { $push: '$paymentMethod' },
          ordersByRole: { $push: { $ifNull: ['$createdBy.role', 'unknown'] } }
        }
      }
    ]);

    const raw = stats[0] || {};
    const result = {
      totalOrders: raw.totalOrders || 0,
      totalAmount: raw.totalAmount || 0,
      pendingOrders: raw.pendingOrders || 0,
      pendingAmount: raw.pendingAmount || 0,
      averageOrderValue: raw.averageOrderValue || 0,
      confirmedOrders: raw.confirmedOrders || 0,
      processingOrders: raw.processingOrders || 0,
      shippedOrders: raw.shippedOrders || 0,
      deliveredOrders: raw.deliveredOrders || 0,
      cancelledOrders: raw.cancelledOrders || 0,
      ordersByStatus: {},
      ordersByPriority: {},
      ordersByPaymentMethod: {},
      ordersByRole: {},
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
