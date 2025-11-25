import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    // Stockitem Master Fields
    name: {
      type: String,
      required: true,
      trim: true,
    },
    partNo: {
      type: String,
      trim: true,
    },
    itemAlias: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    parent: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    baseUnits: {
      type: String,
      trim: true,
    },
    additionalUnits: {
      type: String,
      trim: true,
    },
    stdPurcRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    stdSaleRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    itemGstPer: {
      type: Number,
      default: 0,
      min: 0,
    },
    itemHsn: {
      type: String,
      trim: true,
    },
    itemHsnDesc: {
      type: String,
      trim: true,
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    itemOpRate: {
      type: Number,
      default: 0,
      min: 0,
    },
    companyCode: {
      type: String,
      trim: true,
    },
    isFinishItem: {
      type: Boolean,
      default: false,
    },
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
    // Legacy fields (kept for backward compatibility)
    productCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    productName: {
      type: String,
      trim: true,
    },
    subCategory: {
      type: String,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },
    gstRate: {
      type: Number,
      default: 18,
      min: 0,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
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
  },
  {
    timestamps: true,
  }
);

// Index for better query performance
productSchema.index({ companyId: 1, isActive: 1 });
productSchema.index({ productCode: 1 });
productSchema.index({ productName: 1 });
productSchema.index({ name: 1 });
productSchema.index({ partNo: 1 });
productSchema.index({ category: 1 });
productSchema.index({ companyCode: 1 });
productSchema.index({ itemHsn: 1 });

// Virtual for selling price after discount
productSchema.virtual('sellingPrice').get(function() {
  return this.stdSaleRate || this.price || 0;
});

// Method to check if product is in stock
productSchema.methods.isInStock = function(quantity = 1) {
  return this.stock >= quantity;
};

// Method to update stock
productSchema.methods.updateStock = function(quantity, operation = 'subtract') {
  if (operation === 'subtract') {
    if (this.stock < quantity) {
      throw new Error('Insufficient stock');
    }
    this.stock -= quantity;
  } else if (operation === 'add') {
    this.stock += quantity;
  }
  return this.save();
};

// Static method to get products by company
productSchema.statics.getByCompany = function(companyId, filters = {}) {
  return this.find({ 
    companyId, 
    isActive: true, 
    ...filters 
  }).sort({ name: 1, productName: 1 });
};

const Product = mongoose.model('Product', productSchema);

export default Product;
