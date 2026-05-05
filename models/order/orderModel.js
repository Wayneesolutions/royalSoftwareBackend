import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Made optional to support orders without registered customers
  },
  customerName: {
    type: String,
    required: true
  },
  customerEmail: {
    type: String,
    required: false // Made optional for walk-in customers
  },
  customerMobile: {
    type: String,
    required: false // Made optional for walk-in customers
  },
  customerAddress: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  // Dealer information
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  dealerName: {
    type: String,
    required: false
  },
  // Sub-dealer information
  // Note: subDealerId can reference either SubDealer model (primary) or User model (fallback for backward compatibility)
  subDealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Schema ref is 'User' for backward compatibility, but actual lookup checks SubDealer model first
    required: false
  },
  subDealerName: {
    type: String,
    required: false
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    productName: {
      type: String,
      required: true
    },
    productCode: String,
    quantity: {
      type: Number,
      required: true,
      min: 0.001
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0
    },
    tax: {
      type: Number,
      default: 0,
      min: 0
    },
    gstRate: {
      type: Number,
      default: 0,
      min: 0
    },
    taxType: {
      type: String,
      enum: ['INTRA_STATE', 'INTER_STATE', 'UNKNOWN'],
      default: 'UNKNOWN'
    },
    taxableValue: {
      type: Number,
      default: 0,
      min: 0
    },
    cgstRate: {
      type: Number,
      default: 0,
      min: 0
    },
    cgstAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    sgstRate: {
      type: Number,
      default: 0,
      min: 0
    },
    sgstAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    igstRate: {
      type: Number,
      default: 0,
      min: 0
    },
    igstAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalTaxAmount: {
      type: Number,
      default: 0,
      min: 0
    }
  }],
  orderDate: {
    type: Date,
    default: Date.now
  },
  deliveryDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'approved', 'sent_to_tally', 'dispatched', 'delivered', 'cancelled', 'returned'],
    default: 'draft'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  discountAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  taxableValueTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  cgstTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  sgstTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  igstTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  sellerState: {
    type: String
  },
  buyerState: {
    type: String
  },
  gstType: {
    type: String,
    enum: ['INTRA_STATE', 'INTER_STATE', 'UNKNOWN'],
    default: 'UNKNOWN'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'refunded'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'cheque', 'bank_transfer', 'upi', 'card', 'credit', 'other'],
    default: 'cash'
  },
  // Category: 'sale' = company selling to dealer, 'purchase' = dealer buying from company
  orderCategory: {
    type: String,
    enum: ['sale', 'purchase'],
    default: 'sale'
  },
  modeSelection: {
    type: String
  },
  mode: {
    type: String
  },
  termsOfPayment: {
    type: String
  },
  otherReference: {
    type: String
  },
  termsOfDelivery1: {
    type: String
  },
  termsOfDelivery2: {
    type: String
  },
  notes: {
    type: String
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date
  },
  approvalNotes: {
    type: String
  },
  // Approval workflow tracking
  approvalHistory: [{
    approverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    approverName: String,
    approverRole: String,
    action: {
      type: String,
      enum: ['approved', 'rejected', 'pending'],
      required: true
    },
    notes: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  // Next approver in hierarchy
  nextApprover: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Tally integration
  tallyGUID: String,
  tallyVoucherNumber: String,
  tallyErrorCode: String,
  tallyErrorMessage: String,
  tallySyncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending'
  },
  tallySyncAt: Date,
  tallyResponseAt: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  // Tracking information
  trackingNumber: String,
  shippingAddress: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  // Flag to indicate if shipping address is manually entered (not from subdealer)
  isManualShippingAddress: {
    type: Boolean,
    default: false
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for better query performance
orderSchema.index({ companyId: 1, status: 1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ orderDate: -1 });
orderSchema.index({ createdBy: 1 });

// Pre-save middleware to update updatedAt
orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for order age
orderSchema.virtual('orderAge').get(function() {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Method to calculate totals
orderSchema.methods.calculateTotals = function() {
  let totalAmount = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let totalTaxableValue = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  this.items.forEach(item => {
    const lineBase = item.quantity * item.unitPrice;
    const itemDiscount = (lineBase * (item.discount || 0)) / 100;
    const taxableValue = item.taxableValue || (lineBase - itemDiscount);
    const cgstAmount = item.cgstAmount || 0;
    const sgstAmount = item.sgstAmount || 0;
    const igstAmount = item.igstAmount || 0;
    const totalTaxAmount = item.totalTaxAmount || cgstAmount + sgstAmount + igstAmount;

    item.taxableValue = taxableValue;
    item.totalTaxAmount = totalTaxAmount;
    item.cgstAmount = cgstAmount;
    item.sgstAmount = sgstAmount;
    item.igstAmount = igstAmount;
    item.totalPrice = taxableValue + totalTaxAmount;

    totalAmount += lineBase;
    totalDiscount += itemDiscount;
    totalTaxableValue += taxableValue;
    totalTax += totalTaxAmount;
    cgstTotal += cgstAmount;
    sgstTotal += sgstAmount;
    igstTotal += igstAmount;
  });

  this.totalAmount = totalAmount;
  this.discountAmount = totalDiscount;
  this.taxAmount = totalTax;
  this.taxableValueTotal = totalTaxableValue;
  this.cgstTotal = cgstTotal;
  this.sgstTotal = sgstTotal;
  this.igstTotal = igstTotal;
  this.finalAmount = totalTaxableValue + totalTax;
};

// Static method to generate order number
orderSchema.statics.generateOrderNumber = async function(companyId) {
  const company = await mongoose.model('Company').findById(companyId);
  if (!company) {
    throw new Error('Company not found');
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  
  const prefix = `${company.companyCode}-ORD-${year}${month}${day}`;
  
  // Find the last order for today
  const lastOrder = await this.findOne({
    orderNumber: { $regex: `^${prefix}` }
  }).sort({ orderNumber: -1 });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('-').pop());
    sequence = lastSequence + 1;
  }

  return `${prefix}-${String(sequence).padStart(4, '0')}`;
};

const Order = mongoose.model('Order', orderSchema);

export default Order;
