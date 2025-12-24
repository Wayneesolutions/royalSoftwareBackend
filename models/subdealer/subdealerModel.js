import mongoose from "mongoose";

const subdealerSchema = new mongoose.Schema({
  // Required Fields
  SDName: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  SDType: {
    type: String,
    trim: true,
    enum: ['Sub Dealer', 'TSO'],
    required: true,
  },
  
  // Address Information
  SDAddress1: {
    type: String,
    trim: true,
  },
  SDAddress2: {
    type: String,
    trim: true,
  },
  SDAddress3: {
    type: String,
    trim: true,
  },
  SDState: {
    type: String,
    trim: true,
  },
  SDCountry: {
    type: String,
    trim: true,
    default: 'India',
  },
  SDPincode: {
    type: String,
    trim: true,
  },
  
  // Contact Information
  SDContactPerson: {
    type: String,
    trim: true,
  },
  SDMobileNo: {
    type: String,
    trim: true,
  },
  SDEmail: {
    type: String,
    trim: true,
  },
  
  // GST Information
  SDGSTNType: {
    type: String,
    trim: true,
  },
  SDGSTNNumber: {
    type: String,
    trim: true,
    uppercase: true,
  },
  
  // Group Assignment (optional)
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    index: true,
  },
  
  // Dealer Assignment (link to dealer/ledger)
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
    index: true,
  },
  
  // Company Information (auto-filled from admin's company)
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  cmpcode: {
    type: String,
    trim: true,
    index: true,
  },
  Cmpguid: {
    type: String,
    trim: true,
  },
  
  // System Fields
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { 
  timestamps: true 
});

// Indexes for better performance
subdealerSchema.index({ SDName: 1 });
subdealerSchema.index({ SDType: 1 });
subdealerSchema.index({ companyId: 1, isActive: 1 });
subdealerSchema.index({ cmpcode: 1, isActive: 1 });
subdealerSchema.index({ groupId: 1 });
subdealerSchema.index({ dealerId: 1 });
subdealerSchema.index({ dealerId: 1, companyId: 1, isActive: 1 });
subdealerSchema.index({ SDMobileNo: 1 });
subdealerSchema.index({ SDEmail: 1 });

const SubDealer = mongoose.model('SubDealer', subdealerSchema);
export default SubDealer;

