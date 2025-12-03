import mongoose from "mongoose";

const groupSchema = new mongoose.Schema(
  {
    // Tally Group Master Fields
    GroupGUID: {
      type: String,
      required: true,
      trim: true,
      index: true,
      // Note: Unique constraint is on GroupGUID + cmpcode combination (see compound index below)
    },
    GroupName: {
      type: String,
      required: true,
      trim: true,
    },
    GroupParent: {
      type: String,
      trim: true,
      default: null,
    },
    cmpcode: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    Remarks: {
      type: String,
      trim: true,
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
    // Company reference (optional, for linking to Company model)
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
    },
    // Status
    isActive: {
      type: Boolean,
      default: true,
    },
    // Tally sync information
    tallySyncStatus: {
      type: String,
      enum: ['pending', 'synced', 'failed'],
      default: 'pending',
    },
    tallySyncAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
// Unique compound index: GroupGUID + cmpcode combination must be unique
groupSchema.index({ GroupGUID: 1, cmpcode: 1 }, { unique: true });
groupSchema.index({ cmpcode: 1, isActive: 1 });
groupSchema.index({ GroupParent: 1 });

// Compound index for search operations
groupSchema.index({ GroupName: 'text', Remarks: 'text' });

const Group = mongoose.model('Group', groupSchema);

export default Group;

