import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';
import Target from '../models/target/targetModel.js';
import mongoose from 'mongoose';

// Get RSM dashboard data with team overview
export const getRSMDashboardData = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    // Get the RSM user's hierarchy information
    const rsmUser = await User.findById(userId).populate('hierarchy.parentUser');
    
    if (!rsmUser) {
      return res.status(404).json({
        success: false,
        message: 'RSM user not found'
      });
    }

    // Get all users under this RSM user's hierarchy
    const teamUsers = await User.find({
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId }, // Exclude current RSM user
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: rsmUser.hierarchy?.level || 0 },
          role: { $in: ['asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).select('_id name email role hierarchy');

    // Count users by role
    const roleCounts = {
      asm: 0,
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

    // Get sales data for the team
    const teamUserIds = teamUsers.map(user => user._id);
    
    // Get orders created by team members
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

    // Get monthly sales trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlySales = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
          orderDate: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$orderDate' },
            month: { $month: '$orderDate' }
          },
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 }
      }
    ]);

    // Get sales by role
    const salesByRole = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] }
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
          memberCount: { $addToSet: '$user._id' }
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

    // Convert salesByRole array to object
    const salesByRoleObj = {};
    salesByRole.forEach(item => {
      salesByRoleObj[item.role] = {
        totalSales: item.totalSales,
        orderCount: item.orderCount,
        memberCount: item.memberCount
      };
    });

    // Get top performers (users with highest sales)
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

    // Get recent orders
    const recentOrders = await Order.find({
      companyId,
      createdBy: { $in: teamUserIds },
      isActive: true
    })
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(5);

    // Get team performance metrics
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

    const salesSummary = salesData[0] || {
      totalSales: 0,
      totalOrders: 0,
      pendingOrders: 0,
      completedOrders: 0
    };

    res.status(200).json({
      success: true,
      data: {
        teamOverview: {
          totalTeamMembers: teamUsers.length,
          roleCounts,
          teamUsers: teamUsers.slice(0, 10), // Show first 10 team members
          activeMembers: teamUsers.filter(user => user.lastLogin && new Date(user.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length
        },
        salesSummary,
        monthlySales,
        salesByRole: salesByRoleObj,
        topPerformers,
        recentOrders,
        teamPerformance
      },
      message: 'RSM dashboard data retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting RSM dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve RSM dashboard data',
      error: error.message
    });
  }
};

// Get team members for RSM user
export const getRSMTeamMembers = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      page = 1,
      limit = 20,
      role,
      search
    } = req.query;

    // Build query for team members
    let query = {
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId }, // Exclude current user
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: 0 },
          role: { $in: ['asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    };

    if (role) {
      query.role = role;
    }

    if (search) {
      query.$and = [
        {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } }
          ]
        }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get team members
    const teamMembers = await User.find(query)
      .select('_id name email role hierarchy lastLogin')
      .populate('hierarchy.parentUser', 'name role')
      .sort({ 'hierarchy.level': 1, name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMembers = await User.countDocuments(query);

    // Get sales data for each team member
    const teamMemberIds = teamMembers.map(member => member._id);
    
    const memberSalesData = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamMemberIds },
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
                { $gte: ['$createdAt', new Date(new Date().setMonth(new Date().getMonth() - 1))] },
                '$finalAmount',
                0
              ]
            }
          },
          monthlyOrders: {
            $sum: {
              $cond: [
                { $gte: ['$createdAt', new Date(new Date().setMonth(new Date().getMonth() - 1))] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    // Map sales data to team members
    const membersWithSales = teamMembers.map(member => {
      const salesData = memberSalesData.find(s => s._id.toString() === member._id.toString());
      return {
        ...member.toObject(),
        salesData: salesData || { 
          totalSales: 0, 
          orderCount: 0, 
          monthlySales: 0, 
          monthlyOrders: 0 
        },
        isActive: member.lastLogin && new Date(member.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      };
    });

    res.status(200).json({
      success: true,
      data: {
        teamMembers: membersWithSales,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalMembers / parseInt(limit)),
          totalMembers,
          hasNext: skip + teamMembers.length < totalMembers,
          hasPrev: parseInt(page) > 1
        }
      },
      message: 'Team members retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting team members:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve team members',
      error: error.message
    });
  }
};

// Get team performance analytics
export const getRSMTeamPerformance = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { period = 'month' } = req.query;

    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    // Get team user IDs
    const teamUsers = await User.find({
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId },
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: 0 },
          role: { $in: ['asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).select('_id name role');

    const teamUserIds = teamUsers.map(user => user._id);

    // Get performance data
    const performanceData = await Order.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          createdBy: { $in: teamUserIds },
          isActive: true,
          status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$createdBy',
          totalSales: { $sum: '$finalAmount' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$finalAmount' }
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
          orderCount: 1,
          avgOrderValue: 1,
          lastLogin: '$user.lastLogin'
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
        // Targets assigned TO team members (by RSM or others)
        { assignedTo: { $in: teamUserIds } },
        // Targets assigned BY the RSM to anyone
        { assignedBy: userId },
        // Targets assigned TO the RSM user
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

    console.log('RSM Target Query Debug:', {
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

    // Calculate team totals
    const teamTotals = performanceData.reduce((acc, member) => {
      acc.totalSales += member.totalSales;
      acc.totalOrders += member.orderCount;
      return acc;
    }, { totalSales: 0, totalOrders: 0 });

    res.status(200).json({
      success: true,
      data: {
        targets: formattedTargets, // Add targets array for frontend
        performanceData,
        teamTotals,
        period: {
          startDate,
          endDate,
          period
        },
        teamStats: {
          totalMembers: teamUsers.length,
          activeMembers: performanceData.length,
          avgSalesPerMember: teamTotals.totalSales / Math.max(performanceData.length, 1)
        }
      },
      message: 'Team performance data retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting team performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve team performance data',
      error: error.message
    });
  }
};

// Get recent activity for RSM team
export const getRSMRecentActivity = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { limit = 20, days = 7 } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));

    // Find all team users under this RSM
    const teamUsers = await User.find({
      $and: [
        {
          $or: [
            { defaultCompany: companyId },
            { 'companies.companyId': companyId }
          ]
        },
        {
          $or: [
            { 'hierarchy.parentUser': userId },
            { 'hierarchy.parentUser': { $in: await User.find({ 'hierarchy.parentUser': userId }).distinct('_id') } }
          ]
        }
      ]
    }).select('_id name role');

    const teamUserIds = teamUsers.map(user => user._id);

    // Get recent orders from team members
    const recentOrders = await Order.find({
      createdBy: { $in: teamUserIds },
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
        color: '#10B981',
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
      message: 'Recent activity retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve recent activity',
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
    'asm': 'Area Sales Manager',
    'salesman': 'Salesman',
    'dealers': 'Dealer',
    'distibutors': 'Distributor',
    'subdealer': 'Sub-dealer'
  };
  return names[role] || role;
};
