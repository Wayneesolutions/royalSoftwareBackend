import InventoryEntries from '../models/inventory/inventoryEntriesModel.js';
import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import Company from '../models/company/companyModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Create or update inventory entries from Tally (Single or Multiple)
 * @route   POST /api/v1/inventory-entries/sync
 * @access  Public (No auth - Tally integration)
 */
export const syncInventoryEntries = async (req, res) => {
  try {
    const { entries } = req.body;

    // Validate input
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide entries array with at least one inventory entry'
      });
    }

    console.log(`📥 Syncing ${entries.length} inventory entries from Tally`);

    const results = {
      success: [],
      failed: [],
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
    };

    // Process each entry
    for (let i = 0; i < entries.length; i++) {
      const entryData = entries[i];
      results.totalProcessed++;

      try {
        // Validate required fields
        const requiredFields = ['cmpcode', 'vchguid', 'itemguid', 'itemamount'];
        const missingFields = requiredFields.filter(field => !entryData[field]);

        if (missingFields.length > 0) {
          results.failed.push({
            index: i,
            vchguid: entryData.vchguid || 'N/A',
            itemguid: entryData.itemguid || 'N/A',
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
          results.totalFailed++;
          continue;
        }

        // Step 1: Validate and fetch company
        const company = await Company.findOne({
          companyCode: entryData.cmpcode,
          isActive: true
        });

        if (!company) {
          results.failed.push({
            index: i,
            vchguid: entryData.vchguid,
            itemguid: entryData.itemguid,
            error: `Company not found or inactive for cmpcode: ${entryData.cmpcode}`
          });
          results.totalFailed++;
          continue;
        }

        console.log(`✅ Company found: ${company.companyName} (${company._id})`);

        // Step 2: Validate and fetch voucher
        const voucher = await VoucherMaster.findOne({
          vchguid: entryData.vchguid,
          cmpcode: entryData.cmpcode,
          isActive: true
        });

        if (!voucher) {
          results.failed.push({
            index: i,
            vchguid: entryData.vchguid,
            itemguid: entryData.itemguid,
            error: `Voucher not found or inactive for vchguid: ${entryData.vchguid} in company: ${entryData.cmpcode}`
          });
          results.totalFailed++;
          continue;
        }

        console.log(`✅ Voucher found: ${voucher.vchnumber} (${voucher._id})`);

        // Step 3: Prepare entry data
        // Note: Always create new entries - allows multiple entries for same item in one voucher
        const entryPayload = {
          // Company Info
          cmpcode: entryData.cmpcode,
          companyId: company._id,

          // Voucher Info
          vchguid: entryData.vchguid,
          voucherId: voucher._id,

          // Item Info
          itemguid: entryData.itemguid,

          // Quantity Details
          itemmainqty: parseFloat(entryData.itemmainqty) || 0,
          itemaltqty: parseFloat(entryData.itemaltqty) || 0,
          itemmainunit: entryData.itemmainunit || '',
          itemaltunit: entryData.itemaltunit || '',

          // Rate Details
          itemrate: parseFloat(entryData.itemrate) || 0,
          itemrateunit: entryData.itemrateunit || '',

          // Discount and Amount
          itemdisc: parseFloat(entryData.itemdisc) || 0,
          itemamount: parseFloat(entryData.itemamount),

          // Description
          itemdescription: entryData.itemdescription || '',

          // Additional Fields
          other1: entryData.other1 || '',
          other2: entryData.other2 || '',
          other3: entryData.other3 || '',
          other4: entryData.other4 || '',
          other5: entryData.other5 || '',

          // Sync timestamp
          syncedAt: new Date(),
          updatedAt: new Date(),
        };

        // Create new entry (always insert, never update)
        await InventoryEntries.create(entryPayload);
        results.success.push({
          index: i,
          vchguid: entryData.vchguid,
          itemguid: entryData.itemguid,
          action: 'Created',
          voucherNumber: voucher.vchnumber,
          itemDescription: entryData.itemdescription || entryData.itemguid,
          quantity: entryData.itemmainqty || 0,
          amount: entryData.itemamount
        });
        console.log(`✅ Created inventory entry for voucher: ${voucher.vchnumber}, item: ${entryData.itemguid}, quantity: ${entryData.itemmainqty}, amount: ${entryData.itemamount}`);

        results.totalSuccess++;

      } catch (error) {
        console.error(`❌ Error processing inventory entry at index ${i}:`, error.message);
        results.failed.push({
          index: i,
          vchguid: entryData.vchguid || 'N/A',
          itemguid: entryData.itemguid || 'N/A',
          error: error.message
        });
        results.totalFailed++;
      }
    }

    // Return summary
    res.status(200).json({
      success: true,
      message: `Inventory entries sync completed. Success: ${results.totalSuccess}, Failed: ${results.totalFailed}`,
      data: results
    });

  } catch (error) {
    console.error('❌ Error syncing inventory entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync inventory entries from Tally',
      error: error.message
    });
  }
};

/**
 * @desc    Get inventory entries by company with filters
 * @route   GET /api/v1/inventory-entries/list
 * @access  Public (No auth - Tally integration)
 */
export const getInventoryEntries = async (req, res) => {
  try {
    const { cmpcode, vchguid, itemguid, page = 1, limit = 50 } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    // Build query
    const query = { cmpcode, isActive: true };

    if (vchguid) {
      query.vchguid = vchguid;
    }

    if (itemguid) {
      query.itemguid = itemguid;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const entries = await InventoryEntries.find(query)
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount')
      .populate('companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await InventoryEntries.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'Inventory entries fetched successfully',
      data: {
        entries,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching inventory entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory entries',
      error: error.message
    });
  }
};

/**
 * @desc    Get inventory entries by voucher GUID
 * @route   GET /api/v1/inventory-entries/by-voucher/:vchguid
 * @access  Public (No auth - Tally integration)
 */
export const getInventoryEntriesByVoucher = async (req, res) => {
  try {
    const { vchguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const entries = await InventoryEntries.find({ vchguid, cmpcode, isActive: true })
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .lean();

    if (!entries || entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No inventory entries found for this voucher'
      });
    }

    // Calculate totals
    const totalQuantity = entries.reduce((sum, entry) => sum + (entry.itemmainqty || 0), 0);
    const totalAmount = entries.reduce((sum, entry) => sum + (entry.itemamount || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Inventory entries fetched successfully',
      data: {
        entries,
        summary: {
          totalEntries: entries.length,
          totalQuantity,
          totalAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching inventory entries by voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory entries',
      error: error.message
    });
  }
};

/**
 * @desc    Get inventory entries by item GUID
 * @route   GET /api/v1/inventory-entries/by-item/:itemguid
 * @access  Public (No auth - Tally integration)
 */
export const getInventoryEntriesByItem = async (req, res) => {
  try {
    const { itemguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const entries = await InventoryEntries.find({ itemguid, cmpcode, isActive: true })
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .lean();

    if (!entries || entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No inventory entries found for this item'
      });
    }

    // Calculate totals
    const totalQuantity = entries.reduce((sum, entry) => sum + (entry.itemmainqty || 0), 0);
    const totalAmount = entries.reduce((sum, entry) => sum + (entry.itemamount || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Inventory entries fetched successfully',
      data: {
        entries,
        summary: {
          totalEntries: entries.length,
          totalQuantity,
          totalAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching inventory entries by item:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inventory entries',
      error: error.message
    });
  }
};

/**
 * @desc    Delete inventory entry
 * @route   DELETE /api/v1/inventory-entries/:id
 * @access  Private (Admin/Super Admin)
 */
export const deleteInventoryEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const entry = await InventoryEntries.findOne({ _id: id, cmpcode });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Inventory entry not found'
      });
    }

    // Soft delete
    entry.isActive = false;
    await entry.save();

    res.status(200).json({
      success: true,
      message: 'Inventory entry deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting inventory entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete inventory entry',
      error: error.message
    });
  }
};

