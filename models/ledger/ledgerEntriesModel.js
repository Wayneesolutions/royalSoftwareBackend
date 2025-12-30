import mongoose from "mongoose";

const ledgerEntriesSchema = new mongoose.Schema({
  // Company Information
  cmpcode: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  
  // Voucher Information
  vchguid: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  voucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VoucherMaster',
    required: true,
    index: true,
  },
  
  // Ledger Information
  ledgerguid: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  ledgerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
    required: true,
    index: true,
  },
  
  // Amount
  ledgeramount: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Additional Custom Fields
  other1: {
    type: String,
    trim: true,
  },
  other2: {
    type: String,
    trim: true,
  },
  other3: {
    type: String,
    trim: true,
  },
  other4: {
    type: String,
    trim: true,
  },
  other5: {
    type: String,
    trim: true,
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  
  // Audit Fields
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  syncedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes for better query performance
ledgerEntriesSchema.index({ cmpcode: 1, vchguid: 1 });
ledgerEntriesSchema.index({ cmpcode: 1, ledgerguid: 1 });
ledgerEntriesSchema.index({ voucherId: 1, ledgerId: 1 });
ledgerEntriesSchema.index({ companyId: 1, voucherId: 1 });

// Note: No unique constraint - allows multiple entries for same ledger in one voucher
// This is correct accounting behavior (e.g., multiple line items, adjustments, etc.)

const LedgerEntries = mongoose.model('LedgerEntries', ledgerEntriesSchema);

export default LedgerEntries;

