import mongoose from "mongoose";

const ledgerTransactionSchema = new mongoose.Schema({
  // Basic Information
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  ledgerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
    required: true
  },
  
  // Transaction Details
  transactionType: {
    type: String,
    enum: ['debit', 'credit', 'opening_balance', 'adjustment', 'transfer'],
    required: true
  },
  transactionCategory: {
    type: String,
    enum: ['sale', 'purchase', 'payment', 'receipt', 'advance', 'refund', 'discount', 'adjustment', 'opening_balance', 'other'],
    required: true
  },
  
  // Amount Information
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  balanceAfter: {
    type: Number,
    required: true
  },
  
  // Reference Information
  referenceType: {
    type: String,
    enum: ['order', 'invoice', 'payment', 'receipt', 'adjustment', 'opening_balance', 'other'],
    default: 'other'
  },
  referenceId: {
    type: String
  },
  referenceNumber: {
    type: String
  },
  
  // Description and Notes
  description: {
    type: String,
    required: true
  },
  notes: String,
  
  // Transaction Date
  transactionDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  // Payment Information (if applicable)
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'cheque', 'card', 'upi', 'other']
  },
  paymentReference: String,
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'completed', 'cancelled', 'reversed'],
    default: 'completed'
  },
  
  // Audit Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date
}, { 
  timestamps: true 
});

// Indexes for better performance
ledgerTransactionSchema.index({ companyId: 1, ledgerId: 1 });
ledgerTransactionSchema.index({ companyId: 1, transactionDate: -1 });
ledgerTransactionSchema.index({ companyId: 1, transactionType: 1 });
ledgerTransactionSchema.index({ companyId: 1, transactionCategory: 1 });
ledgerTransactionSchema.index({ referenceType: 1, referenceId: 1 });
ledgerTransactionSchema.index({ transactionId: 1 });

// Virtual for transaction display
ledgerTransactionSchema.virtual('displayAmount').get(function() {
  return this.transactionType === 'debit' ? this.amount : -this.amount;
});

// Method to reverse transaction
ledgerTransactionSchema.methods.reverse = function(reversedBy) {
  this.status = 'reversed';
  this.notes = (this.notes || '') + ` [Reversed by ${reversedBy} on ${new Date()}]`;
  return this.save();
};

const LedgerTransaction = mongoose.model('LedgerTransaction', ledgerTransactionSchema);
export default LedgerTransaction;
