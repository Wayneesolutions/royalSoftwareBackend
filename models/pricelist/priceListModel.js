import mongoose from "mongoose";

const priceListSchema = new mongoose.Schema(
  {
    // Company identifier (mirrors Tally cmpcode)
    cmpcode: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },

    // Item fields (from Tally stock item master)
    itemguid: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    itemname: {
      type: String,
      trim: true,
      required: true,
    },

    // Price List fields
    plname: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    pldate: {
      type: Date,
    },
    plrate: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // Extra fields (e.g. discount adjustment, group category)
    other1: {
      type: String,
      trim: true,
    },
    other2: {
      type: String,
      trim: true,
    },

    // Company reference
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Unique constraint: one rate per item per price list per company
priceListSchema.index(
  { cmpcode: 1, itemguid: 1, plname: 1 },
  { unique: true }
);

priceListSchema.index({ companyId: 1, isActive: 1 });
priceListSchema.index({ companyId: 1, plname: 1 });
priceListSchema.index({ cmpcode: 1, plname: 1 });

const PriceList = mongoose.model("PriceList", priceListSchema);
export default PriceList;
