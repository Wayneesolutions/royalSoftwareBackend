import mongoose from "mongoose";

const ledgerSchema = new mongoose.Schema({
  // Required Fields
  LedgerGUID: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  LedgerName: {
    type: String,
    trim: true,
    required: true,
  },
  LedgerParent: {
    type: String,
    trim: true,
    default: null,
  },
  
  // Hierarchy Assignment (User IDs)
  SalesMan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  ASM: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  RSM: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  ZSM: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Contact Information
  LedgerMobile: {
    type: String,
    trim: true,
  },
  LedgerContact: {
    type: String,
    trim: true,
  },
  Email: {
    type: String,
    trim: true,
  },
  password: {
    type: String,
    trim: true,
    required: false, // Optional - only required if dealer needs to login
  },
  LedgerGSTIN: {
    type: String,
    trim: true,
    uppercase: true,
  },
  
  // Address Information
  LedgerAddress1: {
    type: String,
    trim: true,
  },
  LedgerAddress2: {
    type: String,
    trim: true,
  },
  LedgerState: {
    type: String,
    trim: true,
  },
  
  // Balance and Date Information
  LedgerOpening: {
    type: Number,
    default: 0
  },
  LedgerOpeningDate: {
    type: Date,
  },
  LedgerJoinDate: {
    type: Date,
  },
  
  // Company Information
  Cmpguid: {
    type: String,
    trim: true,
  },
  cmpcode: {
    type: String,
    trim: true,
    index: true,
  },
  cmpCode: {
    type: String,
    trim: true,
  },
  
  // Group Assignment
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    index: true,
  },
  
  // Additional Fields
  Remarks: {
    type: String,
    trim: true,
  },
  Other1: {
    type: String,
    trim: true,
  },
  Other2: {
    type: String,
    trim: true,
  },
  Other3: {
    type: String,
    trim: true,
  },
  Other4: {
    type: String,
    trim: true,
  },
  Other5: {
    type: String,
    trim: true,
  },
  other6: {
    type: String,
    trim: true,
  },
  other7: {
    type: String,
    trim: true,
  },
  other8: {
    type: String,
    trim: true,
  },
  
  // System Fields (minimal for functionality)
  isActive: {
    type: Boolean,
    default: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
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
ledgerSchema.index({ LedgerGUID: 1, cmpcode: 1 }, { unique: true, sparse: true });
ledgerSchema.index({ cmpcode: 1, isActive: 1 });
ledgerSchema.index({ LedgerParent: 1 });
ledgerSchema.index({ SalesMan: 1 });
ledgerSchema.index({ ASM: 1 });
ledgerSchema.index({ RSM: 1 });
ledgerSchema.index({ ZSM: 1 });
ledgerSchema.index({ companyId: 1 });
ledgerSchema.index({ LedgerName: 1 });
ledgerSchema.index({ groupId: 1 });

const Ledger = mongoose.model('Ledger', ledgerSchema);
export default Ledger;
