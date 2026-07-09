import Sales from '../models/sales/salesModel.js';
import Company from '../models/company/companyModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import InventoryEntries from '../models/inventory/inventoryEntriesModel.js';
import User from '../models/user/userModel.js';
import Group from '../models/group/groupModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Create or update sales from Tally
 * @route   POST /api/v1/tally/sales/sync
 * @access  Public (No auth - Tally integration)
 */
export const syncSalesFromTally = async (req, res) => {
  try {
    // Parse body if it's a string (tally routes use text parser)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request body'
        });
      }
    }

    // Handle single or bulk sales data
    const salesDataArray = Array.isArray(body) ? body : [body];
    
    if (salesDataArray.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Sales data is required'
      });
    }

    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    for (const salesData of salesDataArray) {
      try {
        // Validate required fields
        if (!salesData.cmpcode || !salesData.vchguid || !salesData.ledgerguid || !salesData.itemguid) {
          results.failed++;
          results.errors.push({
            vchguid: salesData.vchguid || 'N/A',
            itemguid: salesData.itemguid || 'N/A',
            error: 'Missing required fields: cmpcode, vchguid, ledgerguid, itemguid'
          });
          continue;
        }

        // Normalize cmpcode to uppercase to match Company.companyCode storage
        const cmpcode = salesData.cmpcode.trim().toUpperCase();

        // Find company
        const company = await Company.findOne({
          companyCode: cmpcode,
          isActive: true
        });

        if (!company) {
          results.failed++;
          results.errors.push({
            vchguid: salesData.vchguid,
            itemguid: salesData.itemguid,
            error: `Company not found for cmpcode: ${cmpcode}`
          });
          continue;
        }

        // Find ledger
        const ledger = await Ledger.findOne({
          LedgerGUID: salesData.ledgerguid,
          companyId: company._id,
          isActive: true
        });

        if (!ledger) {
          results.failed++;
          results.errors.push({
            vchguid: salesData.vchguid,
            itemguid: salesData.itemguid,
            error: `Ledger not found for ledgerguid: ${salesData.ledgerguid}`
          });
          continue;
        }

        // Find voucher
        const voucher = await VoucherMaster.findOne({
          vchguid: salesData.vchguid,
          cmpcode: salesData.cmpcode,
          isActive: true
        });

        if (!voucher) {
          results.failed++;
          results.errors.push({
            vchguid: salesData.vchguid,
            itemguid: salesData.itemguid,
            error: `Voucher not found for vchguid: ${salesData.vchguid}`
          });
          continue;
        }

        // Find inventory entry
        const inventoryEntry = await InventoryEntries.findOne({
          vchguid: salesData.vchguid,
          itemguid: salesData.itemguid,
          cmpcode: salesData.cmpcode,
          isActive: true
        });

        if (!inventoryEntry) {
          results.failed++;
          results.errors.push({
            vchguid: salesData.vchguid,
            itemguid: salesData.itemguid,
            error: `Inventory entry not found for vchguid: ${salesData.vchguid}, itemguid: ${salesData.itemguid}`
          });
          continue;
        }

        // Prepare sales payload
        const salesPayload = {
          cmpcode: salesData.cmpcode,
          companyId: company._id,
          vchguid: salesData.vchguid,
          voucherId: voucher._id,
          vchnumber: salesData.vchnumber || voucher.vchnumber,
          vchdate: salesData.vchdate ? new Date(salesData.vchdate) : voucher.vchdate,
          vchtype: salesData.vchtype || voucher.vchtype,
          ledgerguid: salesData.ledgerguid,
          ledgerId: ledger._id,
          ledgername: salesData.ledgername || ledger.LedgerName,
          ledgeraddress: salesData.ledgeraddress || ledger.LedgerAddress1 || '',
          ledgermobile: salesData.ledgermobile || ledger.LedgerMobile || '',
          ledgeremail: salesData.ledgeremail || ledger.Email || '',
          itemguid: salesData.itemguid,
          inventoryEntryId: inventoryEntry._id,
          itemname: salesData.itemname || inventoryEntry.itemdescription || '',
          itemsku: salesData.itemsku || salesData.itemguid,
          itemcategory: salesData.itemcategory || '',
          quantity: salesData.quantity || inventoryEntry.itemmainqty || 0,
          unit: salesData.unit || inventoryEntry.itemmainunit || '',
          rate: salesData.rate || inventoryEntry.itemrate || 0,
          discount: salesData.discount || inventoryEntry.itemdisc || 0,
          amount: salesData.amount || inventoryEntry.itemamount || 0,
          paymentMode: salesData.paymentMode || voucher.vchpymtterms || 'Credit',
          paymentTerms: salesData.paymentTerms || voucher.vchpymtterms || '',
          status: salesData.status || 'Completed',
          description: salesData.description || inventoryEntry.itemdescription || '',
          remarks: salesData.remarks || voucher.remarks || '',
          syncedFromTally: true,
          syncDate: new Date(),
          isActive: true
        };

        // Create or update sales entry
        // Use vchguid + itemguid as unique identifier
        const existingSales = await Sales.findOne({
          vchguid: salesData.vchguid,
          itemguid: salesData.itemguid,
          cmpcode: salesData.cmpcode
        });

        if (existingSales) {
          // Update existing
          Object.assign(existingSales, salesPayload);
          await existingSales.save();
        } else {
          // Create new
          await Sales.create(salesPayload);
        }

        results.success++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          vchguid: salesData.vchguid || 'N/A',
          itemguid: salesData.itemguid || 'N/A',
          error: error.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sales sync completed: ${results.success} succeeded, ${results.failed} failed`,
      data: {
        total: salesDataArray.length,
        success: results.success,
        failed: results.failed,
        errors: results.errors
      }
    });
  } catch (error) {
    console.error('Sync sales from Tally error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while syncing sales',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get sales summary for group user (own dealers + child group dealers)
 * @route   GET /api/v1/tally/sales/group-user
 * @access  Private (Group User)
 */
export const getSalesSummaryForGroupUser = async (req, res) => {
  try {
    const { cmpcode: rawCmpcode, userId } = req.query;

    console.log(`🔍 getSalesSummaryForGroupUser called with cmpcode: ${rawCmpcode}, userId: ${userId}`);

    if (!rawCmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID (userId) is required'
      });
    }

    const cmpcode = rawCmpcode.trim().toUpperCase();

    // Find company
    const company = await Company.findOne({
      companyCode: cmpcode,
      isActive: true
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company not found for cmpcode: ${cmpcode}`
      });
    }

    // Find user
    const user = await User.findById(userId).select('groups hierarchy role assignedDealerIds');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get all ledger GUIDs for this group user (own + child groups)
    // Reuse the same logic from outstanding controller
    const ledgerGUIDs = new Set();

    // Helper function to get all child user IDs recursively
    const getAllChildUserIdsRecursive = async (parentUserId, visited = new Set(), depth = 0, maxDepth = 10) => {
      if (depth > maxDepth) {
        return [];
      }
      
      const parentIdStr = parentUserId.toString();
      if (visited.has(parentIdStr)) {
        return [];
      }
      visited.add(parentIdStr);
      
      const childUserIds = [];
      const parentId = mongoose.Types.ObjectId.isValid(parentUserId) 
        ? (typeof parentUserId === 'string' ? new mongoose.Types.ObjectId(parentUserId) : parentUserId)
        : parentUserId;
      
      try {
        const directChildren = await User.find({
          $and: [
            {
              $or: [
                { 'hierarchy.parentUserId': parentId },
                { 'hierarchy.parentUser': parentId }
              ]
            },
            {
              $or: [
                { 'companies.companyId': company._id },
                { defaultCompany: company._id }
              ]
            },
            { isActive: true }
          ]
        })
        .select('_id groups')
        .lean()
        .maxTimeMS(5000);
        
        if (directChildren.length === 0) {
          return [];
        }
        
        const directChildIds = directChildren.map(child => child._id.toString());
        childUserIds.push(...directChildIds);
        
        const nestedPromises = directChildIds.map(async (childId) => {
          try {
            return await getAllChildUserIdsRecursive(childId, visited, depth + 1, maxDepth);
          } catch (error) {
            return [];
          }
        });
        
        const nestedResults = await Promise.all(nestedPromises);
        nestedResults.forEach(nestedChildren => {
          childUserIds.push(...nestedChildren);
        });
        
        return childUserIds;
      } catch (error) {
        return [];
      }
    };

    // Get user's own groups
    const userGroups = user.groups || [];
    const userActiveGroups = userGroups.filter(g => g.isActive && g.cmpcode === cmpcode);
    
    // Get child user IDs
    const childUserIds = await getAllChildUserIdsRecursive(userId);
    const allUserIds = [userId, ...childUserIds];
    
    // Collect all groupGUIDs (own + child users)
    const allGroupGUIDs = new Set();
    userActiveGroups.forEach(group => {
      if (group.groupGUID) {
        allGroupGUIDs.add(group.groupGUID);
      }
    });
    
    // Get groups from child users
    if (childUserIds.length > 0) {
      const childUsers = await User.find({
        _id: { $in: childUserIds },
        isActive: true
      }).select('groups').lean();

      childUsers.forEach(childUser => {
        (childUser.groups || []).forEach(group => {
          if (group.isActive && group.cmpcode === cmpcode && group.groupGUID) {
            allGroupGUIDs.add(group.groupGUID);
          }
        });
      });
    }

    // Get all ledgers from groups (recursively including child groups)
    if (allGroupGUIDs.size > 0) {
      // Find Group documents by GroupGUID
      const initialGroupDocs = await Group.find({
        GroupGUID: { $in: Array.from(allGroupGUIDs) },
        cmpcode: cmpcode,
        isActive: true
      }).select('_id GroupGUID GroupName').lean();
      
      if (initialGroupDocs.length > 0) {
        // Recursively find all child groups
        const allGroupObjectIds = new Set();
        const visitedGroupIds = new Set();
        const groupGUIDMap = new Map();
        
        initialGroupDocs.forEach(g => {
          allGroupObjectIds.add(g._id);
          visitedGroupIds.add(g._id.toString());
          groupGUIDMap.set(g._id.toString(), g.GroupGUID);
        });
        
        const findAllChildGroups = async (parentGroupIds) => {
          if (parentGroupIds.length === 0) return;
          
          const usersInGroups = await User.find({
            'groups.groupId': { $in: parentGroupIds },
            'groups.isActive': true,
            'companies.companyId': company._id,
            isActive: true
          }).select('_id').lean();
          
          const userIdsInGroups = usersInGroups.map(u => u._id.toString());
          const parentGroupGUIDs = parentGroupIds
            .map(id => groupGUIDMap.get(id.toString()))
            .filter(guid => guid);
          
          const childGroups = await Group.find({
            GroupParent: { $in: [...userIdsInGroups, ...parentGroupGUIDs] },
            _id: { $nin: Array.from(visitedGroupIds) },
            cmpcode: cmpcode,
            companyId: company._id,
            isActive: true
          }).select('_id GroupGUID GroupName').lean();
          
          if (childGroups.length > 0) {
            const childGroupIds = childGroups.map(g => g._id);
            childGroupIds.forEach(id => {
              allGroupObjectIds.add(id);
              visitedGroupIds.add(id.toString());
            });
            childGroups.forEach(g => {
              groupGUIDMap.set(g._id.toString(), g.GroupGUID);
            });
            await findAllChildGroups(childGroupIds);
          }
        };
        
        const initialGroupIds = initialGroupDocs.map(g => g._id);
        await findAllChildGroups(initialGroupIds);
        
        const finalGroupObjectIds = Array.from(allGroupObjectIds);
        
        // Get Ledger dealers from all groups
        const ledgerDealersInGroups = await Ledger.find({
          groupId: { $in: finalGroupObjectIds },
          companyId: company._id,
          isActive: true
        }).select('LedgerGUID').lean();
        
        ledgerDealersInGroups.forEach(ledger => {
          if (ledger.LedgerGUID) {
            ledgerGUIDs.add(ledger.LedgerGUID);
          }
        });
      }
    }

    // Get directly assigned and user-created dealers
    const userObjectIds = allUserIds.map(id => 
      mongoose.Types.ObjectId.isValid(id) ? (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) : id
    );
    
    // User-created dealers
    const userCreatedLedgers = await Ledger.find({
      createdBy: { $in: userObjectIds },
      companyId: company._id,
      isActive: true
    }).select('LedgerGUID').lean();
    
    userCreatedLedgers.forEach(ledger => {
      if (ledger.LedgerGUID) {
        ledgerGUIDs.add(ledger.LedgerGUID);
      }
    });
    
    // Admin-assigned dealers
    if (user.assignedDealerIds && Array.isArray(user.assignedDealerIds) && user.assignedDealerIds.length > 0) {
      const assignedDealerObjectIds = user.assignedDealerIds
        .map(id => {
          if (typeof id === 'object' && id !== null && id._id) {
            return id._id;
          } else if (mongoose.Types.ObjectId.isValid(id)) {
            return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
          }
          return null;
        })
        .filter(id => id !== null);
      
      const directlyAssignedLedgers = await Ledger.find({
        _id: { $in: assignedDealerObjectIds },
        companyId: company._id,
        isActive: true
      }).select('LedgerGUID').lean();
      
      directlyAssignedLedgers.forEach(ledger => {
        if (ledger.LedgerGUID) {
          ledgerGUIDs.add(ledger.LedgerGUID);
        }
      });
    }
    
    // Get child users' assigned dealers
    if (childUserIds.length > 0) {
      const childUsers = await User.find({
        _id: { $in: childUserIds },
        isActive: true
      }).select('assignedDealerIds').lean();
      
      const allChildAssignedDealerIds = [];
      childUsers.forEach(childUser => {
        if (childUser.assignedDealerIds && Array.isArray(childUser.assignedDealerIds)) {
          childUser.assignedDealerIds.forEach(dealerId => {
            const dealerIdObj = typeof dealerId === 'object' && dealerId !== null && dealerId._id
              ? dealerId._id
              : (mongoose.Types.ObjectId.isValid(dealerId) 
                  ? (typeof dealerId === 'string' ? new mongoose.Types.ObjectId(dealerId) : dealerId)
                  : null);
            if (dealerIdObj) {
              allChildAssignedDealerIds.push(dealerIdObj);
            }
          });
        }
      });
      
      if (allChildAssignedDealerIds.length > 0) {
        const childAssignedLedgers = await Ledger.find({
          _id: { $in: allChildAssignedDealerIds },
          companyId: company._id,
          isActive: true
        }).select('LedgerGUID').lean();
        
        childAssignedLedgers.forEach(ledger => {
          if (ledger.LedgerGUID) {
            ledgerGUIDs.add(ledger.LedgerGUID);
          }
        });
      }
    }

    // Get sales summary for these ledgers
    const ledgerGUIDsArray = Array.from(ledgerGUIDs);
    
    if (ledgerGUIDsArray.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No ledgers found for this group user',
        data: {
          SALES_SUMMARY: [],
          TRANSACTION_REGISTER: {},
          summary: {
            totalSales: 0,
            totalRevenue: 0,
            totalTransactions: 0
          }
        }
      });
    }

    // Get all sales for these ledgers
    const allSales = await Sales.find({
      ledgerguid: { $in: ledgerGUIDsArray },
      companyId: company._id,
      isActive: true
    })
    .populate('ledgerId', 'LedgerName LedgerMobile Email LedgerAddress1')
    .populate('voucherId', 'vchnumber vchdate vchtype vchpymtterms')
    .sort({ vchdate: -1 })
    .lean();

    // Group sales by item (itemguid)
    const salesByItem = {};
    const transactionRegister = {};

    allSales.forEach(sale => {
      const itemKey = sale.itemguid;
      
      // Initialize item summary if not exists
      if (!salesByItem[itemKey]) {
        salesByItem[itemKey] = {
          id: itemKey,
          stockName: sale.itemname || 'Unknown Item',
          sku: sale.itemsku || sale.itemguid,
          category: sale.itemcategory || 'Uncategorized',
          totalQuantitySold: 0,
          totalAmount: 0,
          averageRate: 0,
          transactionCount: 0,
          lastSaleDate: null,
          trend: 'up',
          status: 'Good'
        };
        transactionRegister[itemKey] = [];
      }
      
      // Update summary
      const itemSummary = salesByItem[itemKey];
      itemSummary.totalQuantitySold += sale.quantity || 0;
      itemSummary.totalAmount += sale.amount || 0;
      itemSummary.transactionCount += 1;
      
      // Update last sale date
      if (!itemSummary.lastSaleDate || new Date(sale.vchdate) > new Date(itemSummary.lastSaleDate)) {
        itemSummary.lastSaleDate = sale.vchdate;
      }
      
      // Add transaction to register
      const ledger = sale.ledgerId || {};
      const voucher = sale.voucherId || {};
      
      transactionRegister[itemKey].push({
        id: `${sale.vchguid}-${sale.itemguid}`,
        date: sale.vchdate ? new Date(sale.vchdate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : 'N/A',
        subDealer: sale.ledgername || ledger.LedgerName || 'Unknown',
        location: sale.ledgeraddress || ledger.LedgerAddress1 || 'N/A',
        quantity: sale.quantity || 0,
        rate: sale.rate || 0,
        amount: sale.amount || 0,
        status: sale.status || 'Completed',
        invoiceNo: sale.vchnumber || voucher.vchnumber || 'N/A',
        paymentMode: sale.paymentMode || voucher.vchpymtterms || 'Credit'
      });
    });

    // Calculate averages and determine status
    const SALES_SUMMARY = Object.values(salesByItem).map(item => {
      item.averageRate = item.totalQuantitySold > 0 
        ? Math.round(item.totalAmount / item.totalQuantitySold) 
        : 0;
      
      // Determine status based on total amount
      if (item.totalAmount >= 2000000) {
        item.status = 'Top Seller';
      } else if (item.totalAmount >= 500000) {
        item.status = 'Good';
      } else {
        item.status = 'Slow Mover';
      }
      
      // Format last sale date
      if (item.lastSaleDate) {
        const date = new Date(item.lastSaleDate);
        item.lastSaleDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
      }
      
      return item;
    });

    // Sort transactions by date (most recent first)
    Object.keys(transactionRegister).forEach(itemKey => {
      transactionRegister[itemKey].sort((a, b) => {
        try {
          // Parse date format: "02 Jan 26" -> Date object
          const parseDate = (dateStr) => {
            if (!dateStr || dateStr === 'N/A') return new Date(0);
            const parts = dateStr.split(' ');
            if (parts.length === 3) {
              const day = parts[0];
              const month = parts[1];
              const year = '20' + parts[2];
              const monthMap = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
              };
              return new Date(`${year}-${monthMap[month] || '01'}-${day.padStart(2, '0')}`);
            }
            return new Date(dateStr);
          };
          const dateA = parseDate(a.date);
          const dateB = parseDate(b.date);
          return dateB.getTime() - dateA.getTime();
        } catch (error) {
          return 0;
        }
      });
    });

    // Calculate summary totals
    const summary = {
      totalSales: SALES_SUMMARY.reduce((sum, item) => sum + item.totalQuantitySold, 0),
      totalRevenue: SALES_SUMMARY.reduce((sum, item) => sum + item.totalAmount, 0),
      totalTransactions: SALES_SUMMARY.reduce((sum, item) => sum + item.transactionCount, 0)
    };

    return res.status(200).json({
      success: true,
      data: {
        SALES_SUMMARY,
        TRANSACTION_REGISTER: transactionRegister,
        summary
      }
    });
  } catch (error) {
    console.error('Get sales summary for group user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while fetching sales summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

