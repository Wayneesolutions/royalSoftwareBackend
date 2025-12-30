import VoucherMaster from '../models/voucher/voucherMasterModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import Company from '../models/company/companyModel.js';
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

