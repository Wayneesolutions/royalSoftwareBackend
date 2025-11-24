import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    productCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      required: true,
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
      required: true,
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
    strict: false, 
  }
);

// Index for better query performance
productSchema.index({ companyId: 1, isActive: 1 });
productSchema.index({ productCode: 1 });
productSchema.index({ productName: 1 });
productSchema.index({ category: 1 });

// Virtual for selling price after discount
productSchema.virtual('sellingPrice').get(function() {
  return this.price;
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
  }).sort({ productName: 1 });
};

const Product = mongoose.model('Product', productSchema);

export default Product;
