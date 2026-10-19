import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import Company from '../models/company/companyModel.js';
import LedgerEntries from '../models/ledger/ledgerEntriesModel.js';
import InventoryEntries from '../models/inventory/inventoryEntriesModel.js';
import mongoose from 'mongoose';

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Find an active ledger/dealer by GUID inside a company.
 * Tolerant of whitespace/case differences in the GUID, matches the company by
 * companyId OR cmpcode/cmpCode (older dealers may have only one of them set),
 * and treats a missing isActive flag as active.
 */
const findActiveLedger = async (guid, cmpcode, companyId) => {
  const cleanGuid = String(guid ?? '').trim();
  const cleanCode = String(cmpcode ?? '').trim();
  const scope = {
    $or: [{ companyId }, { cmpcode: cleanCode }, { cmpCode: cleanCode }],
    isActive: { $ne: false }
  };

  // Fast path: exact GUID uses the LedgerGUID index
  const exact = await Ledger.findOne({ LedgerGUID: cleanGuid, ...scope });
  if (exact) return exact;

  // Slow path (only on a miss): tolerate stray whitespace / case differences
  return Ledger.findOne({
    LedgerGUID: { $regex: new RegExp(`^\\s*${escapeRegex(cleanGuid)}\\s*$`, 'i') },
    ...scope
  });
};

/**
 * Explain why a ledger lookup failed, so the sync error is actionable.
 */
const explainLedgerMiss = async (guid, cmpcode) => {
  const cleanGuid = String(guid ?? '').trim();
  const found = await Ledger.findOne({
    LedgerGUID: { $regex: new RegExp(`^\\s*${escapeRegex(cleanGuid)}\\s*$`, 'i') }
  }).select('LedgerName cmpcode cmpCode isActive companyId');

  if (!found) {
    return `Ledger/Dealer not found for LedgerGUID: ${cleanGuid} in any company. Sync ledgers (POST /api/v1/tally/ledger/sync) before vouchers`;
  }
  if (found.isActive === false) {
    return `Ledger/Dealer "${found.LedgerName}" exists for LedgerGUID: ${cleanGuid} but is inactive`;
  }
  return `Ledger/Dealer "${found.LedgerName}" exists for LedgerGUID: ${cleanGuid} but under a different company (ledger cmpcode: ${found.cmpcode || found.cmpCode || 'N/A'}, voucher cmpcode: ${String(cmpcode).trim()})`;
};

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
        const ledger = await findActiveLedger(voucherData.vchpartyguid, voucherData.cmpcode, company._id);

        if (!ledger) {
          results.failed.push({
            index: i,
            vchguid: voucherData.vchguid,
            vchnumber: voucherData.vchnumber,
            error: `${await explainLedgerMiss(voucherData.vchpartyguid, voucherData.cmpcode)} (company: ${voucherData.cmpcode})`
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
 *
 * Accepts two body formats:
 *   1. Array (Tally flat format): [{ cmpcode, vchguid, ..., ledgerEntries: [...], inventoryEntries: [...] }, ...]
 *   2. Legacy object format:      { voucher: {...}, ledgerEntries: [...], inventoryEntries: [...] }
 */

// Parse Tally date strings like "07/May/2026 00:00:00" or any ISO-compatible string
const parseTallyDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Handle "DD/MMM/YYYY ..." format e.g. "07/May/2026 00:00:00"
  const m = dateStr.match(/^(\d{1,2})\/([A-Za-z]{3})\/(\d{4})/);
  if (m) return new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  return null;
};

const processSingleVoucher = async (voucher, ledgerEntries, inventoryEntries) => {
  const results = {
    voucher: { success: false, action: null, error: null, data: null },
    ledgerEntries: { success: [], failed: [], totalProcessed: 0, totalSuccess: 0, totalFailed: 0 },
    inventoryEntries: { success: [], failed: [], totalProcessed: 0, totalSuccess: 0, totalFailed: 0 }
  };

  // Validate required fields
  const requiredVoucherFields = ['cmpcode', 'vchguid', 'vchnumber', 'vchdate', 'vchtype', 'vchpartyguid', 'vchamount'];
  const missingVoucherFields = requiredVoucherFields.filter(field => voucher[field] == null || voucher[field] === '');
  if (missingVoucherFields.length > 0) {
    results.voucher.error = `Missing required voucher fields: ${missingVoucherFields.join(', ')}`;
    return results;
  }

  const vchDate = parseTallyDate(voucher.vchdate);
  if (!vchDate) {
    results.voucher.error = `Invalid vchdate format: "${voucher.vchdate}". Expected formats: ISO date or "DD/MMM/YYYY HH:MM:SS"`;
    return results;
  }

  // Step 1: Company lookup
  const company = await Company.findOne({ companyCode: String(voucher.cmpcode).trim(), isActive: true });
  if (!company) {
    results.voucher.error = `Company not found or inactive for cmpcode: ${voucher.cmpcode}`;
    return results;
  }

  // Step 2: Party ledger lookup
  const ledger = await findActiveLedger(voucher.vchpartyguid, voucher.cmpcode, company._id);
  if (!ledger) {
    results.voucher.error = `${await explainLedgerMiss(voucher.vchpartyguid, voucher.cmpcode)} (company: ${voucher.cmpcode})`;
    return results;
  }

  // Step 3: Create or update VoucherMaster
  try {
    const existingVoucher = await VoucherMaster.findOne({ vchguid: voucher.vchguid, cmpcode: voucher.cmpcode });

    const voucherPayload = {
      companyguid: company.CompanyGuid || company.companyCode,
      cmpcode: voucher.cmpcode,
      companyId: company._id,
      vchguid: voucher.vchguid,
      vchnumber: voucher.vchnumber,
      vchdate: vchDate,
      vchtype: voucher.vchtype,
      vchtypeparent: voucher.vchtypeparent || '',
      vchpartyguid: voucher.vchpartyguid,
      ledgerId: ledger._id,
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
      isActive: true
    };

    let savedVoucher;
    if (existingVoucher) {
      Object.assign(existingVoucher, voucherPayload);
      savedVoucher = await existingVoucher.save();
      results.voucher.action = 'Updated';
    } else {
      savedVoucher = await VoucherMaster.create(voucherPayload);
      results.voucher.action = 'Created';
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

    console.log(`✅ Voucher ${results.voucher.action}: ${savedVoucher.vchnumber} (${savedVoucher._id})`);

    // Step 4: Process ledger entries
    if (Array.isArray(ledgerEntries) && ledgerEntries.length > 0) {
      for (let i = 0; i < ledgerEntries.length; i++) {
        const entryData = ledgerEntries[i];
        results.ledgerEntries.totalProcessed++;
        try {
          if (!entryData.ledgerguid || entryData.ledgeramount == null) {
            results.ledgerEntries.failed.push({ index: i, ledgerguid: entryData.ledgerguid || 'N/A', error: 'Missing ledgerguid or ledgeramount' });
            results.ledgerEntries.totalFailed++;
            continue;
          }

          const entryLedger = await findActiveLedger(entryData.ledgerguid, voucher.cmpcode, company._id);

          if (!entryLedger) {
            results.ledgerEntries.failed.push({ index: i, ledgerguid: entryData.ledgerguid, error: await explainLedgerMiss(entryData.ledgerguid, voucher.cmpcode) });
            results.ledgerEntries.totalFailed++;
            continue;
          }

          const existingEntry = await LedgerEntries.findOne({ vchguid: voucher.vchguid, ledgerguid: entryData.ledgerguid, cmpcode: voucher.cmpcode });

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
          } else {
            savedEntry = await LedgerEntries.create(entryPayload);
          }

          results.ledgerEntries.success.push({ index: i, _id: savedEntry._id, ledgerguid: entryData.ledgerguid, ledgerName: entryLedger.LedgerName, action: existingEntry ? 'Updated' : 'Created', amount: savedEntry.ledgeramount });
          results.ledgerEntries.totalSuccess++;

        } catch (entryError) {
          results.ledgerEntries.failed.push({ index: i, ledgerguid: entryData.ledgerguid || 'N/A', error: entryError.message });
          results.ledgerEntries.totalFailed++;
        }
      }
    }

    // Step 5: Process inventory entries
    if (Array.isArray(inventoryEntries) && inventoryEntries.length > 0) {
      for (let i = 0; i < inventoryEntries.length; i++) {
        const entryData = inventoryEntries[i];
        results.inventoryEntries.totalProcessed++;
        try {
          if (!entryData.itemguid || entryData.itemamount == null) {
            results.inventoryEntries.failed.push({ index: i, itemguid: entryData.itemguid || 'N/A', error: 'Missing itemguid or itemamount' });
            results.inventoryEntries.totalFailed++;
            continue;
          }

          const existingEntry = await InventoryEntries.findOne({ vchguid: voucher.vchguid, itemguid: entryData.itemguid, cmpcode: voucher.cmpcode });

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
          } else {
            savedEntry = await InventoryEntries.create(entryPayload);
          }

          results.inventoryEntries.success.push({ index: i, _id: savedEntry._id, itemguid: entryData.itemguid, action: existingEntry ? 'Updated' : 'Created', quantity: savedEntry.itemmainqty, amount: savedEntry.itemamount });
          results.inventoryEntries.totalSuccess++;

        } catch (entryError) {
          results.inventoryEntries.failed.push({ index: i, itemguid: entryData.itemguid || 'N/A', error: entryError.message });
          results.inventoryEntries.totalFailed++;
        }
      }
    }

  } catch (voucherError) {
    results.voucher.error = voucherError.message;
    console.error(`❌ Error saving voucher ${voucher.vchnumber}:`, voucherError.message);
  }

  return results;
};

export const syncVoucherComplete = async (req, res) => {
  try {
    // Parse body if it's a string (tally routes use text parser)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
      }
    }

    // Normalize to array of { voucher, ledgerEntries, inventoryEntries }
    let items = [];
    if (Array.isArray(body)) {
      // Tally flat array format: each element IS the voucher, with embedded entries
      items = body.map(item => ({
        voucher: item,
        ledgerEntries: Array.isArray(item.ledgerEntries) ? item.ledgerEntries : [],
        inventoryEntries: Array.isArray(item.inventoryEntries) ? item.inventoryEntries : []
      }));
    } else if (body && typeof body === 'object' && body.voucher) {
      // Legacy single-object format: { voucher: {...}, ledgerEntries: [...], inventoryEntries: [...] }
      items = [{
        voucher: body.voucher,
        ledgerEntries: Array.isArray(body.ledgerEntries) ? body.ledgerEntries : [],
        inventoryEntries: Array.isArray(body.inventoryEntries) ? body.inventoryEntries : []
      }];
    } else {
      return res.status(400).json({ success: false, message: 'Voucher data is required. Send an array or { voucher, ledgerEntries, inventoryEntries }' });
    }

    if (items.length === 0) {
      return res.status(400).json({ success: false, message: 'No vouchers to process' });
    }

    console.log(`📥 sync-complete: processing ${items.length} voucher(s)`);

    const allResults = [];
    for (const { voucher, ledgerEntries, inventoryEntries } of items) {
      const result = await processSingleVoucher(voucher, ledgerEntries, inventoryEntries);
      allResults.push({ vchguid: voucher.vchguid, vchnumber: voucher.vchnumber, ...result });
    }

    const totalSuccess = allResults.filter(r => r.voucher.success).length;
    const totalFailed = allResults.length - totalSuccess;
    const hasPartialFailures = allResults.some(r => r.ledgerEntries.totalFailed > 0 || r.inventoryEntries.totalFailed > 0);

    const httpStatus = totalFailed === allResults.length ? 500 : (hasPartialFailures || totalFailed > 0 ? 207 : 200);

    res.status(httpStatus).json({
      success: totalFailed === 0,
      message: `Sync completed. Vouchers: ${totalSuccess} succeeded, ${totalFailed} failed`,
      data: allResults.length === 1 ? allResults[0] : allResults
    });

  } catch (error) {
    console.error('❌ Error in syncVoucherComplete:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync complete voucher',
      error: error.message
    });
  }
};

