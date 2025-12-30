import mongoose from "mongoose";

const voucherMasterSchema = new mongoose.Schema({
  // Company Information
  companyguid: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
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
    unique: true,
    index: true,
  },
  vchnumber: {
    type: String,
    trim: true,
    required: true,
  },
  vchdate: {
    type: Date,
    required: true,
    index: true,
  },
  vchtype: {
    type: String,
    trim: true,
    required: true,
  },
  vchtypeparent: {
    type: String,
    trim: true,
  },
  
  // Party (Ledger) Information
  vchpartyguid: {
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
  vchpartyname: {
    type: String,
    trim: true,
  },
  vchpartyadd1: {
    type: String,
    trim: true,
  },
  vchpartyadd2: {
    type: String,
    trim: true,
  },
  vchpartyadd3: {
    type: String,
    trim: true,
  },
  vchpartygstin: {
    type: String,
    trim: true,
    uppercase: true,
  },
  
  // Sub Dealer Information
  vchsubdealername: {
    type: String,
    trim: true,
  },
  vchsubdealeradd1: {
    type: String,
    trim: true,
  },
  vchsubdealeradd2: {
    type: String,
    trim: true,
  },
  vchsubdealeradd3: {
    type: String,
    trim: true,
  },
  
  // Invoice Details
  isinvoice: {
    type: String,
    trim: true,
    enum: ['Yes', 'No', 'yes', 'no'],
    default: 'No',
  },
  vchgrno: {
    type: String,
    trim: true,
  },
  
  // Transport Details
  vchtransport: {
    type: String,
    trim: true,
  },
  vchtruckno: {
    type: String,
    trim: true,
  },
  vchdrivername: {
    type: String,
    trim: true,
  },
  vchdrivermobile: {
    type: String,
    trim: true,
  },
  vchdestination: {
    type: String,
    trim: true,
  },
  
  // Payment Terms
  vchpymtterms: {
    type: String,
    trim: true,
  },
  vchotherref: {
    type: String,
    trim: true,
  },
  
  // Quantity Units
  vchqtunit: {
    type: String,
    trim: true,
  },
  vchqtunit2: {
    type: String,
    trim: true,
  },
  
  // Amount Details
  vchgoodsamt: {
    type: Number,
    default: 0,
  },
  vchamount: {
    type: Number,
    default: 0,
    required: true,
  },
  
  // Narration and Remarks
  vchnarration: {
    type: String,
    trim: true,
  },
  remarks: {
    type: String,
    trim: true,
  },
  
  // Additional Custom Fields (other1 to other10)
  other1: { type: String, trim: true },
  other2: { type: String, trim: true },
  other3: { type: String, trim: true },
  other4: { type: String, trim: true },
  other5: { type: String, trim: true },
  other6: { type: String, trim: true },
  other7: { type: String, trim: true },
  other8: { type: String, trim: true },
  other9: { type: String, trim: true },
  other10: { type: String, trim: true },
  
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

// Indexes for better query performance
voucherMasterSchema.index({ cmpcode: 1, vchdate: -1 });
voucherMasterSchema.index({ cmpcode: 1, vchpartyguid: 1 });
voucherMasterSchema.index({ cmpcode: 1, vchtype: 1, vchdate: -1 });
voucherMasterSchema.index({ ledgerId: 1, vchdate: -1 });
voucherMasterSchema.index({ companyId: 1, vchdate: -1 });

const VoucherMaster = mongoose.model('VoucherMaster', voucherMasterSchema);

export default VoucherMaster;

