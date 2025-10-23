import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  productCode: {
    type: String,
    required: true,
    unique: true
  },
  productName: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  category: {
    type: String,
    required: true
  },
  subCategory: {
    type: String
  },
  brand: {
    type: String
  },
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'liter', 'piece', 'box', 'packet', 'dozen', 'meter', 'sqft']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  costPrice: {
    type: Number,
    min: 0
  },
  mrp: {
    type: Number,
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  stock: {
    current: {
      type: Number,
      default: 0,
      min: 0
    },
    minimum: {
      type: Number,
      default: 0,
      min: 0
    },
    maximum: {
      type: Number,
      default: 1000,
      min: 0
    }
  },
  images: [{
    url: String,
    alt: String,
    isPrimary: { type: Boolean, default: false }
  }],
  specifications: {
    weight: String,
    dimensions: String,
    color: String,
    material: String,
    warranty: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
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

// Index for better query performance
productSchema.index({ companyId: 1, isActive: 1 });
productSchema.index({ productCode: 1 });
productSchema.index({ productName: 1 });
productSchema.index({ category: 1 });
productSchema.index({ isAvailable: 1 });

// Virtual for selling price after discount
productSchema.virtual('sellingPrice').get(function() {
  return this.price - (this.price * this.discount / 100);
});

// Method to check if product is in stock
productSchema.methods.isInStock = function(quantity = 1) {
  return this.stock.current >= quantity;
};

// Method to update stock
productSchema.methods.updateStock = function(quantity, operation = 'subtract') {
  if (operation === 'subtract') {
    if (this.stock.current < quantity) {
      throw new Error('Insufficient stock');
    }
    this.stock.current -= quantity;
  } else if (operation === 'add') {
    this.stock.current += quantity;
  }
  return this.save();
};

// Static method to get products by company
productSchema.statics.getByCompany = function(companyId, filters = {}) {
  return this.find({ 
    companyId, 
    isActive: true, 
    ...filters 
  }).sort({ productName: 1 });
};

const Product = mongoose.model('Product', productSchema);

export default Product;
