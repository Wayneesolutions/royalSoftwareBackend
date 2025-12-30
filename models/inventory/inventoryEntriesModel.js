import mongoose from "mongoose";

const inventoryEntriesSchema = new mongoose.Schema({
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
  
  // Item Information
  itemguid: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  
  // Quantity Details
  itemmainqty: {
    type: Number,
    default: 0,
  },
  itemaltqty: {
    type: Number,
    default: 0,
  },
  itemmainunit: {
    type: String,
    trim: true,
  },
  itemaltunit: {
    type: String,
    trim: true,
  },
  
  // Rate Details
  itemrate: {
    type: Number,
    default: 0,
  },
  itemrateunit: {
    type: String,
    trim: true,
  },
  
  // Discount and Amount
  itemdisc: {
    type: Number,
    default: 0,
  },
  itemamount: {
    type: Number,
    required: true,
    default: 0,
  },
  
  // Description
  itemdescription: {
    type: String,
    trim: true,
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
inventoryEntriesSchema.index({ cmpcode: 1, vchguid: 1 });
inventoryEntriesSchema.index({ cmpcode: 1, itemguid: 1 });
inventoryEntriesSchema.index({ voucherId: 1, itemguid: 1 });
inventoryEntriesSchema.index({ companyId: 1, voucherId: 1 });

// Note: No unique constraint - allows multiple entries for same item in one voucher
// This is correct behavior (e.g., same item at different rates, multiple line items, etc.)

const InventoryEntries = mongoose.model('InventoryEntries', inventoryEntriesSchema);

export default InventoryEntries;

