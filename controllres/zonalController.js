import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';
import mongoose from 'mongoose';

// Get Zonal dashboard data with team overview and sales
export const getZonalDashboardData = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    
    // Get the Zonal user's hierarchy information
    const zonalUser = await User.findById(userId).populate('hierarchy.parentUser');
    
    if (!zonalUser) {
      return res.status(404).json({
        success: false,
        message: 'Zonal user not found'
      });
    }

    // Get all users under this Zonal user's hierarchy
    // Since the current hierarchy structure has all users under admin,
    // we'll find users with roles that should be under zonal (RSM, ASM, Salesman, Dealers, etc.)
    // and hierarchy level greater than zonal user's level
    const teamUsers = await User.find({
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId }, // Exclude current zonal user
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: zonalUser.hierarchy?.level || 0 },
          role: { $in: ['rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).select('_id name email role hierarchy');


    // Count users by role
    const roleCounts = {
      rsm: 0,
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
          teamUsers: teamUsers.slice(0, 10) // Show first 10 team members
        },
        salesSummary,
        monthlySales,
        salesByRole: salesByRoleObj,
        topPerformers,
        recentOrders
      },
      message: 'Zonal dashboard data retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting Zonal dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve Zonal dashboard data',
      error: error.message
    });
  }
};

// Get team members for Zonal user
export const getZonalTeamMembers = async (req, res) => {
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
          role: { $in: ['rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
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
      .select('_id name email role hierarchy companies')
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
          orderCount: { $sum: 1 }
        }
      }
    ]);

    // Map sales data to team members
    const membersWithSales = teamMembers.map(member => {
      const salesData = memberSalesData.find(s => s._id.toString() === member._id.toString());
      return {
        ...member.toObject(),
        salesData: salesData || { totalSales: 0, orderCount: 0 }
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

// Get recent activity for Zonal user based on specific company
export const getZonalRecentActivity = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const { limit = 20, days = 7 } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get team user IDs
    const teamUsers = await User.find({
      'defaultCompany': companyId,
      isActive: true,
      _id: { $ne: userId },
      $or: [
        { 'hierarchy.parentUser': userId },
        { 
          'hierarchy.level': { $gt: 0 },
          role: { $in: ['rsm', 'asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).select('_id name role');

    const teamUserIds = teamUsers.map(user => user._id);

    // Get recent orders
    const recentOrders = await Order.find({
      companyId,
      createdBy: { $in: teamUserIds },
      isActive: true,
      createdAt: { $gte: startDate, $lte: endDate }
    })
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit) / 2);

    // Get recent user activities (logins, profile updates, etc.)
    const recentUserActivities = await User.find({
      'defaultCompany': companyId,
      _id: { $in: teamUserIds },
      lastLogin: { $gte: startDate, $lte: endDate }
    })
      .select('_id name role lastLogin')
      .sort({ lastLogin: -1 })
      .limit(parseInt(limit) / 2);

    // Format activities
    const activities = [];

    // Add order activities
    recentOrders.forEach(order => {
      activities.push({
        id: `order_${order._id}`,
        type: 'order',
        title: getOrderActivityTitle(order.status),
        description: `${order.createdBy.name} (${order.createdBy.role}) - Order #${order.orderNumber}`,
        amount: order.finalAmount,
        status: order.status,
        timestamp: order.createdAt,
        user: order.createdBy,
        icon: getOrderIcon(order.status),
        color: getOrderColor(order.status)
      });
    });

    // Add user login activities
    recentUserActivities.forEach(user => {
      activities.push({
        id: `login_${user._id}`,
        type: 'login',
        title: 'User Login',
        description: `${user.name} (${user.role}) logged in`,
        timestamp: user.lastLogin,
        user: { name: user.name, role: user.role },
        icon: 'log-in',
        color: '#10B981'
      });
    });

    // Sort all activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Limit final results
    const limitedActivities = activities.slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        activities: limitedActivities,
        totalActivities: activities.length,
        dateRange: {
          startDate,
          endDate,
          days: parseInt(days)
        },
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

// Helper functions for activity formatting
const getOrderActivityTitle = (status) => {
  const statusMap = {
    'pending': 'New Order Created',
    'confirmed': 'Order Confirmed',
    'processing': 'Order Processing',
    'shipped': 'Order Shipped',
    'delivered': 'Order Delivered',
    'cancelled': 'Order Cancelled'
  };
  return statusMap[status] || 'Order Updated';
};

const getOrderIcon = (status) => {
  const iconMap = {
    'pending': 'time',
    'confirmed': 'checkmark-circle',
    'processing': 'refresh',
    'shipped': 'car',
    'delivered': 'checkmark-done',
    'cancelled': 'close-circle'
  };
  return iconMap[status] || 'document';
};

const getOrderColor = (status) => {
  const colorMap = {
    'pending': '#F59E0B',
    'confirmed': '#3B82F6',
    'processing': '#8B5CF6',
    'shipped': '#06B6D4',
    'delivered': '#10B981',
    'cancelled': '#EF4444'
  };
  return colorMap[status] || '#6B7280';
};