import mongoose from "mongoose";

const targetSchema = new mongoose.Schema({
  // Basic Information
  targetId: {
    type: String,
    required: true,
    unique: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  
  // Target Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Target Details
  targetType: {
    type: String,
    enum: ['monthly', 'quarterly', 'yearly', 'custom'],
    default: 'monthly'
  },
  period: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    year: {
      type: Number,
      required: true
    },
    month: {
      type: Number,
      required: true
    }
  },
  
  // Target Values
  targetAmount: {
    type: Number,
    required: true,
    min: 0
  },
  targetQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Achievement Tracking
  achievedAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  achievedQuantity: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Performance Metrics
  achievementPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 1000 // Allow over 100% achievement
  },
  
  // Hierarchy Information
  hierarchyLevel: {
    type: Number,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['superadmin', 'admin', 'dealers', 'subdealer', 'asm', 'rsm', 'distibutors', 'suppliers', 'salesman', 'zonal']
  },
  
  // Tally Integration
  tallyGUID: String,
  tallySyncStatus: {
    type: String,
    enum: ['pending', 'synced', 'failed'],
    default: 'pending'
  },
  tallySyncAt: Date,
  
  // Status and Metadata
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled', 'paused'],
    default: 'active'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Notes and Comments
  notes: String,
  assignmentNotes: String,
  
  // Timestamps
  assignedAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better performance
targetSchema.index({ companyId: 1, assignedTo: 1, period: 1 });
targetSchema.index({ companyId: 1, role: 1, period: 1 });
targetSchema.index({ assignedBy: 1, period: 1 });
targetSchema.index({ targetType: 1, period: 1 });

// Virtual for achievement percentage calculation
targetSchema.virtual('calculatedAchievementPercentage').get(function() {
  if (this.targetAmount > 0) {
    return Math.round((this.achievedAmount / this.targetAmount) * 100 * 100) / 100; // Round to 2 decimal places
  }
  return 0;
});

// Pre-save middleware to update achievement percentage
targetSchema.pre('save', function(next) {
  this.achievementPercentage = this.calculatedAchievementPercentage;
  this.lastUpdated = new Date();
  next();
});

// Static method to get targets by hierarchy
targetSchema.statics.getTargetsByHierarchy = function(companyId, userId, role, hierarchyLevel) {
  const query = { companyId, isActive: true };
  
  // Based on role, determine what targets to show
  switch (role) {
    case 'admin':
      // Admin sees all targets in company
      break;
    case 'zonal':
      // Zonal sees targets for RSM, ASM, Salesman, Dealer under them
      query.hierarchyLevel = { $gte: hierarchyLevel };
      break;
    case 'rsm':
      // RSM sees targets for ASM, Salesman, Dealer under them
      query.hierarchyLevel = { $gte: hierarchyLevel };
      break;
    case 'asm':
      // ASM sees targets for Salesman, Dealer under them
      query.hierarchyLevel = { $gte: hierarchyLevel };
      break;
    case 'salesman':
      // Salesman sees targets for Dealer under them
      query.hierarchyLevel = { $gte: hierarchyLevel };
      break;
    case 'dealer':
    case 'distributor':
      // Dealers see only their own targets
      query.assignedTo = userId;
      break;
    default:
      query.assignedTo = userId;
  }
  
  return this.find(query).populate('assignedTo', 'name email role').populate('assignedBy', 'name email role');
};

// Static method to assign targets down hierarchy
targetSchema.statics.assignTargetToHierarchy = async function(companyId, assignedBy, targetData, hierarchyLevel) {
  const targets = [];
  
  // Get all users in the hierarchy below the assigner
  const User = mongoose.model('User');
  const users = await User.find({
    companyId,
    hierarchyLevel: { $gte: hierarchyLevel },
    isActive: true
  }).select('_id name role hierarchyLevel');
  
  for (const user of users) {
    const target = new this({
      ...targetData,
      companyId,
      assignedTo: user._id,
      assignedBy,
      hierarchyLevel: user.hierarchyLevel,
      role: user.role,
      targetId: `${companyId}_${user._id}_${targetData.period.year}_${targetData.period.month}_${Date.now()}`
    });
    
    targets.push(target);
  }
  
  return this.insertMany(targets);
};

export default mongoose.model('Target', targetSchema);
