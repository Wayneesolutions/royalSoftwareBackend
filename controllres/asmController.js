// backend/controllres/asmController.js
import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';
import mongoose from 'mongoose';

// Get ASM dashboard data
export const getASMDashboardData = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    // Find all team users under this ASM
    const teamUsers = await User.find({
      company: companyId,
      reportingManager: userId
    }).select('_id name role');

    // Get role counts
    const roleCounts = {
      salesman: teamUsers.filter(user => user.role === 'salesman').length,
      dealers: teamUsers.filter(user => user.role === 'dealers').length,
      distibutors: teamUsers.filter(user => user.role === 'distibutors').length,
      subdealer: teamUsers.filter(user => user.role === 'subdealer').length
    };

    const teamUserIds = teamUsers.map(user => user._id);

    // Get sales summary
    const salesSummary = await Order.aggregate([
      {
        $match: {
          createdBy: { $in: teamUserIds },
          status: { $in: ['completed', 'approved'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$finalAmount' },
          totalOrders: { $sum: 1 },
          pendingOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'pending'] }, 1, 0]
            }
          },
          completedOrders: {
            $sum: {
              $cond: [{ $in: ['$status', ['completed', 'approved']] }, 1, 0]
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
      createdBy: { $in: teamUserIds }
    })
    .populate('createdBy', 'name role')
    .sort({ createdAt: -1 })
    .limit(10);

    // Get top performers
    const topPerformers = await Order.aggregate([
      {
        $match: {
          createdBy: { $in: teamUserIds },
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
      },
      {
        $limit: 5
      }
    ]);

    // Get team performance data
    const teamPerformance = await Order.aggregate([
      {
        $match: {
          createdBy: { $in: teamUserIds },
          status: { $in: ['completed', 'approved'] }
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
          _id: '$_id',
          name: '$user.name',
          role: '$user.role',
          salesData: {
            totalSales: '$totalSales',
            orderCount: '$orderCount',
            monthlySales: '$monthlySales'
          },
          isActive: {
            $cond: [
              {
                $gte: ['$user.lastLogin', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)]
              },
              true,
              false
            ]
          }
        }
      },
      {
        $sort: { 'salesData.totalSales': -1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        teamOverview: {
          totalTeamMembers: teamUsers.length,
          roleCounts,
          activeMembers: teamUsers.filter(user => 
            user.lastLogin && new Date(user.lastLogin) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          ).length
        },
        salesSummary: {
          totalSales: salesData.totalSales,
          totalOrders: salesData.totalOrders,
          pendingOrders: salesData.pendingOrders,
          completedOrders: salesData.completedOrders
        },
        topPerformers,
        recentOrders,
        teamPerformance
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

    // Build query
    const query = {
      company: companyId,
      reportingManager: userId
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
          createdBy: { $in: teamUserIds },
          status: { $in: ['completed', 'approved'] }
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

    // Find all team users under this ASM
    const teamUsers = await User.find({
      company: companyId,
      reportingManager: userId
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
