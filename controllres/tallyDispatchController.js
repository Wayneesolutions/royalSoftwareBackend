import TallyDispatch from '../models/dispatch/tallyDispatchModel.js';
import Company from '../models/company/companyModel.js';
import Ledger from '../models/ledger/ledgerModel.js';
import User from '../models/user/userModel.js';
import mongoose from 'mongoose';

/**
 * @desc    Sync order dispatch status from Tally
 * @route   POST /api/v1/tally/dispatch/sync
 * @access  Public (No auth - Tally integration)
 */
export const syncDispatchFromTally = async (req, res) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request body',
        });
      }
    }

    // Support both single object and array
    const dispatchData = Array.isArray(body) ? body : [body];
    const results = [];

    for (let i = 0; i < dispatchData.length; i++) {
      const data = dispatchData[i];

      try {
        // Validate required fields
        const requiredFields = ['cmpcode', 'orderguid', 'dispatchStatus'];
        const missingFields = requiredFields.filter(f => !data[f]);

        if (missingFields.length > 0) {
          results.push({
            success: false,
            index: i,
            error: `Missing required fields: ${missingFields.join(', ')}`,
          });
          continue;
        }

        // Validate dispatchStatus
        if (!['pending', 'fully_dispatched'].includes(data.dispatchStatus)) {
          results.push({
            success: false,
            index: i,
            orderguid: data.orderguid,
            error: `Invalid dispatchStatus. Must be "pending" or "fully_dispatched"`,
          });
          continue;
        }

        // Find company
        const company = await Company.findOne({
          companyCode: data.cmpcode,
          isActive: true,
        });

        if (!company) {
          results.push({
            success: false,
            index: i,
            orderguid: data.orderguid,
            error: `Company not found for cmpcode: ${data.cmpcode}`,
          });
          continue;
        }

        // Find ledger (optional - link if exists)
        let ledgerId = null;
        if (data.ledgerguid) {
          const ledger = await Ledger.findOne({
            LedgerGUID: data.ledgerguid,
            cmpcode: data.cmpcode,
            isActive: true,
          }).select('_id');
          if (ledger) ledgerId = ledger._id;
        }

        // Build items array (trust pendingQty from Tally)
        const items = Array.isArray(data.items)
          ? data.items.map(item => ({
              itemName: item.itemName || '',
              hsnCode: item.hsnCode || '',
              unit: item.unit || '',
              orderedQty: parseFloat(item.orderedQty) || 0,
              dispatchedQty: parseFloat(item.dispatchedQty) || 0,
              pendingQty: parseFloat(item.pendingQty) || 0,
              rate: parseFloat(item.rate) || 0,
              amount: parseFloat(item.amount) || 0,
            }))
          : [];

        const payload = {
          orderguid: data.orderguid,
          cmpcode: data.cmpcode,
          orderNumber: data.orderNumber || null,
          orderDate: data.orderDate ? new Date(data.orderDate) : null,
          ledgerguid: data.ledgerguid || null,
          partyName: data.partyName || null,
          totalAmount: parseFloat(data.totalAmount) || 0,
          dispatchStatus: data.dispatchStatus,
          items,
          companyId: company._id,
          ledgerId,
          tallySyncAt: new Date(),
          isActive: true,
        };

        // Upsert by orderguid + cmpcode
        const existing = await TallyDispatch.findOne({
          orderguid: data.orderguid,
          cmpcode: data.cmpcode,
        });

        let saved;
        let action;

        if (existing) {
          Object.assign(existing, payload);
          saved = await existing.save();
          action = 'updated';
        } else {
          saved = await TallyDispatch.create(payload);
          action = 'created';
        }

        results.push({
          success: true,
          index: i,
          action,
          data: {
            _id: saved._id,
            orderguid: saved.orderguid,
            orderNumber: saved.orderNumber,
            dispatchStatus: saved.dispatchStatus,
            totalAmount: saved.totalAmount,
            itemCount: saved.items.length,
          },
        });
      } catch (err) {
        results.push({
          success: false,
          index: i,
          orderguid: data.orderguid,
          error: err.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const statusCode = failedCount === 0 ? 200 : successCount > 0 ? 207 : 400;

    return res.status(statusCode).json({
      success: failedCount === 0,
      message: `Dispatch sync completed. Success: ${successCount}, Failed: ${failedCount}`,
      data: {
        results,
        summary: {
          totalProcessed: results.length,
          totalSuccess: successCount,
          totalFailed: failedCount,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error syncing dispatch from Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync dispatch from Tally',
      error: error.message,
    });
  }
};

/**
 * @desc    Get dispatch records for a group user (own dealers)
 * @route   GET /api/v1/tally/dispatch/group-user
 * @access  Public (No auth - Tally integration)
 */
export const getDispatchForGroupUser = async (req, res) => {
  try {
    const { cmpcode, userId, dispatchStatus, page = 1, limit = 20 } = req.query;

    if (!cmpcode) {
      return res.status(400).json({ success: false, message: 'cmpcode is required' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    // Find company
    const company = await Company.findOne({ companyCode: cmpcode, isActive: true });
    if (!company) {
      return res.status(404).json({ success: false, message: `Company not found for cmpcode: ${cmpcode}` });
    }

    // Find user with assigned dealers
    const user = await User.findById(userId).select('assignedDealerIds groups').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get ledger GUIDs from assignedDealerIds
    const assignedLedgerIds = (user.assignedDealerIds || [])
      .map(id => {
        if (typeof id === 'object' && id._id) return id._id;
        if (mongoose.Types.ObjectId.isValid(id)) return typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id;
        return null;
      })
      .filter(Boolean);

    let ledgerGUIDs = [];
    if (assignedLedgerIds.length > 0) {
      const ledgers = await Ledger.find({
        _id: { $in: assignedLedgerIds },
        companyId: company._id,
        isActive: true,
      }).select('LedgerGUID').lean();
      ledgerGUIDs = ledgers.map(l => l.LedgerGUID).filter(Boolean);
    }

    if (ledgerGUIDs.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No dealers assigned to this user',
        data: { dispatches: [], pagination: { totalCount: 0 } },
      });
    }

    // Build filter
    const filter = {
      ledgerguid: { $in: ledgerGUIDs },
      cmpcode,
      isActive: true,
    };
    if (dispatchStatus && ['pending', 'fully_dispatched'].includes(dispatchStatus)) {
      filter.dispatchStatus = dispatchStatus;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await TallyDispatch.countDocuments(filter);

    const dispatches = await TallyDispatch.find(filter)
      .sort({ orderDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Dispatch records fetched successfully',
      data: {
        dispatches,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNext: skip + dispatches.length < totalCount,
          hasPrev: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error fetching dispatch for group user:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dispatch records',
      error: error.message,
    });
  }
};

/**
 * @desc    Get dispatch records for admin (all or filtered by cmpcode)
 * @route   GET /api/v1/tally/dispatch/admin
 * @access  Public (No auth - Tally integration)
 */
export const getDispatchForAdmin = async (req, res) => {
  try {
    const { cmpcode, ledgerguid, dispatchStatus, page = 1, limit = 20 } = req.query;

    if (!cmpcode) {
      return res.status(400).json({ success: false, message: 'cmpcode is required' });
    }

    const filter = { cmpcode, isActive: true };
    if (ledgerguid) filter.ledgerguid = ledgerguid;
    if (dispatchStatus && ['pending', 'fully_dispatched'].includes(dispatchStatus)) {
      filter.dispatchStatus = dispatchStatus;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const totalCount = await TallyDispatch.countDocuments(filter);

    const dispatches = await TallyDispatch.find(filter)
      .sort({ orderDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Dispatch records fetched successfully',
      data: {
        dispatches,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalCount,
          hasNext: skip + dispatches.length < totalCount,
          hasPrev: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    console.error('❌ Error fetching dispatch for admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dispatch records',
      error: error.message,
    });
  }
};
