import Ledger from '../models/ledger/ledgerModel.js';
import LedgerTransaction from '../models/ledger/ledgerTransactionModel.js';
import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import User from '../models/user/userModel.js';
import mongoose from 'mongoose';

// Generate unique ledger ID
const generateLedgerId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `LED-${timestamp}-${random}`.toUpperCase();
};

// Generate unique transaction ID
const generateTransactionId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `TXN-${timestamp}-${random}`.toUpperCase();
};

// Get all ledgers with filtering and pagination
export const getLedgers = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      page = 1,
      limit = 20,
      search,
      partyType,
      accountType,
      status = 'active',
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query using actual Ledger schema fields
    let query = { companyId, isActive: true };

    if (search) {
      query.$or = [
        { LedgerName: { $regex: search, $options: 'i' } },
        { LedgerMobile: { $regex: search, $options: 'i' } },
        { Email: { $regex: search, $options: 'i' } },
        { LedgerGSTIN: { $regex: search, $options: 'i' } },
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build sort object — map generic sortBy names to actual schema fields
    const sortFieldMap = {
      updatedAt: 'updatedAt',
      createdAt: 'createdAt',
      LedgerName: 'LedgerName',
      name: 'LedgerName',
    };
    const resolvedSortField = sortFieldMap[sortBy] || 'updatedAt';
    const sort = {};
    sort[resolvedSortField] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with valid schema populates only
    const ledgers = await Ledger.find(query)
      .populate('createdBy', 'name email')
      .populate('groupId', 'name')
      .populate('SalesMan', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalLedgers = await Ledger.countDocuments(query);

    // Calculate summary
    const summary = await Ledger.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: null,
          totalLedgers: { $sum: 1 },
          totalOpening: { $sum: '$LedgerOpening' },
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        ledgers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalLedgers / parseInt(limit)),
          totalLedgers,
          hasNext: skip + ledgers.length < totalLedgers,
          hasPrev: parseInt(page) > 1
        },
        summary: summary[0] || {
          totalLedgers: 0,
          totalOpening: 0,
        }
      },
      message: 'Ledgers retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ledgers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledgers',
      error: error.message
    });
  }
};

// Get ledger details with transactions
export const getLedgerDetails = async (req, res) => {
  try {
    const { ledgerId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      transactionType,
      transactionCategory
    } = req.query;

    // Get ledger details — only populate paths that exist in the schema
    const ledger = await Ledger.findOne({
      _id: ledgerId,
      companyId,
      isActive: true
    })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('groupId', 'name')
      .populate('SalesMan', 'name email role')
      .populate('ASM', 'name email role')
      .populate('RSM', 'name email role')
      .populate('ZSM', 'name email role');

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found'
      });
    }

    // ── Query VoucherMaster for Tally-synced transactions ────────────────────
    const voucherQuery = {
      ledgerId: new mongoose.Types.ObjectId(ledgerId),
      companyId: new mongoose.Types.ObjectId(companyId),
    };

    if (startDate || endDate) {
      voucherQuery.vchdate = {};
      if (startDate) voucherQuery.vchdate.$gte = new Date(startDate);
      if (endDate)   voucherQuery.vchdate.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch vouchers (Tally-synced) — primary transaction source
    const vouchers = await VoucherMaster.find(voucherQuery)
      .sort({ vchdate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalVouchers = await VoucherMaster.countDocuments(voucherQuery);

    // Also fetch app-created LedgerTransactions (manual entries)
    const appTxnQuery = {
      ledgerId: new mongoose.Types.ObjectId(ledgerId),
      companyId: new mongoose.Types.ObjectId(companyId),
    };
    if (startDate || endDate) {
      appTxnQuery.transactionDate = {};
      if (startDate) appTxnQuery.transactionDate.$gte = new Date(startDate);
      if (endDate)   appTxnQuery.transactionDate.$lte = new Date(endDate);
    }
    const appTransactions = await LedgerTransaction.find(appTxnQuery)
      .sort({ transactionDate: -1 })
      .lean();

    // Normalise both sources to a common shape for the frontend
    const normalisedVouchers = vouchers.map(v => ({
      _id: v._id,
      source: 'tally',
      date: v.vchdate,
      voucherNo: v.vchnumber,
      type: v.vchtype,
      amount: v.vchamount || 0,
      debit: v.vchamount > 0 ? Math.abs(v.vchamount) : 0,
      credit: v.vchamount < 0 ? Math.abs(v.vchamount) : 0,
      partyName: v.vchpartyname,
      description: v.vchtype,
      balance: 0, // Tally running balance not stored; frontend can omit
    }));

    const normalisedAppTxns = appTransactions.map(t => ({
      _id: t._id,
      source: 'app',
      date: t.transactionDate,
      voucherNo: t.referenceNumber || t.transactionId,
      type: t.transactionCategory,
      amount: t.amount || 0,
      debit: t.transactionType === 'debit' ? t.amount : 0,
      credit: t.transactionType === 'credit' ? t.amount : 0,
      description: t.description,
      balance: t.balanceAfter || 0,
    }));

    // Merge and sort by date descending
    const allTransactions = [...normalisedVouchers, ...normalisedAppTxns]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const totalTransactions = totalVouchers + appTransactions.length;

    // Summary — include LedgerOpening so frontend can display it
    const totalDebit  = allTransactions.reduce((s, t) => s + (t.debit  || 0), 0);
    const totalCredit = allTransactions.reduce((s, t) => s + (t.credit || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        ledger,
        transactions: allTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTransactions / parseInt(limit)),
          totalTransactions,
          hasNext: skip + allTransactions.length < totalTransactions,
          hasPrev: parseInt(page) > 1
        },
        summary: {
          openingBalance: ledger.LedgerOpening || 0,
          totalDebit,
          totalCredit,
          closingBalance: (ledger.LedgerOpening || 0) + totalDebit - totalCredit,
          transactionCount: totalTransactions,
        }
      },
      message: 'Ledger details retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ledger details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger details',
      error: error.message
    });
  }
};

// Create new ledger
export const createLedger = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      partyId,
      partyName,
      partyType,
      accountType,
      openingBalance = 0,
      creditLimit = 0,
      contactInfo,
      notes,
      tags = []
    } = req.body;

    // Validate required fields
    if (!partyId || !partyName || !partyType || !accountType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: partyId, partyName, partyType, accountType'
      });
    }

    // Check if party exists
    const party = await User.findById(partyId);
    if (!party) {
      return res.status(404).json({
        success: false,
        message: 'Party not found'
      });
    }

    // Check if ledger already exists for this party and account type
    const existingLedger = await Ledger.findOne({
      companyId,
      partyId,
      accountType,
      isActive: true
    });

    if (existingLedger) {
      return res.status(400).json({
        success: false,
        message: 'Ledger already exists for this party and account type'
      });
    }

    // Create new ledger
    const newLedger = new Ledger({
      ledgerId: generateLedgerId(),
      companyId,
      partyId,
      partyName,
      partyType,
      partyRole: party.role,
      accountType,
      openingBalance,
      currentBalance: openingBalance,
      creditLimit,
      contactInfo,
      notes,
      tags,
      createdBy: userId
    });

    await newLedger.save();

    // Create opening balance transaction if balance is not zero
    if (openingBalance !== 0) {
      const openingTransaction = new LedgerTransaction({
        transactionId: generateTransactionId(),
        companyId,
        ledgerId: newLedger._id,
        transactionType: openingBalance > 0 ? 'debit' : 'credit',
        transactionCategory: 'opening_balance',
        amount: Math.abs(openingBalance),
        balanceAfter: openingBalance,
        description: 'Opening Balance',
        referenceType: 'opening_balance',
        createdBy: userId
      });

      await openingTransaction.save();
    }

    // Populate the response with valid schema paths only
    await newLedger.populate([
      { path: 'createdBy', select: 'name email' },
      { path: 'groupId', select: 'name' }
    ]);

    res.status(201).json({
      success: true,
      data: newLedger,
      message: 'Ledger created successfully'
    });
  } catch (error) {
    console.error('Error creating ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ledger',
      error: error.message
    });
  }
};

// Update ledger
export const updateLedger = async (req, res) => {
  try {
    const { ledgerId } = req.params;
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const updateData = req.body;
    delete updateData.ledgerId; // Prevent updating ledger ID
    delete updateData.currentBalance; // Prevent direct balance updates
    delete updateData.totalDebit; // Prevent direct total updates
    delete updateData.totalCredit; // Prevent direct total updates

    const ledger = await Ledger.findOneAndUpdate(
      { _id: ledgerId, companyId, isActive: true },
      {
        ...updateData,
        updatedBy: userId
      },
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('groupId', 'name')
      .populate('SalesMan', 'name email role');

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found'
      });
    }

    res.status(200).json({
      success: true,
      data: ledger,
      message: 'Ledger updated successfully'
    });
  } catch (error) {
    console.error('Error updating ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ledger',
      error: error.message
    });
  }
};

// Add transaction to ledger
export const addTransaction = async (req, res) => {
  try {
    const { ledgerId } = req.params;
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      transactionType,
      transactionCategory,
      amount,
      description,
      referenceType,
      referenceId,
      referenceNumber,
      notes,
      paymentMethod,
      paymentReference,
      transactionDate
    } = req.body;

    // Validate required fields
    if (!transactionType || !transactionCategory || !amount || !description) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: transactionType, transactionCategory, amount, description'
      });
    }

    // Get ledger
    const ledger = await Ledger.findOne({ 
      _id: ledgerId, 
      companyId, 
      isActive: true 
    });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found'
      });
    }

    // Calculate new balance
    let newBalance = ledger.currentBalance;
    if (transactionType === 'debit') {
      newBalance += amount;
    } else if (transactionType === 'credit') {
      newBalance -= amount;
    }

    // Create transaction
    const transaction = new LedgerTransaction({
      transactionId: generateTransactionId(),
      companyId,
      ledgerId,
      transactionType,
      transactionCategory,
      amount,
      balanceAfter: newBalance,
      description,
      referenceType,
      referenceId,
      referenceNumber,
      notes,
      paymentMethod,
      paymentReference,
      transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
      createdBy: userId
    });

    await transaction.save();

    // Update ledger balance
    await ledger.updateBalance(amount, transactionType);

    // Populate transaction
    await transaction.populate([
      { path: 'createdBy', select: 'name email' }
    ]);

    res.status(201).json({
      success: true,
      data: transaction,
      message: 'Transaction added successfully'
    });
  } catch (error) {
    console.error('Error adding transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add transaction',
      error: error.message
    });
  }
};

// Get ledger summary
export const getLedgerSummary = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    // Use actual Ledger schema fields (Tally-sync model)
    const summary = await Ledger.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: null,
          totalLedgers: { $sum: 1 },
          totalOpening: { $sum: '$LedgerOpening' },
          withGroup: { $sum: { $cond: [{ $ifNull: ['$groupId', false] }, 1, 0] } },
          withSalesman: { $sum: { $cond: [{ $ifNull: ['$SalesMan', false] }, 1, 0] } },
        }
      }
    ]);

    // Breakdown by LedgerParent (Tally parent group)
    const parentBreakdown = await Ledger.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: '$LedgerParent',
          count: { $sum: 1 },
          totalOpening: { $sum: '$LedgerOpening' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: summary[0] || {
          totalLedgers: 0,
          totalOpening: 0,
          withGroup: 0,
          withSalesman: 0,
        },
        parentBreakdown,
      },
      message: 'Ledger summary retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ledger summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ledger summary',
      error: error.message
    });
  }
};

// Get users for ledger creation
export const getUsersForLedger = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const { partyType, role } = req.query;

    let query = {
      isActive: true,
      _id: { $ne: userId } // Exclude current user
    };

    if (partyType) {
      query.partyType = partyType;
    }

    if (role) {
      query.role = role;
    }

    const users = await User.find(query)
      .select('_id name email role partyType companies')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: { users },
      message: 'Users for ledger creation retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting users for ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users for ledger creation',
      error: error.message
    });
  }
};
