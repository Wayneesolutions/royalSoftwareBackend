import mongoose from "mongoose";

const salesSchema = new mongoose.Schema({
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
  
  // Voucher Information (Sales Invoice)
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
  vchnumber: {
    type: String,
    trim: true,
    required: true,
    index: true,
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
  
  // Ledger/Dealer Information (Party)
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
  ledgername: {
    type: String,
    trim: true,
  },
  ledgeraddress: {
    type: String,
    trim: true,
  },
  ledgermobile: {
    type: String,
    trim: true,
  },
  ledgeremail: {
    type: String,
    trim: true,
  },
  
  // Item/Product Information
  itemguid: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  inventoryEntryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryEntries',
    required: true,
    index: true,
  },
  itemname: {
    type: String,
    trim: true,
    required: true,
  },
  itemsku: {
    type: String,
    trim: true,
  },
  itemcategory: {
    type: String,
    trim: true,
  },
  
  // Quantity Details
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  unit: {
    type: String,
    trim: true,
  },
  
  // Rate and Amount
  rate: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  amount: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
  },
  
  // Payment Information
  paymentMode: {
    type: String,
    enum: ['Cash', 'Credit', 'UPI', 'Bank Transfer', 'Cheque', 'Other'],
    default: 'Credit',
  },
  paymentTerms: {
    type: String,
    trim: true,
  },
  
  // Status
  status: {
    type: String,
    enum: ['Completed', 'Pending', 'Cancelled', 'Returned'],
    default: 'Completed',
  },
  
  // Additional Fields
  description: {
    type: String,
    trim: true,
  },
  remarks: {
    type: String,
    trim: true,
  },
  
  // Tally Sync Information
  syncedFromTally: {
    type: Boolean,
    default: false,
  },
  syncDate: {
    type: Date,
  },
  
  // Timestamps
  isActive: {
    type: Boolean,
    default: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queries
salesSchema.index({ cmpcode: 1, ledgerguid: 1, vchdate: -1 });
salesSchema.index({ cmpcode: 1, itemguid: 1, vchdate: -1 });
salesSchema.index({ companyId: 1, ledgerId: 1, vchdate: -1 });
salesSchema.index({ companyId: 1, itemguid: 1, vchdate: -1 });
salesSchema.index({ vchguid: 1, itemguid: 1 }); // Unique combination for sales entry

// Pre-save middleware to update updatedAt
salesSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Sales = mongoose.model('Sales', salesSchema);

export default Sales;

