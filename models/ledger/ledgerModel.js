import mongoose from "mongoose";

const ledgerSchema = new mongoose.Schema({
  // Basic Information
  ledgerId: {
    type: String,
    required: true,
    unique: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  
  // Party Information
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  partyName: {
    type: String,
    required: true
  },
  partyType: {
    type: String,
    enum: ['customer', 'supplier', 'dealer', 'distributor', 'employee', 'other'],
    required: true
  },
  partyRole: {
    type: String,
    enum: ['superadmin', 'admin', 'dealers', 'subdealer', 'asm', 'rsm', 'distibutors', 'suppliers', 'salesman', 'zonal'],
    required: true
  },
  
  // Account Information
  accountType: {
    type: String,
    enum: ['receivable', 'payable', 'advance', 'deposit', 'loan', 'other'],
    required: true
  },
  
  // Balance Information
  openingBalance: {
    type: Number,
    default: 0
  },
  currentBalance: {
    type: Number,
    default: 0
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  
  // Transaction Summary
  totalDebit: {
    type: Number,
    default: 0
  },
  totalCredit: {
    type: Number,
    default: 0
  },
  lastTransactionDate: {
    type: Date
  },
  lastTransactionAmount: {
    type: Number,
    default: 0
  },
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'closed'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Contact Information
  contactInfo: {
    email: String,
    phone: String,
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: String
    }
  },
  
  // Additional Information
  notes: String,
  tags: [String],
  
  // Audit Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { 
  timestamps: true 
});

// Indexes for better performance
ledgerSchema.index({ companyId: 1, partyId: 1 });
ledgerSchema.index({ companyId: 1, partyType: 1 });
ledgerSchema.index({ companyId: 1, accountType: 1 });
ledgerSchema.index({ companyId: 1, status: 1 });
ledgerSchema.index({ ledgerId: 1 });

// Virtual for balance status
ledgerSchema.virtual('balanceStatus').get(function() {
  if (this.currentBalance > 0) {
    return this.accountType === 'receivable' ? 'debit' : 'credit';
  } else if (this.currentBalance < 0) {
    return this.accountType === 'receivable' ? 'credit' : 'debit';
  }
  return 'zero';
});

// Method to update balance
ledgerSchema.methods.updateBalance = function(amount, transactionType) {
  if (transactionType === 'debit') {
    this.currentBalance += amount;
    this.totalDebit += amount;
  } else if (transactionType === 'credit') {
    this.currentBalance -= amount;
    this.totalCredit += amount;
  }
  this.lastTransactionDate = new Date();
  this.lastTransactionAmount = amount;
  return this.save();
};

const Ledger = mongoose.model('Ledger', ledgerSchema);
export default Ledger;
