import mongoose from "mongoose";

const dispatchItemSchema = new mongoose.Schema(
  {
    itemName: { type: String, trim: true },
    hsnCode: { type: String, trim: true },
    unit: { type: String, trim: true },
    orderedQty: { type: Number, default: 0 },
    dispatchedQty: { type: Number, default: 0 },
    pendingQty: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const tallyDispatchSchema = new mongoose.Schema(
  {
    orderguid: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    cmpcode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    orderNumber: {
      type: String,
      trim: true,
    },
    orderDate: {
      type: Date,
    },
    ledgerguid: {
      type: String,
      trim: true,
      index: true,
    },
    partyName: {
      type: String,
      trim: true,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    dispatchStatus: {
      type: String,
      enum: ['pending', 'fully_dispatched'],
      default: 'pending',
    },
    items: [dispatchItemSchema],
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
    },
    ledgerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ledger',
    },
    tallySyncAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Unique: one dispatch record per orderguid + cmpcode
tallyDispatchSchema.index({ orderguid: 1, cmpcode: 1 }, { unique: true });
tallyDispatchSchema.index({ ledgerguid: 1, cmpcode: 1 });
tallyDispatchSchema.index({ dispatchStatus: 1 });

const TallyDispatch = mongoose.model('TallyDispatch', tallyDispatchSchema);

export default TallyDispatch;
