// backend/controllres/asmController.js
import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';
import Target from '../models/target/targetModel.js';
import mongoose from 'mongoose';

// Get ASM dashboard data
export const getASMDashboardData = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Get the ASM user's hierarchy information
    const asmUser = await User.findById(userId).populate('hierarchy.parentUser');
    
    if (!asmUser) {
      return res.status(404).json({
        success: false,
        message: 'ASM user not found'
      });
    }

    // Get all users under this ASM user's hierarchy
    const teamUsers = await User.find({
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId }, // Exclude current ASM user
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: asmUser.hierarchy?.level || 0 },
          role: { $in: ['salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).select('_id name email role hierarchy lastLogin');

    console.log(`ASM ${userId} team users:`, teamUsers.length); // Debug log

    // Count users by role
    const roleCounts = {
      salesman: 0,
      dealers: 0,
      distibutors: 0,
      subdealer: 0
    };

    teamUsers.forEach(user => {
      if (roleCounts.hasOwnProperty(user.role)) {
        roleCounts[user.role]++;
      }
    });

    console.log('Role counts:', roleCounts); // Debug log

    const teamUserIds = teamUsers.map(user => user._id);

    // Get sales summary
    const salesSummary = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', ['confirmed', 'processing']] },
                1,
                0
              ]
            }
          },
          completedOrders: {
            $sum: {
              $cond: [
                { $in: ['$status', ['shipped', 'delivered']] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const salesData = salesSummary[0] || {
      totalSales: 0,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0
    };

    // Get recent orders
    const recentOrders = await Order.find({
      companyId,
      createdBy: { $in: teamUserIds },
      isActive: true
    })
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get top performers
    const topPerformers = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          userId: '$_id',
          userName: '$user.name',
          userRole: '$user.role',
          totalSales: 1,
          orderCount: 1
        }
      },
      {
        $sort: { totalSales: -1 }
      },
      {
        $limit: 5
      }
    ]);

    // Get team performance data
    const teamPerformance = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          createdAt: { $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)) }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          monthlySales: { $sum: '$finalAmount' },
          monthlyOrders: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          userId: '$_id',
          userName: '$user.name',
          userRole: '$user.role',
          monthlySales: 1,
          monthlyOrders: 1,
          lastLogin: '$user.lastLogin'
        }
      }
    ]);

    // Calculate active members
    const activeMembers = teamUsers.filter(user => 
      user.lastLogin && new Date(user.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    ).length;

    console.log('Active members:', activeMembers); // Debug log
    console.log('Sales data:', salesData); // Debug log

    res.status(200).json({
      success: true,
      data: {
        teamOverview: {
          totalTeamMembers: teamUsers.length,
          roleCounts,
          teamUsers: teamUsers.slice(0, 10), // Show first 10 team members
          activeMembers: activeMembers
        },
        salesSummary: {
          totalSales: salesData.totalSales || 0,
          totalOrders: salesData.totalOrders || 0,
          pendingOrders: salesData.pendingOrders || 0,
          completedOrders: salesData.completedOrders || 0
        },
        topPerformers: topPerformers || [],
        recentOrders: recentOrders || [],
        teamPerformance: teamPerformance || []
      },
      message: 'ASM dashboard data retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ASM dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ASM dashboard data',
      error: error.message
    });
  }
};

// Get ASM team members
export const getASMTeamMembers = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { limit = 50, role } = req.query;

    // Get the ASM user's hierarchy information
    const asmUser = await User.findById(userId).populate('hierarchy.parentUser');
    
    if (!asmUser) {
      return res.status(404).json({
        success: false,
        message: 'ASM user not found'
      });
    }

    // Build query for team members
    let query = {
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId }, // Exclude current ASM user
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: asmUser.hierarchy?.level || 0 },
          role: { $in: ['salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    };

    if (role && role !== 'all') {
      query.role = role;
    }

    // Get team members
    const teamMembers = await User.find(query)
      .select('name email phone role lastLogin')
      .sort({ name: 1 })
      .limit(parseInt(limit));

    // Get sales data for each team member
    const teamUserIds = teamMembers.map(member => member._id);
    
    const salesData = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 },
          monthlySales: {
            $sum: {
              $cond: [
                {
                  $gte: ['$createdAt', new Date(new Date().setDate(1))]
                },
                '$finalAmount',
                0
              ]
            }
          }
        }
      }
    ]);

    // Map sales data to team members
    const membersWithSales = teamMembers.map(member => {
      const memberSales = salesData.find(sales => sales._id.toString() === member._id.toString());
      return {
        ...member.toObject(),
        salesData: memberSales || {
          totalSales: 0,
          orderCount: 0,
          monthlySales: 0
        },
        isActive: member.lastLogin && new Date(member.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      };
    });

    res.status(200).json({
      success: true,
      data: {
        teamMembers: membersWithSales,
        totalMembers: teamMembers.length,
        roleBreakdown: {
          salesman: teamMembers.filter(m => m.role === 'salesman').length,
          dealers: teamMembers.filter(m => m.role === 'dealers').length,
          distibutors: teamMembers.filter(m => m.role === 'distibutors').length,
          subdealer: teamMembers.filter(m => m.role === 'subdealer').length
        }
      },
      message: 'ASM team members retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ASM team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ASM team members',
      error: error.message
    });
  }
};

// Get ASM team performance
export const getASMTeamPerformance = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default: // month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Find team users
    const teamUsers = await User.find({
      company: companyId,
      reportingManager: userId
    }).select('_id name role');

    const teamUserIds = teamUsers.map(user => user._id);

    // Get performance data
    const performanceData = await Order.aggregate([
      {
        $match: {
          createdBy: { $in: teamUserIds },
          createdAt: { $gte: startDate, $lte: now },
          status: { $in: ['completed', 'approved'] }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          userId: '$_id',
          userName: '$user.name',
          userRole: '$user.role',
          totalSales: 1,
          orderCount: 1
        }
      },
      {
        $sort: { totalSales: -1 }
      }
    ]);

    // Get target data for team members based on period
    const currentDate = new Date();
    let targetQuery = {
      companyId: new mongoose.Types.ObjectId(companyId),
      isActive: true,
      $or: [
        // Targets assigned TO team members (by ASM or others)
        { assignedTo: { $in: teamUserIds } },
        // Targets assigned BY the ASM to anyone
        { assignedBy: userId },
        // Targets assigned TO the ASM user
        { assignedTo: userId }
      ]
    };

    // Add period filter based on the requested period
    switch (period) {
      case 'current':
        targetQuery['period.year'] = currentDate.getFullYear();
        targetQuery['period.month'] = currentDate.getMonth() + 1;
        break;
      case 'month':
        targetQuery['period.year'] = currentDate.getFullYear();
        targetQuery['period.month'] = currentDate.getMonth() + 1;
        break;
      case 'quarter':
        // Get current quarter (3 months)
        const quarterStartMonth = Math.floor(currentDate.getMonth() / 3) * 3 + 1;
        targetQuery['period.year'] = currentDate.getFullYear();
        targetQuery['period.month'] = { $gte: quarterStartMonth, $lte: quarterStartMonth + 2 };
        break;
      case 'year':
        targetQuery['period.year'] = currentDate.getFullYear();
        break;
      default:
        targetQuery['period.year'] = currentDate.getFullYear();
        targetQuery['period.month'] = currentDate.getMonth() + 1;
    }

    // Get targets for team members
    const targets = await Target.find(targetQuery)
    .populate('assignedTo', 'name email role')
    .populate('assignedBy', 'name email role');

    console.log('ASM Target Query Debug:', {
      userId,
      companyId,
      companyIdType: typeof companyId,
      teamUserIds: teamUserIds.length,
      teamUserIdsList: teamUserIds,
      targetQuery,
      targetsFound: targets.length,
      period,
      currentDate: currentDate.toISOString()
    });

    // Also check if there are any targets at all for this company
    const allCompanyTargets = await Target.find({ 
      companyId: new mongoose.Types.ObjectId(companyId),
      isActive: true 
    }).countDocuments();
    
    console.log(`Total targets in company ${companyId}: ${allCompanyTargets}`);

    // Format targets for frontend
    const formattedTargets = targets.map(target => ({
      _id: target._id,
      userId: target.assignedTo._id,
      userName: target.assignedTo.name,
      userRole: target.assignedTo.role,
      targetAmount: target.targetAmount,
      achievedAmount: target.achievedAmount,
      targetPeriod: `${target.period.year}-${target.period.month.toString().padStart(2, '0')}`,
      startDate: target.period.startDate,
      endDate: target.period.endDate,
      status: target.status,
      achievementPercentage: target.achievementPercentage
    }));

    // Calculate totals
    const totals = performanceData.reduce((acc, member) => {
      acc.totalSales += member.totalSales;
      acc.totalOrders += member.orderCount;
      return acc;
    }, { totalSales: 0, totalOrders: 0 });

    // Get sales by role
    const salesByRole = await Order.aggregate([
      {
        $match: {
          createdBy: { $in: teamUserIds },
          createdAt: { $gte: startDate, $lte: now },
          status: { $in: ['completed', 'approved'] }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $group: {
          _id: '$user.role',
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 },
          memberCount: { $addToSet: '$createdBy' }
        }
      },
      {
        $project: {
          role: '$_id',
          totalSales: 1,
          orderCount: 1,
          memberCount: { $size: '$memberCount' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        targets: formattedTargets, // Add targets array for frontend
        period,
        dateRange: { startDate, endDate: now },
        totalSales: totals.totalSales,
        totalOrders: totals.totalOrders,
        averageOrderValue: totals.totalOrders > 0 ? totals.totalSales / totals.totalOrders : 0,
        topPerformers: performanceData.slice(0, 5),
        salesByRole,
        teamStats: {
          totalTeamMembers: teamUsers.length,
          activeMembers: performanceData.length,
          avgSalesPerMember: teamUsers.length > 0 ? totals.totalSales / teamUsers.length : 0
        }
      },
      message: 'ASM team performance data retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ASM team performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ASM team performance data',
      error: error.message
    });
  }
};

// Get recent activity for ASM team
export const getASMRecentActivity = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { limit = 20, days = 7 } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));

    // Get the ASM user's hierarchy information
    const asmUser = await User.findById(userId).populate('hierarchy.parentUser');
    
    if (!asmUser) {
      return res.status(404).json({
        success: false,
        message: 'ASM user not found'
      });
    }

    // Find all team users under this ASM
    const teamUsers = await User.find({
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId }, // Exclude current ASM user
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: asmUser.hierarchy?.level || 0 },
          role: { $in: ['salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).select('_id name role');

    const teamUserIds = teamUsers.map(user => user._id);

    // Get recent orders from team members
    const recentOrders = await Order.find({
      companyId,
      createdBy: { $in: teamUserIds },
      isActive: true,
      createdAt: { $gte: startDate, $lte: endDate }
    })
    .populate('createdBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

    // Get recent user login activities
    const recentUserActivities = await User.find({
      _id: { $in: teamUserIds },
      lastLogin: { $gte: startDate, $lte: endDate }
    })
    .select('name role lastLogin')
    .sort({ lastLogin: -1 })
    .limit(parseInt(limit));

    // Format activities
    const activities = [];

    // Add order activities
    recentOrders.forEach(order => {
      activities.push({
        id: `order_${order._id}`,
        type: 'order',
        title: getOrderActivityTitle(order.status),
        description: `Order ${order.orderNumber} by ${order.createdBy.name}`,
        timestamp: order.createdAt,
        icon: getOrderIcon(order.status),
        color: getOrderColor(order.status),
        metadata: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          amount: order.finalAmount,
          status: order.status
        }
      });
    });

    // Add user login activities
    recentUserActivities.forEach(user => {
      activities.push({
        id: `login_${user._id}`,
        type: 'login',
        title: 'User Login',
        description: `${user.name} (${getRoleDisplayName(user.role)}) logged in`,
        timestamp: user.lastLogin,
        icon: 'log-in-outline',
        color: '#F59E0B',
        metadata: {
          userId: user._id,
          userName: user.name,
          userRole: user.role
        }
      });
    });

    // Sort activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const limitedActivities = activities.slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities: limitedActivities,
        totalActivities: activities.length,
        dateRange: { startDate, endDate, days: parseInt(days) },
        teamStats: { 
          totalTeamMembers: teamUsers.length, 
          activeMembers: recentUserActivities.length 
        }
      },
      message: 'ASM recent activity retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting ASM recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve ASM recent activity',
      error: error.message
    });
  }
};

// Helper functions
const getOrderActivityTitle = (status) => {
  const titles = {
    'pending': 'Order Pending',
    'approved': 'Order Approved',
    'rejected': 'Order Rejected',
    'completed': 'Order Completed',
    'cancelled': 'Order Cancelled'
  };
  return titles[status] || 'Order Updated';
};

const getOrderIcon = (status) => {
  const icons = {
    'pending': 'time-outline',
    'approved': 'checkmark-circle-outline',
    'rejected': 'close-circle-outline',
    'completed': 'checkmark-done-outline',
    'cancelled': 'ban-outline'
  };
  return icons[status] || 'document-outline';
};

const getOrderColor = (status) => {
  const colors = {
    'pending': '#F59E0B',
    'approved': '#10B981',
    'rejected': '#EF4444',
    'completed': '#3B82F6',
    'cancelled': '#6B7280'
  };
  return colors[status] || '#6B7280';
};

const getRoleDisplayName = (role) => {
  const names = {
    'salesman': 'Salesman',
    'dealers': 'Dealer',
    'distibutors': 'Distributor',
    'subdealer': 'Sub-dealer'
  };
  return names[role] || role;
};

