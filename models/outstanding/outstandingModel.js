import mongoose from "mongoose";

const outstandingSchema = new mongoose.Schema({
  // Basic Information
  outstandingId: {
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
    ref: 'User'
  },
  partyName: {
    type: String
  },
  partyType: {
    type: String,
    enum: ['customer', 'dealer', 'distributor', 'supplier', 'other'],
    default: 'customer'
  },
  partyContact: {
    mobile: String,
    email: String,
    address: String
  },
  
  // Outstanding Details
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderNumber: {
    type: String
  },
  orderDate: {
    type: Date
  },
  // Tally company/ledger identifiers (for delete-and-replace sync)
  cmpcode: {
    type: String,
    trim: true,
    index: true,
  },
  ledgerguid: {
    type: String,
    trim: true,
    index: true,
  },

  // Tally Voucher Integration
  voucherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'VoucherMaster'
  },
  vchguid: {
    type: String,
    index: true
  },
  vchnumber: {
    type: String
  },
  vchdate: {
    type: Date
  },
  
  // Financial Information
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  outstandingAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  
  // Payment Terms
  paymentTerms: {
    type: String,
    enum: ['immediate', '7_days', '15_days', '30_days', '45_days', '60_days', '90_days', 'custom'],
    default: '30_days'
  },
  dueDate: {
    type: Date,
    required: true
  },
  creditLimit: {
    type: Number,
    default: 0
  },
  
  // Status and Tracking
  status: {
    type: String,
    enum: ['pending', 'overdue', 'partially_paid', 'paid', 'written_off', 'disputed'],
    default: 'pending'
  },
  daysOverdue: {
    type: Number,
    default: 0
  },
  lastPaymentDate: Date,
  lastPaymentAmount: {
    type: Number,
    default: 0
  },
  
  // Collection Information
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  collectionNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Follow-up Information
  followUpDate: Date,
  followUpNotes: String,
  nextFollowUpDate: Date,
  
  // Risk Assessment
  riskLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  riskFactors: [String],
  
  // Legal Information
  legalAction: {
    initiated: {
      type: Boolean,
      default: false
    },
    initiatedDate: Date,
    caseNumber: String,
    lawyerName: String,
    lawyerContact: String,
    status: String
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Tally Integration
  tallyGUID: String,
  tallySyncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending'
  },
  tallySyncAt: Date
}, { 
  timestamps: true 
});

// Indexes for better query performance
outstandingSchema.index({ companyId: 1, isActive: 1 });
outstandingSchema.index({ cmpcode: 1, ledgerguid: 1 });
outstandingSchema.index({ partyId: 1, status: 1 });
outstandingSchema.index({ orderId: 1 });
outstandingSchema.index({ dueDate: 1, status: 1 });
outstandingSchema.index({ outstandingAmount: 1 });
outstandingSchema.index({ daysOverdue: 1 });
outstandingSchema.index({ riskLevel: 1 });

// Virtual for calculating days overdue
outstandingSchema.virtual('calculatedDaysOverdue').get(function() {
  if (this.status === 'paid') return 0;
  const today = new Date();
  const due = new Date(this.dueDate);
  const diffTime = today - due;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Pre-save middleware to update days overdue
outstandingSchema.pre('save', function(next) {
  if (this.isModified('dueDate') || this.isModified('status')) {
    this.daysOverdue = this.calculatedDaysOverdue;
    
    // Update status based on days overdue
    if (this.status === 'pending' && this.daysOverdue > 0) {
      this.status = 'overdue';
    }
  }
  next();
});

// Static method to get outstanding summary
outstandingSchema.statics.getOutstandingSummary = async function(companyId, filters = {}) {
  const matchQuery = { companyId, isActive: true, ...filters };
  
  const summary = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$outstandingAmount' },
        totalOrders: { $sum: 1 },
        overdueCount: {
          $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
        },
        overdueAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, '$outstandingAmount', 0] }
        },
        pendingCount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        pendingAmount: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$outstandingAmount', 0] }
        },
        averageDaysOverdue: { $avg: '$daysOverdue' }
      }
    }
  ]);
  
  return summary[0] || {
    totalOutstanding: 0,
    totalOrders: 0,
    overdueCount: 0,
    overdueAmount: 0,
    pendingCount: 0,
    pendingAmount: 0,
    averageDaysOverdue: 0
  };
};

const Outstanding = mongoose.model('Outstanding', outstandingSchema);
export default Outstanding;
