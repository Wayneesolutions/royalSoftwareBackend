import Stock from '../models/stock/stockModel.js';
import Product from '../models/product/productModel.js';
import mongoose from 'mongoose';

// Generate unique stock ID
const generateStockId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `STK-${timestamp}-${random}`.toUpperCase();
};

// Get stock summary for dashboard
export const getStockSummary = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    // Get overall stock summary
    const summary = await Stock.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          totalStockValue: { $sum: '$totalValue' },
          totalCurrentStock: { $sum: '$currentStock' },
          safeStockCount: {
            $sum: { $cond: [{ $eq: ['$stockStatus', 'safe'] }, 1, 0] }
          },
          lowStockCount: {
            $sum: { $cond: [{ $eq: ['$stockStatus', 'low'] }, 1, 0] }
          },
          criticalStockCount: {
            $sum: { $cond: [{ $eq: ['$stockStatus', 'critical'] }, 1, 0] }
          },
          outOfStockCount: {
            $sum: { $cond: [{ $eq: ['$stockStatus', 'out_of_stock'] }, 1, 0] }
          },
          overstockCount: {
            $sum: { $cond: [{ $eq: ['$stockStatus', 'overstock'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily stock data for the last 7 days
    const dailyStockData = await Stock.aggregate([
      { $match: { companyId: new mongoose.Types.ObjectId(companyId), isActive: true } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$lastUpdated"
            }
          },
          safeStock: {
            $sum: { $cond: [{ $eq: ['$stockStatus', 'safe'] }, 1, 0] }
          },
          pendingStock: {
            $sum: { 
              $cond: [
                { $in: ['$stockStatus', ['low', 'critical', 'out_of_stock']] }, 
                1, 
                0
              ] 
            }
          },
          totalStock: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 7 }
    ]);

    // Format daily data for chart
    const chartData = dailyStockData.reverse().map((item, index) => {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const date = new Date(item._id);
      const dayName = days[date.getDay()];
      
      return {
        day: dayName,
        safe: item.safeStock,
        pending: item.pendingStock,
        total: item.totalStock
      };
    });

    // If we don't have 7 days of data, fill with current data
    while (chartData.length < 7) {
      const currentData = summary[0] || { safeStockCount: 0, lowStockCount: 0, criticalStockCount: 0, outOfStockCount: 0 };
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayName = days[chartData.length];
      
      chartData.push({
        day: dayName,
        safe: currentData.safeStockCount,
        pending: currentData.lowStockCount + currentData.criticalStockCount + currentData.outOfStockCount,
        total: currentData.safeStockCount + currentData.lowStockCount + currentData.criticalStockCount + currentData.outOfStockCount
      });
    }

    // Calculate percentages
    const totalProducts = summary[0]?.totalProducts || 0;
    const safePercentage = totalProducts > 0 ? Math.round((summary[0]?.safeStockCount / totalProducts) * 100) : 0;
    const pendingPercentage = totalProducts > 0 ? Math.round(((summary[0]?.lowStockCount + summary[0]?.criticalStockCount + summary[0]?.outOfStockCount) / totalProducts) * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        summary: summary[0] || {
          totalProducts: 0,
          totalStockValue: 0,
          totalCurrentStock: 0,
          safeStockCount: 0,
          lowStockCount: 0,
          criticalStockCount: 0,
          outOfStockCount: 0,
          overstockCount: 0
        },
        chartData,
        percentages: {
          safe: safePercentage,
          pending: pendingPercentage
        }
      },
      message: 'Stock summary retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting stock summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stock summary',
      error: error.message
    });
  }
};

// Get all stocks with filtering and pagination
export const getStocks = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      page = 1,
      limit = 20,
      search,
      category,
      stockStatus,
      sortBy = 'productName',
      sortOrder = 'asc'
    } = req.query;

    // Build query
    let query = { companyId, isActive: true };
    
    if (stockStatus) {
      query.stockStatus = stockStatus;
    }
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { productName: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { stockId: { $regex: search, $options: 'i' } }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query
    const stocks = await Stock.find(query)
      .populate('productId', 'name code category')
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const totalStocks = await Stock.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        stocks,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalStocks / parseInt(limit)),
          totalStocks,
          hasNext: skip + stocks.length < totalStocks,
          hasPrev: parseInt(page) > 1
        }
      },
      message: 'Stocks retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting stocks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stocks',
      error: error.message
    });
  }
};

// Get stock details
export const getStockDetails = async (req, res) => {
  try {
    const { stockId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const stock = await Stock.findOne({ 
      _id: stockId, 
      companyId, 
      isActive: true 
    })
      .populate('productId', 'name code category description')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    res.status(200).json({
      success: true,
      data: stock,
      message: 'Stock details retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting stock details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve stock details',
      error: error.message
    });
  }
};

// Create or update stock
export const createOrUpdateStock = async (req, res) => {
  try {
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const {
      productId,
      currentStock,
      safeStock,
      minimumStock,
      maximumStock,
      unitPrice,
      warehouse,
      location,
      notes
    } = req.body;

    // Validate required fields
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if stock already exists for this product
    let stock = await Stock.findOne({
      companyId,
      productId,
      isActive: true
    });

    if (stock) {
      // Update existing stock
      stock.currentStock = currentStock || stock.currentStock;
      stock.safeStock = safeStock || stock.safeStock;
      stock.minimumStock = minimumStock || stock.minimumStock;
      stock.maximumStock = maximumStock || stock.maximumStock;
      stock.unitPrice = unitPrice || stock.unitPrice;
      stock.warehouse = warehouse || stock.warehouse;
      stock.location = location || stock.location;
      stock.notes = notes || stock.notes;
      stock.updatedBy = userId;
      
      await stock.save();
    } else {
      // Create new stock
      stock = new Stock({
        stockId: generateStockId(),
        companyId,
        productId,
        productName: product.name,
        productCode: product.code,
        category: product.category,
        currentStock: currentStock || 0,
        safeStock: safeStock || 0,
        minimumStock: minimumStock || 0,
        maximumStock: maximumStock || 0,
        unitPrice: unitPrice || product.price || 0,
        warehouse: warehouse || 'Main Warehouse',
        location: location || 'A-01',
        notes,
        createdBy: userId
      });

      await stock.save();
    }

    // Populate the response
    await stock.populate([
      { path: 'productId', select: 'name code category' },
      { path: 'createdBy', select: 'name email' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.status(200).json({
      success: true,
      data: stock,
      message: stock.isNew ? 'Stock created successfully' : 'Stock updated successfully'
    });
  } catch (error) {
    console.error('Error creating/updating stock:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create/update stock',
      error: error.message
    });
  }
};

// Update stock quantity
export const updateStockQuantity = async (req, res) => {
  try {
    const { stockId } = req.params;
    const userId = req.user.userDetails._id;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const { quantity, movementType, notes } = req.body;

    // Validate required fields
    if (!quantity || !movementType) {
      return res.status(400).json({
        success: false,
        message: 'Quantity and movement type are required'
      });
    }

    // Get stock
    const stock = await Stock.findOne({ 
      _id: stockId, 
      companyId, 
      isActive: true 
    });

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: 'Stock not found'
      });
    }

    // Update stock
    await stock.updateStock(quantity, movementType, userId);

    // Add notes if provided
    if (notes) {
      stock.notes = (stock.notes || '') + `\n${new Date().toISOString()}: ${notes}`;
      await stock.save();
    }

    // Populate the response
    await stock.populate([
      { path: 'productId', select: 'name code category' },
      { path: 'updatedBy', select: 'name email' }
    ]);

    res.status(200).json({
      success: true,
      data: stock,
      message: 'Stock quantity updated successfully'
    });
  } catch (error) {
    console.error('Error updating stock quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stock quantity',
      error: error.message
    });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    
    const lowStockItems = await Stock.find({
      companyId,
      isActive: true,
      stockStatus: { $in: ['low', 'critical', 'out_of_stock'] }
    })
      .populate('productId', 'name code category')
      .sort({ stockStatus: 1, currentStock: 1 });

    res.status(200).json({
      success: true,
      data: { lowStockItems },
      message: 'Low stock alerts retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting low stock alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve low stock alerts',
      error: error.message
    });
  }
};
