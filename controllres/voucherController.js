import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import Company from '../models/company/companyModel.js';
import LedgerEntries from '../models/ledger/ledgerEntriesModel.js';
import InventoryEntries from '../models/inventory/inventoryEntriesModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Create single or multiple vouchers from Tally
 * @route   POST /api/v1/voucher/sync
 * @access  Private (Admin/Super Admin)
 */
export const syncVouchersFromTally = async (req, res) => {
  try {
    const { vouchers } = req.body;

    // Validate input
    if (!vouchers || !Array.isArray(vouchers) || vouchers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide vouchers array with at least one voucher'
      });
    }

    console.log(`📥 Syncing ${vouchers.length} vouchers from Tally`);

    const results = {
      success: [],
      failed: [],
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
    };

    // Process each voucher
    for (let i = 0; i < vouchers.length; i++) {
      const voucherData = vouchers[i];
      results.totalProcessed++;

      try {
        // Validate required fields
        const requiredFields = ['cmpcode', 'vchguid', 'vchnumber', 'vchdate', 'vchtype', 'vchpartyguid', 'vchamount'];
        const missingFields = requiredFields.filter(field => !voucherData[field]);

        if (missingFields.length > 0) {
          results.failed.push({
            index: i,
            vchguid: voucherData.vchguid || 'N/A',
            vchnumber: voucherData.vchnumber || 'N/A',
            error: `Missing required fields: ${missingFields.join(', ')}`
          });
          results.totalFailed++;
          continue;
        }

        // Step 1: Validate and fetch company
        const company = await Company.findOne({
          companyCode: voucherData.cmpcode,
          isActive: true
        });

        if (!company) {
          results.failed.push({
            index: i,
            vchguid: voucherData.vchguid,
            vchnumber: voucherData.vchnumber,
            error: `Company not found or inactive for cmpcode: ${voucherData.cmpcode}`
          });
          results.totalFailed++;
          continue;
        }

        console.log(`✅ Company found: ${company.companyName} (${company._id})`);

        // Step 2: Validate and fetch ledger (dealer) in this company
        const ledger = await Ledger.findOne({
          LedgerGUID: voucherData.vchpartyguid,
          cmpcode: voucherData.cmpcode,
          companyId: company._id,
          isActive: true
        });

        if (!ledger) {
          results.failed.push({
            index: i,
            vchguid: voucherData.vchguid,
            vchnumber: voucherData.vchnumber,
            error: `Ledger/Dealer not found or inactive for LedgerGUID: ${voucherData.vchpartyguid} in company: ${voucherData.cmpcode}`
          });
          results.totalFailed++;
          continue;
        }

        console.log(`✅ Ledger found: ${ledger.LedgerName} (${ledger._id})`);

        // Step 3: Check if voucher already exists (update or create)
        let existingVoucher = await VoucherMaster.findOne({
          vchguid: voucherData.vchguid,
          cmpcode: voucherData.cmpcode
        });

        // Prepare voucher data
        const voucherPayload = {
          // Company Info
          companyguid: company.CompanyGuid || company.companyCode,
          cmpcode: voucherData.cmpcode,
          companyId: company._id,

          // Voucher Info
          vchguid: voucherData.vchguid,
          vchnumber: voucherData.vchnumber,
          vchdate: new Date(voucherData.vchdate),
          vchtype: voucherData.vchtype,
          vchtypeparent: voucherData.vchtypeparent || '',

          // Party (Ledger) Info
          vchpartyguid: voucherData.vchpartyguid,
          ledgerId: ledger._id,
          vchpartyname: voucherData.vchpartyname || ledger.LedgerName,
          vchpartyadd1: voucherData.vchpartyadd1 || ledger.LedgerAddress1 || '',
          vchpartyadd2: voucherData.vchpartyadd2 || ledger.LedgerAddress2 || '',
          vchpartyadd3: voucherData.vchpartyadd3 || '',
          vchpartygstin: voucherData.vchpartygstin || ledger.LedgerGSTIN || '',

          // Sub Dealer Info
          vchsubdealername: voucherData.vchsubdealername || '',
          vchsubdealeradd1: voucherData.vchsubdealeradd1 || '',
          vchsubdealeradd2: voucherData.vchsubdealeradd2 || '',
          vchsubdealeradd3: voucherData.vchsubdealeradd3 || '',

          // Invoice Details
          isinvoice: voucherData.isinvoice || 'No',
          vchgrno: voucherData.vchgrno || '',

          // Transport Details
          vchtransport: voucherData.vchtransport || '',
          vchtruckno: voucherData.vchtruckno || '',
          vchdrivername: voucherData.vchdrivername || '',
          vchdrivermobile: voucherData.vchdrivermobile || '',
          vchdestination: voucherData.vchdestination || '',

          // Payment Terms
          vchpymtterms: voucherData.vchpymtterms || '',
          vchotherref: voucherData.vchotherref || '',

          // Quantity Units
          vchqtunit: voucherData.vchqtunit || '',
          vchqtunit2: voucherData.vchqtunit2 || '',

          // Amount Details
          vchgoodsamt: parseFloat(voucherData.vchgoodsamt) || 0,
          vchamount: parseFloat(voucherData.vchamount),

          // Narration and Remarks
          vchnarration: voucherData.vchnarration || '',
          remarks: voucherData.remarks || '',

          // Additional Fields
          other1: voucherData.other1 || '',
          other2: voucherData.other2 || '',
          other3: voucherData.other3 || '',
          other4: voucherData.other4 || '',
          other5: voucherData.other5 || '',
          other6: voucherData.other6 || '',
          other7: voucherData.other7 || '',
          other8: voucherData.other8 || '',
          other9: voucherData.other9 || '',
          other10: voucherData.other10 || '',

          // Sync timestamp
          syncedAt: new Date(),
          updatedAt: new Date(),
        };

        if (existingVoucher) {
          // Update existing voucher
          await VoucherMaster.updateOne(
            { _id: existingVoucher._id },
            { $set: voucherPayload }
          );
          results.success.push({
            index: i,
            vchguid: voucherData.vchguid,
            vchnumber: voucherData.vchnumber,
            action: 'Updated',
            ledgerName: ledger.LedgerName
          });
          console.log(`✅ Updated voucher: ${voucherData.vchnumber}`);
        } else {
          // Create new voucher
          await VoucherMaster.create(voucherPayload);
          results.success.push({
            index: i,
            vchguid: voucherData.vchguid,
            vchnumber: voucherData.vchnumber,
            action: 'Created',
            ledgerName: ledger.LedgerName
          });
          console.log(`✅ Created voucher: ${voucherData.vchnumber}`);
        }

        results.totalSuccess++;

      } catch (error) {
        console.error(`❌ Error processing voucher at index ${i}:`, error.message);
        results.failed.push({
          index: i,
          vchguid: voucherData.vchguid || 'N/A',
          vchnumber: voucherData.vchnumber || 'N/A',
          error: error.message
        });
        results.totalFailed++;
      }
    }

    // Return summary
    res.status(200).json({
      success: true,
      message: `Voucher sync completed. Success: ${results.totalSuccess}, Failed: ${results.totalFailed}`,
      data: results
    });

  } catch (error) {
    console.error('❌ Error syncing vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync vouchers from Tally',
      error: error.message
    });
  }
};

/**
 * @desc    Get vouchers by company with filters
 * @route   GET /api/v1/voucher/list
 * @access  Private
 */
export const getVouchersByCompany = async (req, res) => {
  try {
    const { cmpcode, startDate, endDate, vchtype, ledgerguid, page = 1, limit = 50 } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    // Build query
    const query = { cmpcode, isActive: true };

    if (startDate && endDate) {
      query.vchdate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (vchtype) {
      query.vchtype = vchtype;
    }

    if (ledgerguid) {
      query.vchpartyguid = ledgerguid;
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const vouchers = await VoucherMaster.find(query)
      .populate('ledgerId', 'LedgerName LedgerMobile LedgerAddress1')
      .populate('companyId', 'companyName companyCode')
      .sort({ vchdate: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalCount = await VoucherMaster.countDocuments(query);

    res.status(200).json({
      success: true,
      message: 'Vouchers fetched successfully',
      data: {
        vouchers,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching vouchers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vouchers',
      error: error.message
    });
  }
};

/**
 * @desc    Get voucher by GUID
 * @route   GET /api/v1/voucher/:vchguid
 * @access  Private
 */
export const getVoucherByGuid = async (req, res) => {
  try {
    const { vchguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const voucher = await VoucherMaster.findOne({ vchguid, cmpcode, isActive: true })
      .populate('ledgerId', 'LedgerName LedgerMobile LedgerAddress1 LedgerGSTIN')
      .populate('companyId', 'companyName companyCode')
      .lean();

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Voucher fetched successfully',
      data: voucher
    });

  } catch (error) {
    console.error('❌ Error fetching voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher',
      error: error.message
    });
  }
};

/**
 * @desc    Delete voucher
 * @route   DELETE /api/v1/voucher/:vchguid
 * @access  Private (Admin/Super Admin)
 */
export const deleteVoucher = async (req, res) => {
  try {
    const { vchguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const voucher = await VoucherMaster.findOne({ vchguid, cmpcode });

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Soft delete
    voucher.isActive = false;
    await voucher.save();

    res.status(200).json({
      success: true,
      message: 'Voucher deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting voucher:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete voucher',
      error: error.message
    });
  }
};

/**
 * @desc    Get voucher statistics by company
 * @route   GET /api/v1/voucher/stats
 * @access  Private
 */
export const getVoucherStats = async (req, res) => {
  try {
    const { cmpcode, startDate, endDate } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    const query = { cmpcode, isActive: true };

    if (startDate && endDate) {
      query.vchdate = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Get statistics
    const totalVouchers = await VoucherMaster.countDocuments(query);
    
    const amountStats = await VoucherMaster.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$vchamount' },
          totalGoodsAmount: { $sum: '$vchgoodsamt' },
          avgAmount: { $avg: '$vchamount' }
        }
      }
    ]);

    const voucherTypeStats = await VoucherMaster.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$vchtype',
          count: { $sum: 1 },
          totalAmount: { $sum: '$vchamount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      message: 'Voucher statistics fetched successfully',
      data: {
        totalVouchers,
        amountStats: amountStats[0] || { totalAmount: 0, totalGoodsAmount: 0, avgAmount: 0 },
        voucherTypeStats
      }
    });

  } catch (error) {
    console.error('❌ Error fetching voucher stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher statistics',
      error: error.message
    });
  }
};

/**
 * @desc    Get voucher with ledger entries and inventory entries (Combined API)
 * @route   GET /api/v1/tally/vouchers/:vchguid/details
 * @access  Public (No auth - Tally integration)
 */
export const getVoucherWithEntries = async (req, res) => {
  try {
    const { vchguid } = req.params;
    const { cmpcode } = req.query;

    if (!cmpcode) {
      return res.status(400).json({
        success: false,
        message: 'Company code (cmpcode) is required'
      });
    }

    // Get voucher details
    const voucher = await VoucherMaster.findOne({ vchguid, cmpcode, isActive: true })
      .populate('ledgerId', 'LedgerName LedgerMobile LedgerAddress1 LedgerGSTIN Email')
      .populate('companyId', 'companyName companyCode')
      .lean();

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    // Get ledger entries for this voucher
    const ledgerEntries = await LedgerEntries.find({ vchguid, cmpcode, isActive: true })
      .populate('ledgerId', 'LedgerName LedgerMobile Email LedgerGSTIN')
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .lean();

    // Get inventory entries for this voucher
    const inventoryEntries = await InventoryEntries.find({ vchguid, cmpcode, isActive: true })
      .populate('voucherId', 'vchnumber vchtype vchdate vchamount vchpartyname')
      .populate('companyId', 'companyName companyCode')
      .lean();

    // Calculate ledger entries summary
    const ledgerTotalAmount = ledgerEntries.reduce((sum, entry) => sum + (entry.ledgeramount || 0), 0);

    // Calculate inventory entries summary
    const inventoryTotalQuantity = inventoryEntries.reduce((sum, entry) => sum + (entry.itemmainqty || 0), 0);
    const inventoryTotalAmount = inventoryEntries.reduce((sum, entry) => sum + (entry.itemamount || 0), 0);

    res.status(200).json({
      success: true,
      message: 'Voucher details with entries fetched successfully',
      data: {
        voucher,
        ledgerEntries: {
          entries: ledgerEntries,
          summary: {
            totalEntries: ledgerEntries.length,
            totalAmount: ledgerTotalAmount
          }
        },
        inventoryEntries: {
          entries: inventoryEntries,
          summary: {
            totalEntries: inventoryEntries.length,
            totalQuantity: inventoryTotalQuantity,
            totalAmount: inventoryTotalAmount
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching voucher with entries:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voucher details with entries',
      error: error.message
    });
  }
};

/**
 * @desc    Create or update voucher with ledger entries and inventory entries (Combined API)
 * @route   POST /api/v1/tally/vouchers/sync-complete
 * @access  Public (No auth - Tally integration)
 */
export const syncVoucherComplete = async (req, res) => {
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

    const { voucher, ledgerEntries = [], inventoryEntries = [] } = body;

    // Validate voucher data
    if (!voucher) {
      return res.status(400).json({
        success: false,
        message: 'Voucher data is required'
      });
    }

    const requiredVoucherFields = ['cmpcode', 'vchguid', 'vchnumber', 'vchdate', 'vchtype', 'vchpartyguid', 'vchamount'];
    const missingVoucherFields = requiredVoucherFields.filter(field => !voucher[field]);

    if (missingVoucherFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required voucher fields: ${missingVoucherFields.join(', ')}`
      });
    }

    console.log(`📥 Syncing complete voucher: ${voucher.vchnumber} with ${ledgerEntries.length} ledger entries and ${inventoryEntries.length} inventory entries`);

    const results = {
      voucher: { success: false, action: null, error: null, data: null },
      ledgerEntries: {
        success: [],
        failed: [],
        totalProcessed: 0,
        totalSuccess: 0,
        totalFailed: 0
      },
      inventoryEntries: {
        success: [],
        failed: [],
        totalProcessed: 0,
        totalSuccess: 0,
        totalFailed: 0
      }
    };

    // Step 1: Validate and fetch company
    const company = await Company.findOne({
      companyCode: voucher.cmpcode,
      isActive: true
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company not found or inactive for cmpcode: ${voucher.cmpcode}`
      });
    }

    console.log(`✅ Company found: ${company.companyName} (${company._id})`);

    // Step 2: Validate and fetch ledger (dealer)
    const ledger = await Ledger.findOne({
      LedgerGUID: voucher.vchpartyguid,
      cmpcode: voucher.cmpcode,
      companyId: company._id,
      isActive: true
    });

    if (!ledger) {
      return res.status(404).json({
        success: false,
        message: `Ledger/Dealer not found or inactive for LedgerGUID: ${voucher.vchpartyguid} in company: ${voucher.cmpcode}`
      });
    }

    console.log(`✅ Ledger found: ${ledger.LedgerName} (${ledger._id})`);

    // Step 3: Create or update voucher
    try {
      let existingVoucher = await VoucherMaster.findOne({
        vchguid: voucher.vchguid,
        cmpcode: voucher.cmpcode
      });

      const voucherPayload = {
        companyguid: company.CompanyGuid || company.companyCode,
        cmpcode: voucher.cmpcode,
        companyId: company._id,
        vchguid: voucher.vchguid,
        vchnumber: voucher.vchnumber,
        vchdate: new Date(voucher.vchdate),
        vchtype: voucher.vchtype,
        vchtypeparent: voucher.vchtypeparent || '',
        vchpartyguid: voucher.vchpartyguid,
        vchpartyname: voucher.vchpartyname || ledger.LedgerName,
        vchpartyadd1: voucher.vchpartyadd1 || ledger.LedgerAddress1 || '',
        vchpartyadd2: voucher.vchpartyadd2 || ledger.LedgerAddress2 || '',
        vchpartyadd3: voucher.vchpartyadd3 || ledger.LedgerAddress3 || '',
        vchpartygstin: voucher.vchpartygstin || ledger.LedgerGSTIN || '',
        vchsubdealername: voucher.vchsubdealername || '',
        vchsubdealeradd1: voucher.vchsubdealeradd1 || '',
        vchsubdealeradd2: voucher.vchsubdealeradd2 || '',
        vchsubdealeradd3: voucher.vchsubdealeradd3 || '',
        isinvoice: voucher.isinvoice || 'No',
        vchgrno: voucher.vchgrno || '',
        vchtransport: voucher.vchtransport || '',
        vchtruckno: voucher.vchtruckno || '',
        vchdrivername: voucher.vchdrivername || '',
        vchdrivermobile: voucher.vchdrivermobile || '',
        vchdestination: voucher.vchdestination || '',
        vchpymtterms: voucher.vchpymtterms || '',
        vchotherref: voucher.vchotherref || '',
        vchqtunit: voucher.vchqtunit || '',
        vchqtunit2: voucher.vchqtunit2 || '',
        vchgoodsamt: parseFloat(voucher.vchgoodsamt) || 0,
        vchamount: parseFloat(voucher.vchamount) || 0,
        vchnarration: voucher.vchnarration || '',
        remarks: voucher.remarks || '',
        other1: voucher.other1 || '',
        other2: voucher.other2 || '',
        other3: voucher.other3 || '',
        other4: voucher.other4 || '',
        other5: voucher.other5 || '',
        other6: voucher.other6 || '',
        other7: voucher.other7 || '',
        other8: voucher.other8 || '',
        other9: voucher.other9 || '',
        other10: voucher.other10 || '',
        ledgerId: ledger._id,
        isActive: true
      };

      let savedVoucher;
      if (existingVoucher) {
        // Update existing voucher
        Object.assign(existingVoucher, voucherPayload);
        savedVoucher = await existingVoucher.save();
        results.voucher.action = 'Updated';
        console.log(`✅ Voucher updated: ${savedVoucher.vchnumber} (${savedVoucher._id})`);
      } else {
        // Create new voucher
        savedVoucher = await VoucherMaster.create(voucherPayload);
        results.voucher.action = 'Created';
        console.log(`✅ Voucher created: ${savedVoucher.vchnumber} (${savedVoucher._id})`);
      }

      results.voucher.success = true;
      results.voucher.data = {
        _id: savedVoucher._id,
        vchguid: savedVoucher.vchguid,
        vchnumber: savedVoucher.vchnumber,
        vchtype: savedVoucher.vchtype,
        vchdate: savedVoucher.vchdate,
        vchamount: savedVoucher.vchamount
      };

      // Step 4: Process ledger entries
      if (ledgerEntries && Array.isArray(ledgerEntries) && ledgerEntries.length > 0) {
        for (let i = 0; i < ledgerEntries.length; i++) {
          const entryData = ledgerEntries[i];
          results.ledgerEntries.totalProcessed++;

          try {
            const requiredFields = ['ledgerguid', 'ledgeramount'];
            const missingFields = requiredFields.filter(field => !entryData[field]);

            if (missingFields.length > 0) {
              results.ledgerEntries.failed.push({
                index: i,
                ledgerguid: entryData.ledgerguid || 'N/A',
                error: `Missing required fields: ${missingFields.join(', ')}`
              });
              results.ledgerEntries.totalFailed++;
              continue;
            }

            // Validate ledger exists
            const entryLedger = await Ledger.findOne({
              LedgerGUID: entryData.ledgerguid,
              cmpcode: voucher.cmpcode,
              companyId: company._id,
              isActive: true
            });

            if (!entryLedger) {
              results.ledgerEntries.failed.push({
                index: i,
                ledgerguid: entryData.ledgerguid,
                error: `Ledger not found for ledgerguid: ${entryData.ledgerguid}`
              });
              results.ledgerEntries.totalFailed++;
              continue;
            }

            // Check if entry exists (update or create)
            const existingEntry = await LedgerEntries.findOne({
              vchguid: voucher.vchguid,
              ledgerguid: entryData.ledgerguid,
              cmpcode: voucher.cmpcode
            });

            const entryPayload = {
              cmpcode: voucher.cmpcode,
              companyId: company._id,
              vchguid: voucher.vchguid,
              voucherId: savedVoucher._id,
              ledgerguid: entryData.ledgerguid,
              ledgerId: entryLedger._id,
              ledgeramount: parseFloat(entryData.ledgeramount) || 0,
              other1: entryData.other1 || '',
              other2: entryData.other2 || '',
              other3: entryData.other3 || '',
              other4: entryData.other4 || '',
              other5: entryData.other5 || '',
              isActive: true
            };

            let savedEntry;
            if (existingEntry) {
              Object.assign(existingEntry, entryPayload);
              savedEntry = await existingEntry.save();
              results.ledgerEntries.success.push({
                index: i,
                _id: savedEntry._id,
                ledgerguid: entryData.ledgerguid,
                ledgerName: entryLedger.LedgerName,
                action: 'Updated',
                amount: savedEntry.ledgeramount
              });
            } else {
              savedEntry = await LedgerEntries.create(entryPayload);
              results.ledgerEntries.success.push({
                index: i,
                _id: savedEntry._id,
                ledgerguid: entryData.ledgerguid,
                ledgerName: entryLedger.LedgerName,
                action: 'Created',
                amount: savedEntry.ledgeramount
              });
            }

            results.ledgerEntries.totalSuccess++;
            console.log(`✅ Ledger entry ${existingEntry ? 'updated' : 'created'}: ${entryLedger.LedgerName}`);

          } catch (entryError) {
            console.error(`❌ Error processing ledger entry ${i}:`, entryError);
            results.ledgerEntries.failed.push({
              index: i,
              ledgerguid: entryData.ledgerguid || 'N/A',
              error: entryError.message
            });
            results.ledgerEntries.totalFailed++;
          }
        }
      }

      // Step 5: Process inventory entries
      if (inventoryEntries && Array.isArray(inventoryEntries) && inventoryEntries.length > 0) {
        for (let i = 0; i < inventoryEntries.length; i++) {
          const entryData = inventoryEntries[i];
          results.inventoryEntries.totalProcessed++;

          try {
            const requiredFields = ['itemguid', 'itemamount'];
            const missingFields = requiredFields.filter(field => !entryData[field]);

            if (missingFields.length > 0) {
              results.inventoryEntries.failed.push({
                index: i,
                itemguid: entryData.itemguid || 'N/A',
                error: `Missing required fields: ${missingFields.join(', ')}`
              });
              results.inventoryEntries.totalFailed++;
              continue;
            }

            // Check if entry exists (update or create)
            // Note: We use a combination of vchguid, itemguid, and a unique identifier if available
            const existingEntry = await InventoryEntries.findOne({
              vchguid: voucher.vchguid,
              itemguid: entryData.itemguid,
              cmpcode: voucher.cmpcode,
              // If there's a unique identifier in other fields, use it
              ...(entryData.entryId ? { _id: entryData.entryId } : {})
            });

            const entryPayload = {
              cmpcode: voucher.cmpcode,
              companyId: company._id,
              vchguid: voucher.vchguid,
              voucherId: savedVoucher._id,
              itemguid: entryData.itemguid,
              itemmainqty: parseFloat(entryData.itemmainqty) || 0,
              itemaltqty: parseFloat(entryData.itemaltqty) || 0,
              itemmainunit: entryData.itemmainunit || '',
              itemaltunit: entryData.itemaltunit || '',
              itemrate: parseFloat(entryData.itemrate) || 0,
              itemrateunit: entryData.itemrateunit || '',
              itemdisc: parseFloat(entryData.itemdisc) || 0,
              itemamount: parseFloat(entryData.itemamount) || 0,
              itemdescription: entryData.itemdescription || '',
              other1: entryData.other1 || '',
              other2: entryData.other2 || '',
              other3: entryData.other3 || '',
              other4: entryData.other4 || '',
              other5: entryData.other5 || '',
              isActive: true
            };

            let savedEntry;
            if (existingEntry) {
              Object.assign(existingEntry, entryPayload);
              savedEntry = await existingEntry.save();
              results.inventoryEntries.success.push({
                index: i,
                _id: savedEntry._id,
                itemguid: entryData.itemguid,
                itemDescription: entryData.itemdescription || entryData.itemguid,
                action: 'Updated',
                quantity: savedEntry.itemmainqty,
                amount: savedEntry.itemamount
              });
            } else {
              savedEntry = await InventoryEntries.create(entryPayload);
              results.inventoryEntries.success.push({
                index: i,
                _id: savedEntry._id,
                itemguid: entryData.itemguid,
                itemDescription: entryData.itemdescription || entryData.itemguid,
                action: 'Created',
                quantity: savedEntry.itemmainqty,
                amount: savedEntry.itemamount
              });
            }

            results.inventoryEntries.totalSuccess++;
            console.log(`✅ Inventory entry ${existingEntry ? 'updated' : 'created'}: ${entryData.itemguid}`);

          } catch (entryError) {
            console.error(`❌ Error processing inventory entry ${i}:`, entryError);
            results.inventoryEntries.failed.push({
              index: i,
              itemguid: entryData.itemguid || 'N/A',
              error: entryError.message
            });
            results.inventoryEntries.totalFailed++;
          }
        }
      }

      // Prepare response
      const responseStatus = results.voucher.success ? 200 : 500;
      const hasFailures = results.ledgerEntries.totalFailed > 0 || results.inventoryEntries.totalFailed > 0;

      res.status(hasFailures && responseStatus === 200 ? 207 : responseStatus).json({
        success: results.voucher.success,
        message: `Voucher sync completed. Voucher: ${results.voucher.action}, Ledger Entries: ${results.ledgerEntries.totalSuccess}/${results.ledgerEntries.totalProcessed}, Inventory Entries: ${results.inventoryEntries.totalSuccess}/${results.inventoryEntries.totalProcessed}`,
        data: results
      });

    } catch (voucherError) {
      console.error('❌ Error processing voucher:', voucherError);
      results.voucher.error = voucherError.message;
      res.status(500).json({
        success: false,
        message: 'Failed to process voucher',
        error: voucherError.message,
        data: results
      });
    }

  } catch (error) {
    console.error('❌ Error in syncVoucherComplete:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync complete voucher',
      error: error.message
    });
  }
};

