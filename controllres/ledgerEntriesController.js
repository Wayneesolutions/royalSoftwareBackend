import LedgerEntries from '../models/ledger/ledgerEntriesModel.js';
import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import Company from '../models/company/companyModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Create or update ledger entries from Tally (Single or Multiple)
 * @route   POST /api/v1/ledger-entries/sync
 * @access  Public (No auth - Tally integration)
 */
export const syncLedgerEntries = async (req, res) => {
  try {
    const { entries } = req.body;

    // Validate input
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide entries array with at least one ledger entry'
      });
    }

    console.log(`📥 Syncing ${entries.length} ledger entries from Tally`);

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
        const requiredFields = ['cmpcode', 'vchguid', 'ledgerguid', 'ledgeramount'];
        const missingFields = requiredFields.filter(field => !entryData[field]);

        if (missingFields.length > 0) {
          results.failed.push({
            index: i,
            vchguid: entryData.vchguid || 'N/A',
            ledgerguid: entryData.ledgerguid || 'N/A',
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
            ledgerguid: entryData.ledgerguid,
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
            ledgerguid: entryData.ledgerguid,
            error: `Voucher not found or inactive for vchguid: ${entryData.vchguid} in company: ${entryData.cmpcode}`
          });
          results.totalFailed++;
          continue;
        }

        console.log(`✅ Voucher found: ${voucher.vchnumber} (${voucher._id})`);

        // Step 3: Validate and fetch ledger
        const ledger = await Ledger.findOne({
          LedgerGUID: entryData.ledgerguid,
          cmpcode: entryData.cmpcode,
          companyId: company._id,
          isActive: true
        });

        if (!ledger) {
          results.failed.push({
            index: i,
            vchguid: entryData.vchguid,
            ledgerguid: entryData.ledgerguid,
            error: `Ledger not found or inactive for ledgerguid: ${entryData.ledgerguid} in company: ${entryData.cmpcode}`
          });
          results.totalFailed++;
          continue;
        }

        console.log(`✅ Ledger found: ${ledger.LedgerName} (${ledger._id})`);

        // Step 4: Prepare entry data
        // Note: Always create new entries - allows multiple entries for same ledger in one voucher
        const entryPayload = {
          // Company Info
          cmpcode: entryData.cmpcode,
          companyId: company._id,

          // Voucher Info
          vchguid: entryData.vchguid,
          voucherId: voucher._id,

          // Ledger Info
          ledgerguid: entryData.ledgerguid,
          ledgerId: ledger._id,

          // Amount
          ledgeramount: parseFloat(entryData.ledgeramount),

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
        await LedgerEntries.create(entryPayload);
        results.success.push({
          index: i,
          vchguid: entryData.vchguid,
          ledgerguid: entryData.ledgerguid,
          action: 'Created',
          voucherNumber: voucher.vchnumber,
          ledgerName: ledger.LedgerName,
          amount: entryData.ledgeramount
        });
        console.log(`✅ Created ledger entry for voucher: ${voucher.vchnumber}, ledger: ${ledger.LedgerName}, amount: ${entryData.ledgeramount}`);

        results.totalSuccess++;

      } catch (error) {
        console.error(`❌ Error processing ledger entry at index ${i}:`, error.message);
        results.failed.push({
          index: i,
          vchguid: entryData.vchguid || 'N/A',
          ledgerguid: entryData.ledgerguid || 'N/A',
          error: error.message
        });
        results.totalFailed++;
      }
    }

    // Return summary
    res.status(200).json({
      success: true,
      message: `Ledger entries sync completed. Success: ${results.totalSuccess}, Failed: ${results.totalFailed}`,
      data: results
    });

  } catch (error) {
    console.error('❌ Error syncing ledger entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync ledger entries from Tally',
      error: error.message
    });
  }
};

/**
 * @desc    Get ledger entries by company with filters
 * @route   GET /api/v1/ledger-entries/list
 * @access  Public (No auth - Tally integration)
 */
export const getLedgerEntries = async (req, res) => {
  try {
    const { cmpcode, vchguid, ledgerguid, page = 1, limit = 50 } = req.query;

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

    if (ledgerguid) {
      query.ledgerguid = ledgerguid;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const entries = await LedgerEntries.find(query)
      .populate('ledgerId', 'LedgerName LedgerMobile Email')
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount')
      .populate('companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await LedgerEntries.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'Ledger entries fetched successfully',
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
    console.error('❌ Error fetching ledger entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ledger entries',
      error: error.message
    });
  }
};

/**
 * @desc    Get ledger entries by voucher GUID
 * @route   GET /api/v1/ledger-entries/by-voucher/:vchguid
 * @access  Public (No auth - Tally integration)
 */
export const getLedgerEntriesByVoucher = async (req, res) => {
  try {
    const { vchguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const entries = await LedgerEntries.find({ vchguid, cmpcode, isActive: true })
      .populate('ledgerId', 'LedgerName LedgerMobile Email LedgerGSTIN')
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .lean();

    if (!entries || entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No ledger entries found for this voucher'
      });
    }

    // Calculate total amount
    const totalAmount = entries.reduce((sum, entry) => sum + (entry.ledgeramount || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Ledger entries fetched successfully',
      data: {
        entries,
        summary: {
          totalEntries: entries.length,
          totalAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching ledger entries by voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ledger entries',
      error: error.message
    });
  }
};

/**
 * @desc    Get ledger entries by ledger GUID
 * @route   GET /api/v1/ledger-entries/by-ledger/:ledgerguid
 * @access  Public (No auth - Tally integration)
 */
export const getLedgerEntriesByLedger = async (req, res) => {
  try {
    const { ledgerguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const entries = await LedgerEntries.find({ ledgerguid, cmpcode, isActive: true })
      .populate('ledgerId', 'LedgerName LedgerMobile Email LedgerGSTIN')
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .sort({ createdAt: -1 })
      .lean();

    if (!entries || entries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No ledger entries found for this ledger'
      });
    }

    // Calculate total amount
    const totalAmount = entries.reduce((sum, entry) => sum + (entry.ledgeramount || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Ledger entries fetched successfully',
      data: {
        entries,
        summary: {
          totalEntries: entries.length,
          totalAmount
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching ledger entries by ledger:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ledger entries',
      error: error.message
    });
  }
};

/**
 * @desc    Delete ledger entry
 * @route   DELETE /api/v1/ledger-entries/:id
 * @access  Private (Admin/Super Admin)
 */
export const deleteLedgerEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const entry = await LedgerEntries.findOne({ _id: id, cmpcode });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: 'Ledger entry not found'
      });
    }

    // Soft delete
    entry.isActive = false;
    await entry.save();

    res.status(200).json({
      success: true,
      message: 'Ledger entry deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting ledger entry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ledger entry',
      error: error.message
    });
  }
};

