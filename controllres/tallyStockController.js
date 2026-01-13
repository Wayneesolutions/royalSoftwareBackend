import Product from '../models/product/productModel.js';
import Company from '../models/company/companyModel.js';
import Sales from '../models/sales/salesModel.js';
import InventoryEntries from '../models/inventory/inventoryEntriesModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Sync stock from Tally (update product stock levels)
 * @route   POST /api/v1/tally/stock/sync
 * @access  Public (No auth - Tally integration)
 */
export const syncStockFromTally = async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
      }
    }

    const stockDataArray = Array.isArray(body) ? body : [body];
    const results = [];

    for (const data of stockDataArray) {
      const {
        companyguid, cmpcode, itemguid, itemname, itemsku, itemcategory,
        currentStock, openingBalance, stdSaleRate, stdPurcRate, itemHsn, itemHsnDesc
      } = data;

      if (!cmpcode || !itemguid) {
        results.push({ success: false, message: 'Missing required fields: cmpcode and itemguid are required', data });
        continue;
      }

      try {
        // Find company by companyCode (cmpcode) only - matching sales controller logic
        const company = await Company.findOne({ 
          companyCode: cmpcode, 
          isActive: true 
        });
        
        if (!company) {
          results.push({ success: false, message: `Company not found for cmpcode: ${cmpcode}`, data });
          continue;
        }

        // Find or create product by itemguid
        const productPayload = {
          companyId: company._id,
          companyCode: cmpcode,
          name: itemname || 'Unknown Product',
          productName: itemname || 'Unknown Product',
          partNo: itemsku || itemguid,
          productCode: itemsku || itemguid,
          category: itemcategory || 'Uncategorized',
          stock: currentStock !== undefined ? currentStock : (openingBalance || 0),
          openingBalance: openingBalance || 0,
          stdSaleRate: stdSaleRate || 0,
          stdPurcRate: stdPurcRate || 0,
          price: stdSaleRate || 0,
          itemHsn: itemHsn || '',
          itemHsnDesc: itemHsnDesc || '',
        };

        // Use itemguid as a unique identifier for the product within the company
        // Since Product model doesn't have itemguid, we'll use productCode or partNo
        const existingProduct = await Product.findOne({
          companyId: company._id,
          $or: [
            { productCode: itemsku || itemguid },
            { partNo: itemsku || itemguid }
          ],
          isActive: true
        });

        let product;
        if (existingProduct) {
          // Update existing product
          Object.assign(existingProduct, productPayload);
          await existingProduct.save();
          product = existingProduct;
        } else {
          // Create new product
          product = await Product.create(productPayload);
        }

        results.push({ success: true, message: 'Stock synced successfully', productId: product._id, itemguid });

      } catch (error) {
        console.error('Error syncing stock entry:', error);
        results.push({ success: false, message: `Error processing stock entry: ${error.message}`, data });
      }
    }

    // Check if all results succeeded
    const allSucceeded = results.every(result => result.success === true);
    const successCount = results.filter(r => r.success === true).length;
    const failedCount = results.filter(r => r.success === false).length;
    
    const message = `Stock synchronization complete: ${successCount} succeeded, ${failedCount} failed`;
    
    return res.status(allSucceeded ? 200 : 207).json({ 
      success: allSucceeded, 
      message,
      results 
    });

  } catch (error) {
    console.error('Sync stock from Tally error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while syncing stock',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get stock summary for group user (all products in company, not filtered by ledgers)
 * @route   GET /api/v1/tally/stock/group-user
 * @access  Private (Group User)
 */
export const getStockSummaryForGroupUser = async (req, res) => {
  try {
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({ success: false, message: 'Company code (cmpcode) is required' });
    }

    const company = await Company.findOne({ companyCode: cmpcode, isActive: true });
    if (!company) {
      return res.status(404).json({ success: false, message: `Company not found for cmpcode: ${cmpcode}` });
    }

    // Get all products for the company (not filtered by ledgers - all products)
    const allProducts = await Product.find({
      companyId: company._id,
      isActive: true
    }).select('_id name productName partNo productCode category stock openingBalance').lean();

    if (allProducts.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No products found for this company',
        data: {
          STOCK_SUMMARY: [],
          SALES_REGISTER: {},
          summary: { totalSales: 0, totalStock: 0, lowStockCount: 0 }
        }
      });
    }

    // Get all itemguids from products (using productCode or partNo as itemguid)
    const itemGUIDs = allProducts
      .map(p => p.productCode || p.partNo || p._id.toString())
      .filter(Boolean);

    // Get all sales for these items (to calculate subDealerSold and lastSaleDate)
    const allSales = await Sales.find({
      companyId: company._id,
      itemguid: { $in: itemGUIDs },
      isActive: true
    })
    .populate('ledgerId', 'LedgerName LedgerMobile LedgerAddress1')
    .populate('voucherId', 'vchnumber vchdate')
    .sort({ vchdate: -1 })
    .lean();

    // Get all inventory entries to calculate current stock more accurately
    const allInventoryEntries = await InventoryEntries.find({
      companyId: company._id,
      itemguid: { $in: itemGUIDs },
      isActive: true
    }).lean();

    // Calculate stock levels from inventory entries (incoming - outgoing)
    const stockCalculations = {};
    allInventoryEntries.forEach(entry => {
      const itemKey = entry.itemguid;
      if (!stockCalculations[itemKey]) {
        stockCalculations[itemKey] = { incoming: 0, outgoing: 0 };
      }
      // Assuming positive quantities are incoming and negative are outgoing
      // Or we can check voucher type to determine
      if (entry.itemmainqty > 0) {
        stockCalculations[itemKey].incoming += entry.itemmainqty;
      } else {
        stockCalculations[itemKey].outgoing += Math.abs(entry.itemmainqty);
      }
    });

    // Build stock summary by product
    const stockByItem = {};
    const salesRegister = {};

    allProducts.forEach(product => {
      const itemKey = product.productCode || product.partNo || product._id.toString();
      
      // Get sales for this item - match by itemguid OR by productCode/partNo
      // This handles cases where sales.itemguid might be different from product.productCode
      const itemSales = allSales.filter(sale => {
        const saleItemGuid = sale.itemguid;
        return saleItemGuid === itemKey || 
               saleItemGuid === product.productCode || 
               saleItemGuid === product.partNo ||
               saleItemGuid === product._id.toString();
      });
      
      // Calculate subDealerSold (total quantity sold)
      const subDealerSold = itemSales.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
      
      // Get last sale date
      const lastSale = itemSales.length > 0 ? itemSales[0] : null;
      const lastSaleDate = lastSale && lastSale.vchdate 
        ? new Date(lastSale.vchdate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
        : null;

      // Calculate inHand stock
      // Use product.stock if available, otherwise calculate from inventory entries
      let inHand = product.stock || product.openingBalance || 0;
      if (stockCalculations[itemKey]) {
        inHand = (product.openingBalance || 0) + stockCalculations[itemKey].incoming - stockCalculations[itemKey].outgoing;
      }

      // Determine status based on stock levels and sales
      let status = 'Healthy';
      let trend = 'up';
      
      if (inHand === 0) {
        status = 'Out of Stock';
      } else if (inHand < 10) {
        status = 'Low Stock';
      } else if (inHand > 200) {
        status = 'Overstocked';
      } else if (subDealerSold > 300) {
        status = 'Fast Mover';
      }

      // Determine trend (simplified - compare recent vs older sales)
      if (itemSales.length >= 2) {
        const recentSales = itemSales.slice(0, Math.floor(itemSales.length / 2));
        const olderSales = itemSales.slice(Math.floor(itemSales.length / 2));
        const recentTotal = recentSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
        const olderTotal = olderSales.reduce((sum, s) => sum + (s.quantity || 0), 0);
        trend = recentTotal >= olderTotal ? 'up' : 'down';
      }

      stockByItem[itemKey] = {
        id: itemKey,
        productName: product.productName || product.name || 'Unknown Product',
        sku: product.productCode || product.partNo || itemKey,
        category: product.category || 'Uncategorized',
        inHand: Math.max(0, inHand), // Ensure non-negative
        subDealerSold: subDealerSold,
        lastSaleDate: lastSaleDate || 'N/A',
        trend: trend,
        status: status
      };

      // Build sales register for this item
      salesRegister[itemKey] = itemSales.map((sale, index) => {
        const ledger = sale.ledgerId || {};
        const voucher = sale.voucherId || {};
        
        return {
          id: `SR-${sale.vchguid}-${index}`,
          date: sale.vchdate 
            ? new Date(sale.vchdate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
            : 'N/A',
          subDealer: sale.ledgername || ledger.LedgerName || 'Unknown',
          location: sale.ledgeraddress || ledger.LedgerAddress1 || 'N/A',
          quantity: sale.quantity || 0,
          amount: `₹ ${(sale.amount || 0).toLocaleString('en-IN')}`,
          status: sale.status || 'Delivered',
          invoiceNo: sale.vchnumber || voucher.vchnumber || 'N/A'
        };
      });

      // Sort sales register by date (most recent first)
      salesRegister[itemKey].sort((a, b) => {
        try {
          const parseDate = (dateStr) => {
            if (dateStr === 'N/A') return new Date(0);
            const match = dateStr.match(/(\d{2}) (\w+) (\d{2})/);
            if (!match) return new Date(dateStr);
            const [, day, month, year] = match;
            const monthMap = {
              'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
              'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
            };
            return new Date(`20${year}-${monthMap[month] || '01'}-${day.padStart(2, '0')}`);
          };
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          return dateB.getTime() - dateA.getTime();
        } catch (error) {
          return 0;
        }
      });
    });

    const STOCK_SUMMARY = Object.values(stockByItem);

    // Calculate summary totals
    const totalSales = STOCK_SUMMARY.reduce((sum, item) => sum + item.subDealerSold, 0);
    const totalStock = STOCK_SUMMARY.reduce((sum, item) => sum + item.inHand, 0);
    const lowStockCount = STOCK_SUMMARY.filter(item => 
      item.status === 'Low Stock' || item.status === 'Out of Stock'
    ).length;

    return res.status(200).json({
      success: true,
      data: {
        STOCK_SUMMARY,
        SALES_REGISTER: salesRegister,
        summary: {
          totalSales,
          totalStock,
          lowStockCount
        }
      }
    });
  } catch (error) {
    console.error('Get stock summary for group user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching stock summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

