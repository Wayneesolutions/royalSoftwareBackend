import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
  // Basic Information
  stockId: {
    type: String,
    required: true,
    unique: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  
  // Stock Information
  productName: {
    type: String,
    required: true
  },
  productCode: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  
  // Stock Levels
  currentStock: {
    type: Number,
    required: true,
    default: 0
  },
  safeStock: {
    type: Number,
    required: true,
    default: 0
  },
  minimumStock: {
    type: Number,
    required: true,
    default: 0
  },
  maximumStock: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Stock Status
  stockStatus: {
    type: String,
    enum: ['safe', 'low', 'critical', 'out_of_stock', 'overstock'],
    default: 'safe'
  },
  
  // Pricing Information
  unitPrice: {
    type: Number,
    required: true,
    default: 0
  },
  totalValue: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Location Information
  warehouse: {
    type: String,
    default: 'Main Warehouse'
  },
  location: {
    type: String,
    default: 'A-01'
  },
  
  // Stock Movement Tracking
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  lastMovement: {
    type: String,
    enum: ['in', 'out', 'adjustment'],
    default: 'in'
  },
  lastMovementQuantity: {
    type: Number,
    default: 0
  },
  
  // Status and Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  notes: String,
  
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
stockSchema.index({ companyId: 1, productId: 1 });
stockSchema.index({ companyId: 1, stockStatus: 1 });
stockSchema.index({ companyId: 1, category: 1 });
stockSchema.index({ stockId: 1 });

// Virtual for stock level percentage
stockSchema.virtual('stockLevelPercentage').get(function() {
  if (this.maximumStock === 0) return 0;
  return Math.round((this.currentStock / this.maximumStock) * 100);
});

// Virtual for stock value
stockSchema.virtual('stockValue').get(function() {
  return this.currentStock * this.unitPrice;
});

// Method to update stock
stockSchema.methods.updateStock = function(quantity, movementType, updatedBy) {
  const oldStock = this.currentStock;
  
  if (movementType === 'in') {
    this.currentStock += quantity;
  } else if (movementType === 'out') {
    this.currentStock = Math.max(0, this.currentStock - quantity);
  } else if (movementType === 'adjustment') {
    this.currentStock = quantity;
  }
  
  // Update stock status
  this.updateStockStatus();
  
  // Update movement tracking
  this.lastMovement = movementType;
  this.lastMovementQuantity = Math.abs(quantity);
  this.lastUpdated = new Date();
  this.updatedBy = updatedBy;
  
  return this.save();
};

// Method to update stock status
stockSchema.methods.updateStockStatus = function() {
  if (this.currentStock === 0) {
    this.stockStatus = 'out_of_stock';
  } else if (this.currentStock <= this.minimumStock) {
    this.stockStatus = 'critical';
  } else if (this.currentStock <= this.safeStock) {
    this.stockStatus = 'low';
  } else if (this.currentStock >= this.maximumStock) {
    this.stockStatus = 'overstock';
  } else {
    this.stockStatus = 'safe';
  }
  
  // Update total value
  this.totalValue = this.currentStock * this.unitPrice;
};

// Pre-save middleware to update stock status and value
stockSchema.pre('save', function(next) {
  this.updateStockStatus();
  next();
});

const Stock = mongoose.model('Stock', stockSchema);
export default Stock;
