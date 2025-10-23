import Ledger from '../models/ledger/ledgerModel.js';
import LedgerTransaction from '../models/ledger/ledgerTransactionModel.js';
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

    // Build query
    let query = { companyId, isActive: true };
    
    if (status !== 'all') {
      query.status = status;
    }
    
    if (partyType) {
      query.partyType = partyType;
    }
    
    if (accountType) {
      query.accountType = accountType;
    }
    
    if (search) {
      query.$or = [
        { partyName: { $regex: search, $options: 'i' } },
        { ledgerId: { $regex: search, $options: 'i' } },
        { 'contactInfo.email': { $regex: search, $options: 'i' } },
        { 'contactInfo.phone': { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const ledgers = await Ledger.find(query)
      .populate('partyId', 'name email role')
      .populate('createdBy', 'name email')
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
          totalReceivable: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$accountType', 'receivable'] }, { $gt: ['$currentBalance', 0] }] },
                '$currentBalance',
                0
              ]
            }
          },
          totalPayable: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$accountType', 'payable'] }, { $gt: ['$currentBalance', 0] }] },
                '$currentBalance',
                0
              ]
            }
          },
          totalDebitBalance: {
            $sum: {
              $cond: [{ $gt: ['$currentBalance', 0] }, '$currentBalance', 0]
            }
          },
          totalCreditBalance: {
            $sum: {
              $cond: [{ $lt: ['$currentBalance', 0] }, { $abs: '$currentBalance' }, 0]
            }
          }
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
          totalReceivable: 0,
          totalPayable: 0,
          totalDebitBalance: 0,
          totalCreditBalance: 0
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

    // Get ledger details
    const ledger = await Ledger.findOne({ 
      _id: ledgerId, 
      companyId, 
      isActive: true 
    })
      .populate('partyId', 'name email role hierarchy')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: 'Ledger not found'
      });
    }

    // Build transaction query
    let transactionQuery = { 
      ledgerId: new mongoose.Types.ObjectId(ledgerId),
      companyId: new mongoose.Types.ObjectId(companyId)
    };

    if (startDate || endDate) {
      transactionQuery.transactionDate = {};
      if (startDate) transactionQuery.transactionDate.$gte = new Date(startDate);
      if (endDate) transactionQuery.transactionDate.$lte = new Date(endDate);
    }

    if (transactionType) {
      transactionQuery.transactionType = transactionType;
    }

    if (transactionCategory) {
      transactionQuery.transactionCategory = transactionCategory;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get transactions
    const transactions = await LedgerTransaction.find(transactionQuery)
      .populate('createdBy', 'name email')
      .populate('approvedBy', 'name email')
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalTransactions = await LedgerTransaction.countDocuments(transactionQuery);

    // Calculate transaction summary
    const transactionSummary = await LedgerTransaction.aggregate([
      { $match: transactionQuery },
      {
        $group: {
          _id: null,
          totalDebit: { $sum: { $cond: [{ $eq: ['$transactionType', 'debit'] }, '$amount', 0] } },
          totalCredit: { $sum: { $cond: [{ $eq: ['$transactionType', 'credit'] }, '$amount', 0] } },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        ledger,
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalTransactions / parseInt(limit)),
          totalTransactions,
          hasNext: skip + transactions.length < totalTransactions,
          hasPrev: parseInt(page) > 1
        },
        summary: transactionSummary[0] || {
          totalDebit: 0,
          totalCredit: 0,
          transactionCount: 0
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

    // Populate the response
    await newLedger.populate([
      { path: 'partyId', select: 'name email role' },
      { path: 'createdBy', select: 'name email' }
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
      .populate('partyId', 'name email role')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

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
    
    const summary = await Ledger.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: null,
          totalLedgers: { $sum: 1 },
          totalReceivable: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$accountType', 'receivable'] }, { $gt: ['$currentBalance', 0] }] },
                '$currentBalance',
                0
              ]
            }
          },
          totalPayable: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$accountType', 'payable'] }, { $gt: ['$currentBalance', 0] }] },
                '$currentBalance',
                0
              ]
            }
          },
          totalDebitBalance: {
            $sum: {
              $cond: [{ $gt: ['$currentBalance', 0] }, '$currentBalance', 0]
            }
          },
          totalCreditBalance: {
            $sum: {
              $cond: [{ $lt: ['$currentBalance', 0] }, { $abs: '$currentBalance' }, 0]
            }
          },
          activeLedgers: {
            $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
          },
          inactiveLedgers: {
            $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get party type breakdown
    const partyTypeBreakdown = await Ledger.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: '$partyType',
          count: { $sum: 1 },
          totalBalance: { $sum: '$currentBalance' }
        }
      }
    ]);

    // Get account type breakdown
    const accountTypeBreakdown = await Ledger.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: '$accountType',
          count: { $sum: 1 },
          totalBalance: { $sum: '$currentBalance' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: summary[0] || {
          totalLedgers: 0,
          totalReceivable: 0,
          totalPayable: 0,
          totalDebitBalance: 0,
          totalCreditBalance: 0,
          activeLedgers: 0,
          inactiveLedgers: 0
        },
        partyTypeBreakdown,
        accountTypeBreakdown
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
