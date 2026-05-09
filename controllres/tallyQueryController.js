import Company from '../models/company/companyModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import SubDealer from '../models/subdealer/subdealerModel.js';

const normalizeGuid = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.toString().trim();
  if (!trimmed) {
    return null;
  }

  // GUID is alphanumeric, return as string
  return trimmed;
};

const findCompanyByGuid = async (rawGuid) => {
  const normalizedGuid = normalizeGuid(rawGuid);
  if (normalizedGuid === null) {
    return null;
  }

  const escapedGuid = normalizedGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numericGuid = Number(normalizedGuid);
  const isNumeric = !Number.isNaN(numericGuid) && Number.isFinite(numericGuid);

  // Build query conditions to handle both string and numeric GUIDs
  const queryConditions = [
    { guid: normalizedGuid },                    // Exact string match
    { guid: { $regex: new RegExp(`^${escapedGuid}$`, 'i') } }  // Case-insensitive string match
  ];

  // If GUID looks numeric, also try numeric match
  if (isNumeric) {
    queryConditions.push({ guid: numericGuid }); // Numeric match
    queryConditions.push({ guid: String(numericGuid) }); // String version of number
  }

  // Try each condition sequentially
  let company = null;
  for (const condition of queryConditions) {
    company = await Company.findOne(condition).lean();
    if (company) break;
  }

  // If still not found, try $or query
  if (!company) {
    company = await Company.findOne({ $or: queryConditions }).lean();
  }

  // If still not found and GUID is numeric, try querying collection directly
  // This bypasses Mongoose's type checking for the String-typed guid field
  // which is necessary because some GUIDs are stored as numbers in the database
  if (!company && isNumeric) {
    try {
      const collection = Company.collection;
      const rawDoc = await collection.findOne({ guid: numericGuid });
      if (rawDoc) {
        company = await Company.findById(rawDoc._id).lean();
      }
    } catch (error) {
      console.error('[findCompanyByGuid] Error in direct collection query:', error);
    }
  }

  return company;
};

export const listCompaniesForTally = async (req, res) => {
  try {
    const companies = await Company.find({})
      .select(
        'companyName companyCode companyEmail companyMobile companyState companyCountry guid maxUser isActive createdAt updatedAt'
      )
      .lean();

    return res.json({
      success: true,
      totalCompanies: companies.length,
      companies,
    });
  } catch (error) {
    console.error('Error fetching companies for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const listProductsByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const products = await Product.find({
      companyId: company._id,
    })
      .select(
        'productCode productName description category subCategory brand price stock gstRate isActive createdAt updatedAt'
      )
      .lean();

    const normalizedProducts = products.map((p) => ({
      ...p,
      // Ensure Tally always receives a usable code field.
      productCode: p.productCode || p.productName || '',
    }));

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalProducts: normalizedProducts.length,
      products: normalizedProducts,
    });
  } catch (error) {
    console.error('Error fetching products for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const listUsersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const users = await User.find({
      isActive: { $in: [true, false] },
      $or: [
        { defaultCompany: company._id },
        { 'companies.companyId': company._id },
      ],
    })
      .select(
        'name email mobile userName role address isActive defaultCompany companies createdAt updatedAt'
      )
      .lean();

    const mappedUsers = users.map((user) => {
      const assignment = (user.companies || []).find(
        (c) => c.companyId && c.companyId.toString() === company._id.toString()
      );

      return {
        id: user._id,
        name: user.name,
        email: user.email || '',
        mobile: user.mobile,
        userName: user.userName || '',
        role: user.role,
        isActive: user.isActive,
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          pincode: user.address?.pincode || '',
          country: user.address?.country || '',
        },
        defaultCompany:
          user.defaultCompany &&
          user.defaultCompany.toString() === company._id.toString(),
        assignedAt: assignment?.assignedAt || user.createdAt,
        assignmentRole: assignment?.role || user.role,
        assignedBy: assignment?.assignedBy || null,
        lastUpdated: user.updatedAt,
      };
    });

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalUsers: mappedUsers.length,
      users: mappedUsers,
    });
  } catch (error) {
    console.error('Error fetching users for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Helper to format dealer details
const formatDealerDetails = async (order, companyId) => {
  let dealerData = {
    name: order.dealerName,
    id: order.dealerId,
    email: null,
    mobile: null,
    address: {
      street: null,
      city: null,
      state: null,
      pincode: null,
      country: 'India'
    },
    ledgerGUID: null
  };

  // 1. Try to find by dealerId (User)
  if (order.dealerId) {
    const dealerUser = await User.findById(order.dealerId).select('name email mobile address').lean();
    if (dealerUser) {
      dealerData.name = dealerUser.name;
      dealerData.email = dealerUser.email;
      dealerData.mobile = dealerUser.mobile;
      if (dealerUser.address) {
        dealerData.address = {
          street: dealerUser.address.street,
          city: dealerUser.address.city,
          state: dealerUser.address.state,
          pincode: dealerUser.address.pincode,
          country: dealerUser.address.country || 'India'
        };
      }
    }
  }

  // 2. Try to find in Ledger (using dealerName or dealerId for better address and ledgerGUID)
  // Logic: Ledger usually has better address for billing and contains ledgerGUID
  if (order.dealerName || order.dealerId) {
    const ledger = await Ledger.findOne({
      LedgerName: order.dealerName,
      companyId: companyId
    }).lean();

    if (ledger) {
      // Update address if missing
      if (!dealerData.address.street) {
        dealerData.address = {
          street: [ledger.LedgerAddress1, ledger.LedgerAddress2].filter(Boolean).join(', '),
          city: null, // Ledger might not have separate city field usually part of address
          state: ledger.LedgerState,
          pincode: null,
          country: 'India'
        };
      }
      // Fill contact if missing
      if (!dealerData.mobile) dealerData.mobile = ledger.LedgerMobile;
      if (!dealerData.email) dealerData.email = ledger.Email;

      // Add LedgerGUID - useful for Tally
      dealerData.ledgerGUID = ledger.LedgerGUID;
    }
  }

  return dealerData;
};

// Helper to format subdealer details
const formatSubDealerDetails = async (order, companyId) => {
  if (!order.subDealerName && !order.subDealerId) return null;

  let subDealerData = {
    name: order.subDealerName,
    id: order.subDealerId,
    type: null,
    email: null,
    mobile: null,
    address: {
      city: null,
      state: null,
      pincode: null,
      country: 'India'
    }
  };

  // 1. Try SubDealer model first (by ID or Name)
  let subDealer = null;
  if (order.subDealerId) {
    subDealer = await SubDealer.findById(order.subDealerId).lean();
  }

  if (!subDealer && order.subDealerName) {
    subDealer = await SubDealer.findOne({ SDName: order.subDealerName, companyId }).lean();
  }

  if (subDealer) {
    subDealerData.name = subDealer.SDName;
    subDealerData.type = subDealer.SDType;
    subDealerData.email = subDealer.SDEmail;
    subDealerData.mobile = subDealer.SDMobileNo;
    subDealerData.address = {
      city: null,
      state: subDealer.SDState,
      pincode: subDealer.SDPincode,
      country: subDealer.SDCountry || 'India'
    };
    return subDealerData;
  }

  // 2. Fallback to User model (if stored as user)
  if (order.subDealerId) {
    const sdUser = await User.findById(order.subDealerId).select('name email mobile address').lean();
    if (sdUser) {
      subDealerData.name = sdUser.name;
      subDealerData.email = sdUser.email;
      subDealerData.mobile = sdUser.mobile;
      if (sdUser.address) {
        subDealerData.address = {
          city: sdUser.address.city,
          state: sdUser.address.state,
          pincode: sdUser.address.pincode,
          country: sdUser.address.country || 'India'
        };
      }
    }
  }

  return subDealerData;
};

export const listApprovedOrdersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const now = new Date();

    // Revert any sent_to_tally orders older than 10 minutes back to approved.
    // Protects against the connector crashing after GET but before POST /orders/response,
    // which would otherwise leave orders stranded in sent_to_tally indefinitely.
    const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await Order.updateMany(
      {
        companyId: company._id,
        status: 'sent_to_tally',
        tallySyncAt: { $lt: staleThreshold },
        tallySyncStatus: { $ne: 'synced' },
      },
      {
        $set: { status: 'approved' },
      }
    );

    // Concurrency-safe claim: atomically move orders from approved to sent_to_tally.
    // tallySyncAt is stamped here so the 10-minute stale revert above has a reference point.
    const claimedIds = [];

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const claimed = await Order.findOneAndUpdate(
        {
          companyId: company._id,
          status: 'approved',
          tallySyncStatus: { $ne: 'synced' },
        },
        {
          $set: {
            status: 'sent_to_tally',
            tallySyncAt: now,
          },
        },
        { new: true, sort: { orderDate: 1, _id: 1 } }
      )
        .select('_id');

      if (!claimed?._id) break;
      claimedIds.push(claimed._id);
    }

    const orders = claimedIds.length
      ? await Order.find({ _id: { $in: claimedIds } })
          .populate('items.productId', 'productCode productName description itemHsn')
          .lean()
      : [];

    const formattedOrders = await Promise.all(
      orders.map(async (order) => {
      // 1. Format Dealer Details
      const dealer = await formatDealerDetails(order, company._id);

      // 2. Format SubDealer Details
      const subDealer = await formatSubDealerDetails(order, company._id);

      // 3. Format Items
      const formattedItems = order.items.map(item => ({
        // Fallbacks so Tally payload stays valid even if productCode is missing.
        productCode:
          item.productCode ||
          item.productId?.productCode ||
          item.productName ||
          item.productId?._id?.toString?.() ||
          '',
        productName: item.productName || item.productId?.productName,
        description: item.productId?.description,
        hsnCode: item.productId?.itemHsn,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxAmount: item.tax,
        totalPrice: item.totalPrice,
        cgstAmount: item.cgstAmount,
        sgstAmount: item.sgstAmount,
        igstAmount: item.igstAmount
      }));

      // Remove street field from customerAddress if it exists
      const customerAddress = order.customerAddress;
      let formattedCustomerAddress = customerAddress;
      if (customerAddress && typeof customerAddress === 'object' && customerAddress.street !== undefined) {
        const { street, ...addressWithoutStreet } = customerAddress;
        formattedCustomerAddress = addressWithoutStreet;
      }

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        status: order.status,
        customerName: order.customerName,
        customerAddress: formattedCustomerAddress,
        ledgerGUID: dealer?.ledgerGUID || null,
        subDealer: subDealer,
        totalAmount: order.totalAmount,
        discountAmount: order.discountAmount || 0,
        taxableValue: order.taxableValueTotal,
        taxAmount: order.taxAmount,
        finalAmount: order.finalAmount,
        cgstTotal: order.cgstTotal,
        sgstTotal: order.sgstTotal,
        igstTotal: order.igstTotal,
        termsofpayment: order.termsOfPayment || '',
        otherref: order.otherReference || '',
        termsofdel1: order.termsOfDelivery1 || '',
        termsofdel2: order.termsOfDelivery2 || '',
        ordernotes: order.notes || '',
        items: formattedItems,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    })
    );

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalOrders: formattedOrders.length,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error('Error fetching approved orders for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch approved orders for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const listUnapprovedOrdersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const orders = await Order.find({
      companyId: company._id,
      status: { $in: ['draft', 'pending_approval'] },
    })
      .populate('createdBy', 'name email userName role')
      .populate('items.productId', 'productCode productName description itemHsn')
      .lean();

    const formattedOrders = await Promise.all(orders.map(async (order) => {
      // 1. Format Dealer Details
      const dealer = await formatDealerDetails(order, company._id);

      // 2. Format SubDealer Details
      const subDealer = await formatSubDealerDetails(order, company._id);

      // 3. Format Items
      const formattedItems = order.items.map(item => ({
        // Fallbacks so Tally payload stays valid even if productCode is missing.
        productCode:
          item.productCode ||
          item.productId?.productCode ||
          item.productName ||
          item.productId?._id?.toString?.() ||
          '',
        productName: item.productName || item.productId?.productName,
        description: item.productId?.description,
        hsnCode: item.productId?.itemHsn,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxAmount: item.tax,
        totalPrice: item.totalPrice,
        cgstAmount: item.cgstAmount,
        sgstAmount: item.sgstAmount,
        igstAmount: item.igstAmount
      }));

      // Remove street field from customerAddress if it exists
      const customerAddress = order.customerAddress;
      let formattedCustomerAddress = customerAddress;
      if (customerAddress && typeof customerAddress === 'object' && customerAddress.street !== undefined) {
        const { street, ...addressWithoutStreet } = customerAddress;
        formattedCustomerAddress = addressWithoutStreet;
      }

      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        status: order.status,
        customerName: order.customerName,
        customerAddress: formattedCustomerAddress,
        ledgerGUID: dealer?.ledgerGUID || null,
        subDealer: subDealer,
        totalAmount: order.totalAmount,
        discountAmount: order.discountAmount || 0,
        taxableValue: order.taxableValueTotal,
        taxAmount: order.taxAmount,
        finalAmount: order.finalAmount,
        cgstTotal: order.cgstTotal,
        sgstTotal: order.sgstTotal,
        igstTotal: order.igstTotal,
        termsofpayment: order.termsOfPayment || '',
        otherref: order.otherReference || '',
        termsofdel1: order.termsOfDelivery1 || '',
        termsofdel2: order.termsOfDelivery2 || '',
        ordernotes: order.notes || '',
        items: formattedItems,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt
      };
    }));

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalOrders: formattedOrders.length,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error('Error fetching unapproved orders for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch unapproved orders for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

const processSingleOrderResponse = async (entry, now) => {
  const { orderId, status, tallyGUID, tallyVoucherNumber, remarks } = entry;

  if (!orderId) return { orderId: null, success: false, error: 'orderId is required' };
  if (!status || !['accepted', 'rejected'].includes(status)) {
    return { orderId, success: false, error: 'status must be "accepted" or "rejected"' };
  }

  const order = await Order.findOne({ _id: orderId, status: 'sent_to_tally' });
  if (!order) {
    return { orderId, success: false, error: 'Order not found or not in sent_to_tally status' };
  }

  if (status === 'accepted') {
    order.tallySyncStatus = 'synced';
    order.tallyGUID = tallyGUID || order.tallyGUID;
    order.tallyVoucherNumber = tallyVoucherNumber || null;
    order.tallyResponseAt = now;
    order.tallyRemarks = null;
    await order.save();

    return {
      orderId: order._id,
      orderNumber: order.orderNumber,
      success: true,
      status: order.status,
      tallySyncStatus: order.tallySyncStatus,
      tallyGUID: order.tallyGUID,
      tallyVoucherNumber: order.tallyVoucherNumber,
      tallyResponseAt: order.tallyResponseAt,
    };
  }

  // rejected — revert to approved so next GET poll picks it up again
  order.tallySyncStatus = 'failed';
  order.status = 'approved';
  order.tallyRemarks = remarks || null;
  order.tallyResponseAt = now;
  await order.save();

  return {
    orderId: order._id,
    orderNumber: order.orderNumber,
    success: true,
    status: order.status,
    tallySyncStatus: order.tallySyncStatus,
    tallyRemarks: order.tallyRemarks,
    tallyResponseAt: order.tallyResponseAt,
  };
};

export const handleTallyOrderResponse = async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
      }
    }

    const now = new Date();

    // Support both single object and array of orders
    const isBatch = Array.isArray(body.orders);
    const entries = isBatch ? body.orders : [body];

    if (entries.length === 0) {
      return res.status(400).json({ success: false, message: 'No order entries provided' });
    }

    const results = await Promise.all(entries.map((entry) => processSingleOrderResponse(entry, now)));

    if (!isBatch) {
      // Single-order response — keep original flat response shape
      const result = results[0];
      if (!result.success) {
        const statusCode = result.error.includes('not found') ? 404 : 400;
        return res.status(statusCode).json({ success: false, message: result.error });
      }
      const isSynced = result.tallySyncStatus === 'synced';
      return res.json({
        success: true,
        message: isSynced ? 'Order marked as synced with Tally' : 'Order marked as failed. It has been reset to approved for retry.',
        order: result,
      });
    }

    // Batch response
    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    return res.json({
      success: true,
      message: `Processed ${entries.length} order(s): ${succeeded.length} succeeded, ${failed.length} failed`,
      total: entries.length,
      succeeded: succeeded.length,
      failed: failed.length,
      results,
    });
  } catch (error) {
    console.error('Error handling Tally order response:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to handle Tally order response',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
