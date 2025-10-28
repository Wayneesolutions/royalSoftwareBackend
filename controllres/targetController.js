import Target from '../models/target/targetModel.js';
import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';
import mongoose from 'mongoose';

// Get targets for current user based on hierarchy
export const getMyTargets = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const userRole = req.user.userDetails.role;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const hierarchyLevel = req.user.userDetails.hierarchy?.level || 0;

    const { period, year, month } = req.query;
    
    // Build query based on user role and hierarchy
    let query = { companyId, isActive: true };
    
    // Add period filter if provided
    if (year && month) {
      query['period.year'] = parseInt(year);
      query['period.month'] = parseInt(month);
    } else if (period) {
      const currentDate = new Date();
      query['period.year'] = currentDate.getFullYear();
      query['period.month'] = currentDate.getMonth() + 1;
    }

    // Get targets assigned to current user
    const myTargets = await Target.find({
      ...query,
      assignedTo: userId
    })
    .populate('assignedBy', 'name email role')
    .sort({ 'period.year': -1, 'period.month': -1 });

    // Get targets assigned by current user (for hierarchy management)
    const assignedTargets = await Target.find({
      ...query,
      assignedBy: userId
    })
    .populate('assignedTo', 'name email role')
    .sort({ 'period.year': -1, 'period.month': -1 });

    // Calculate achievement percentages
    const targetsWithAchievement = myTargets.map(target => {
      const achievementPercentage = target.targetAmount > 0 
        ? (target.achievedAmount / target.targetAmount) * 100 
        : 0;
      
      return {
        ...target.toObject(),
        achievementPercentage: Math.round(achievementPercentage * 100) / 100
      };
    });

    res.status(200).json({
      success: true,
      data: {
        myTargets: targetsWithAchievement,
        assignedTargets: assignedTargets
      },
      message: 'Targets retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching targets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch targets',
      error: error.message
    });
  }
};

// Get users available for target assignment based on hierarchy
export const getUsersForTargetAssignment = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const userRole = req.user.userDetails.role;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const hierarchyLevel = req.user.userDetails.hierarchy?.level || 0;


    // Define hierarchy levels for target assignment
    const hierarchyLevels = {
      'superadmin': 0,
      'admin': 1,
      'zonal': 2,
      'rsm': 3,
      'asm': 4,
      'salesman': 5,
      'dealers': 6,
      'subdealers': 7,
      'distributors': 8
    };

    const currentLevel = hierarchyLevels[userRole] || 0;
    
    // For now, let's get all active users regardless of company association
    // This is a temporary fix until company associations are properly set up
    let query = {
      isActive: true,
      _id: { $ne: userId } // Exclude current user
    };

    // Add hierarchy filter if user has hierarchy level
    if (currentLevel > 0) {
      query.$or = [
        { 'hierarchy.level': { $gt: currentLevel } },
        { 'hierarchy.parentUser': userId }
      ];
    }

    // Get users who can be assigned targets (lower in hierarchy)
    const availableUsers = await User.find(query)
    .select('_id name email role hierarchy defaultCompany companies')
    .sort({ 'hierarchy.level': 1, name: 1 });

    // Group users by role for easier selection
    const usersByRole = availableUsers.reduce((acc, user) => {
      if (!acc[user.role]) {
        acc[user.role] = [];
      }
      acc[user.role].push({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hierarchyLevel: user.hierarchy?.level || 0
      });
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: {
        users: availableUsers,
        usersByRole: usersByRole
      },
      message: 'Users for target assignment retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching users for target assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users for target assignment',
      error: error.message
    });
  }
};

// Assign targets to users
export const assignTargets = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const userRole = req.user.userDetails.role;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { targets } = req.body;


    if (!targets || !Array.isArray(targets)) {
      return res.status(400).json({
        success: false,
        message: 'Targets array is required'
      });
    }

    const assignedTargets = [];
    const errors = [];

    for (const targetData of targets) {
      try {
        const {
          assignedTo,
          targetType = 'monthly',
          period,
          targetAmount,
          targetQuantity = 0,
          notes = ''
        } = targetData;


        // Validate required fields
        if (!assignedTo || !period || !targetAmount) {
          errors.push(`Missing required fields for target assignment`);
          continue;
        }

        // Validate period
        if (!period.startDate || !period.endDate || !period.year || !period.month) {
          errors.push(`Invalid period data for user ${assignedTo}`);
          continue;
        }

        // Check if user exists (removed companyId dependency for now)
        const targetUser = await User.findOne({
          _id: assignedTo,
          isActive: true
        });

        if (!targetUser) {
          errors.push(`User ${assignedTo} not found or not active`);
          continue;
        }


        // Generate unique target ID
        const targetId = `TGT-${period.year}-${period.month.toString().padStart(2, '0')}-${assignedTo.slice(-6)}`;

        // Check if target already exists for this period
        const existingTarget = await Target.findOne({
          assignedTo,
          'period.year': period.year,
          'period.month': period.month,
          isActive: true
        });

        if (existingTarget) {
          errors.push(`Target already exists for user ${targetUser.name} for ${period.year}-${period.month}`);
          continue;
        }

        // Create new target
        // For now, use a default company ID if none is available
        // In production, you should properly set up company associations
        const targetCompanyId = companyId || new mongoose.Types.ObjectId('68f4d554e863e90829877a60'); // Default company ID
        
        const newTarget = new Target({
          targetId,
          companyId: targetCompanyId,
          assignedTo,
          assignedBy: userId,
          targetType,
          period: {
            startDate: new Date(period.startDate),
            endDate: new Date(period.endDate),
            year: period.year,
            month: period.month
          },
          targetAmount,
          targetQuantity,
          achievedAmount: 0,
          achievedQuantity: 0,
          achievementPercentage: 0,
          hierarchyLevel: targetUser.hierarchy?.level || 0,
          role: targetUser.role,
          notes,
          status: 'active',
          isActive: true
        });


        await newTarget.save();
        assignedTargets.push(newTarget);
        

      } catch (error) {
        console.error('Error creating target:', error);
        errors.push(`Error creating target: ${error.message}`);
      }
    }

    // Determine success based on whether any targets were assigned and if there are errors
    const hasErrors = errors.length > 0;
    const hasAssignedTargets = assignedTargets.length > 0;
    
    // If there are errors and no targets were assigned, return success: false
    if (hasErrors && !hasAssignedTargets) {
      return res.status(400).json({
        success: false,
        data: {
          assignedTargets: assignedTargets.length,
          targets: assignedTargets,
          errors: errors
        },
        message: `Failed to assign targets: ${errors.join(', ')}`
      });
    }
    
    // If there are some errors but some targets were assigned, return success: true with warnings
    // If no errors and targets assigned, return success: true
    res.status(200).json({
      success: true,
      data: {
        assignedTargets: assignedTargets.length,
        targets: assignedTargets,
        errors: errors
      },
      message: `Successfully assigned ${assignedTargets.length} targets${errors.length > 0 ? ` with ${errors.length} warnings` : ''}`
    });

  } catch (error) {
    console.error('Error assigning targets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign targets',
      error: error.message
    });
  }
};

// Get target performance report
export const getTargetPerformanceReport = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const userRole = req.user.userDetails.role;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { year, month, role, hierarchyLevel } = req.query;

    // Build query based on user role and permissions
    let query = { companyId, isActive: true };

    if (year) query['period.year'] = parseInt(year);
    if (month) query['period.month'] = parseInt(month);
    if (role) query.role = role;
    if (hierarchyLevel) query.hierarchyLevel = parseInt(hierarchyLevel);

    // For non-admin users, only show their targets and subordinates
    if (userRole !== 'superadmin' && userRole !== 'admin') {
      query.$or = [
        { assignedTo: userId },
        { assignedBy: userId }
      ];
    }

    // Get targets with performance data
    const targets = await Target.find(query)
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .sort({ 'period.year': -1, 'period.month': -1, 'hierarchyLevel': 1 });

    // Calculate performance metrics
    const performanceMetrics = {
      totalTargets: targets.length,
      totalTargetAmount: targets.reduce((sum, target) => sum + target.targetAmount, 0),
      totalAchievedAmount: targets.reduce((sum, target) => sum + target.achievedAmount, 0),
      averageAchievement: 0,
      targetsByRole: {},
      targetsByMonth: {},
      topPerformers: [],
      underPerformers: []
    };

    // Calculate average achievement
    if (performanceMetrics.totalTargetAmount > 0) {
      performanceMetrics.averageAchievement = 
        (performanceMetrics.totalAchievedAmount / performanceMetrics.totalTargetAmount) * 100;
    }

    // Group by role and month
    targets.forEach(target => {
      const role = target.role;
      const monthKey = `${target.period.year}-${target.period.month}`;
      
      if (!performanceMetrics.targetsByRole[role]) {
        performanceMetrics.targetsByRole[role] = {
          count: 0,
          targetAmount: 0,
          achievedAmount: 0,
          achievementPercentage: 0
        };
      }
      
      if (!performanceMetrics.targetsByMonth[monthKey]) {
        performanceMetrics.targetsByMonth[monthKey] = {
          count: 0,
          targetAmount: 0,
          achievedAmount: 0,
          achievementPercentage: 0
        };
      }

      performanceMetrics.targetsByRole[role].count++;
      performanceMetrics.targetsByRole[role].targetAmount += target.targetAmount;
      performanceMetrics.targetsByRole[role].achievedAmount += target.achievedAmount;

      performanceMetrics.targetsByMonth[monthKey].count++;
      performanceMetrics.targetsByMonth[monthKey].targetAmount += target.targetAmount;
      performanceMetrics.targetsByMonth[monthKey].achievedAmount += target.achievedAmount;
    });

    // Calculate achievement percentages
    Object.keys(performanceMetrics.targetsByRole).forEach(role => {
      const roleData = performanceMetrics.targetsByRole[role];
      roleData.achievementPercentage = roleData.targetAmount > 0 
        ? (roleData.achievedAmount / roleData.targetAmount) * 100 
        : 0;
    });

    Object.keys(performanceMetrics.targetsByMonth).forEach(month => {
      const monthData = performanceMetrics.targetsByMonth[month];
      monthData.achievementPercentage = monthData.targetAmount > 0 
        ? (monthData.achievedAmount / monthData.targetAmount) * 100 
        : 0;
    });

    // Identify top and under performers
    const targetsWithAchievement = targets.map(target => ({
      ...target.toObject(),
      achievementPercentage: target.targetAmount > 0 
        ? (target.achievedAmount / target.targetAmount) * 100 
        : 0
    }));

    performanceMetrics.topPerformers = targetsWithAchievement
      .filter(target => target.achievementPercentage >= 100)
      .sort((a, b) => b.achievementPercentage - a.achievementPercentage)
      .slice(0, 10);

    performanceMetrics.underPerformers = targetsWithAchievement
      .filter(target => target.achievementPercentage < 50)
      .sort((a, b) => a.achievementPercentage - b.achievementPercentage)
      .slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        targets: targetsWithAchievement,
        performanceMetrics
      },
      message: 'Target performance report retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching target performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch target performance report',
      error: error.message
    });
  }
};

// Update individual target
export const updateTarget = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const userRole = req.user.userDetails.role;
    const { targetId } = req.params;
    const { targetAmount, targetQuantity, notes, status } = req.body;

    // Find the target
    const target = await Target.findById(targetId);
    if (!target) {
      return res.status(404).json({
        success: false,
        message: 'Target not found'
      });
    }

    // Check permissions (only assigned by user or admin can update)
    if (target.assignedBy.toString() !== userId.toString() && 
        userRole !== 'superadmin' && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this target'
      });
    }

    // Update target fields
    if (targetAmount !== undefined) target.targetAmount = targetAmount;
    if (targetQuantity !== undefined) target.targetQuantity = targetQuantity;
    if (notes !== undefined) target.notes = notes;
    if (status !== undefined) target.status = status;
    
    target.lastUpdated = new Date();

    await target.save();

    res.status(200).json({
      success: true,
      data: target,
      message: 'Target updated successfully'
    });

  } catch (error) {
    console.error('Error updating target:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update target',
      error: error.message
    });
  }
};

// Calculate target achievements from orders (called automatically)
export const calculateTargetAchievements = async (req, res) => {
  try {
    const { companyId, year, month } = req.query;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID is required'
      });
    }

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;

    // Get all active targets for the specified period
    const targets = await Target.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      'period.year': currentYear,
      'period.month': currentMonth,
      isActive: true
    });

    let updatedCount = 0;

    for (const target of targets) {
      // Calculate achievements from approved orders
      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

      const orderStats = await Order.aggregate([
        {
          $match: {
            companyId: new mongoose.Types.ObjectId(companyId),
            createdBy: target.assignedTo,
            status: { $in: ['approved', 'sent_to_tally', 'dispatched', 'delivered'] },
            orderDate: { $gte: startDate, $lte: endDate },
            isActive: true
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$finalAmount' },
            totalQuantity: { $sum: { $sum: '$items.quantity' } }
          }
        }
      ]);

      const achievedAmount = orderStats.length > 0 ? orderStats[0].totalAmount : 0;
      const achievedQuantity = orderStats.length > 0 ? orderStats[0].totalQuantity : 0;

      // Update target achievements
      target.achievedAmount = achievedAmount;
      target.achievedQuantity = achievedQuantity;
      target.achievementPercentage = target.targetAmount > 0 
        ? (achievedAmount / target.targetAmount) * 100 
        : 0;
      target.lastUpdated = new Date();

      await target.save();
      updatedCount++;
    }

    res.status(200).json({
      success: true,
      data: {
        updatedTargets: updatedCount,
        period: { year: currentYear, month: currentMonth }
      },
      message: `Successfully calculated achievements for ${updatedCount} targets`
    });

  } catch (error) {
    console.error('Error calculating target achievements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate target achievements',
      error: error.message
    });
  }
};
