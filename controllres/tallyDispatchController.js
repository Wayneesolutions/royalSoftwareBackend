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

        // Normalize cmpcode to uppercase to match Company.companyCode storage
        const cmpcode = data.cmpcode.trim().toUpperCase();

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
          companyCode: cmpcode,
          isActive: true,
        });

        if (!company) {
          results.push({
            success: false,
            index: i,
            orderguid: data.orderguid,
            error: `Company not found for cmpcode: ${cmpcode}`,
          });
          continue;
        }

        // Find ledger (optional - link if exists)
        let ledgerId = null;
        if (data.ledgerguid) {
          const ledger = await Ledger.findOne({
            LedgerGUID: data.ledgerguid,
            cmpcode,
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
          cmpcode,
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
          cmpcode,
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
    const { cmpcode: rawCmpcode, userId, dispatchStatus, page = 1, limit = 20 } = req.query;

    if (!rawCmpcode) {
      return res.status(400).json({ success: false, message: 'cmpcode is required' });
    }
    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const cmpcode = rawCmpcode.trim().toUpperCase();

    const company = await Company.findOne({ companyCode: cmpcode, isActive: true });
    if (!company) {
      return res.status(404).json({ success: false, message: `Company not found for cmpcode: ${cmpcode}` });
    }

    const user = await User.findById(userId).select('assignedDealerIds groups hierarchy').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const ledgerGUIDs = new Set();

    // Step 1: Resolve child user IDs (same logic as outstanding controller)
    const getAllChildUserIds = async (parentUserId, visited = new Set(), depth = 0) => {
      if (depth > 10 || visited.has(parentUserId.toString())) return [];
      visited.add(parentUserId.toString());
      const parentId = mongoose.Types.ObjectId.isValid(parentUserId)
        ? (typeof parentUserId === 'string' ? new mongoose.Types.ObjectId(parentUserId) : parentUserId)
        : parentUserId;
      try {
        const children = await User.find({
          $and: [
            { $or: [{ 'hierarchy.parentUserId': parentId }, { 'hierarchy.parentUser': parentId }] },
            { $or: [{ 'companies.companyId': company._id }, { defaultCompany: company._id }] },
            { isActive: true }
          ]
        }).select('_id').lean().maxTimeMS(5000);
        const childIds = children.map(c => c._id.toString());
        const nested = await Promise.all(childIds.map(id => getAllChildUserIds(id, visited, depth + 1)));
        return [...childIds, ...nested.flat()];
      } catch {
        return [];
      }
    };

    const childUserIds = await getAllChildUserIds(userId);
    const allUserIds = [userId, ...childUserIds];

    // Step 2: Group-based dealers — merge user's own groups + child users' groups
    // Filter by cmpcode to avoid cross-company leakage (same as outstanding controller)
    const allGroupIds = new Set();

    const collectGroupIds = (groups) => {
      (groups || [])
        .filter(g => g.isActive && g.cmpcode === cmpcode && g.groupId)
        .forEach(g => {
          const gid = typeof g.groupId === 'object' && g.groupId._id ? g.groupId._id : g.groupId;
          if (mongoose.Types.ObjectId.isValid(gid)) {
            allGroupIds.add(typeof gid === 'string' ? new mongoose.Types.ObjectId(gid) : gid);
          }
        });
    };

    collectGroupIds(user.groups);

    if (childUserIds.length > 0) {
      const childUsers = await User.find({ _id: { $in: childUserIds }, isActive: true }).select('groups').lean();
      childUsers.forEach(cu => collectGroupIds(cu.groups));
    }

    if (allGroupIds.size > 0) {
      const groupLedgers = await Ledger.find({
        groupId: { $in: Array.from(allGroupIds) },
        companyId: company._id,
        isActive: true,
      }).select('LedgerGUID').lean();
      groupLedgers.forEach(l => l.LedgerGUID && ledgerGUIDs.add(l.LedgerGUID));
    }

    // Step 3: Directly assigned dealers (assignedDealerIds)
    const assignedDealerObjectIds = (user.assignedDealerIds || [])
      .map(id => {
        const resolved = typeof id === 'object' && id._id ? id._id : id;
        return mongoose.Types.ObjectId.isValid(resolved)
          ? (typeof resolved === 'string' ? new mongoose.Types.ObjectId(resolved) : resolved)
          : null;
      })
      .filter(Boolean);

    if (assignedDealerObjectIds.length > 0) {
      const assignedLedgers = await Ledger.find({
        _id: { $in: assignedDealerObjectIds },
        companyId: company._id,
        isActive: true,
      }).select('LedgerGUID').lean();
      assignedLedgers.forEach(l => l.LedgerGUID && ledgerGUIDs.add(l.LedgerGUID));
    }

    // Step 4: Dealers created by this user (or child users)
    const userObjectIds = allUserIds.map(id =>
      mongoose.Types.ObjectId.isValid(id)
        ? (typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id)
        : id
    );
    const createdLedgers = await Ledger.find({
      createdBy: { $in: userObjectIds },
      companyId: company._id,
      isActive: true,
    }).select('LedgerGUID').lean();
    createdLedgers.forEach(l => l.LedgerGUID && ledgerGUIDs.add(l.LedgerGUID));

    // Step 5: Child users' directly assigned dealers
    if (childUserIds.length > 0) {
      const childUsers = await User.find({ _id: { $in: childUserIds }, isActive: true }).select('assignedDealerIds').lean();
      const childDealerIds = [];
      childUsers.forEach(cu => {
        (cu.assignedDealerIds || []).forEach(id => {
          const resolved = typeof id === 'object' && id._id ? id._id : id;
          if (mongoose.Types.ObjectId.isValid(resolved)) {
            childDealerIds.push(typeof resolved === 'string' ? new mongoose.Types.ObjectId(resolved) : resolved);
          }
        });
      });
      if (childDealerIds.length > 0) {
        const childAssigned = await Ledger.find({
          _id: { $in: childDealerIds },
          companyId: company._id,
          isActive: true,
        }).select('LedgerGUID').lean();
        childAssigned.forEach(l => l.LedgerGUID && ledgerGUIDs.add(l.LedgerGUID));
      }
    }

    const ledgerGUIDsArray = Array.from(ledgerGUIDs);

    if (ledgerGUIDsArray.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No dealers found for this user',
        data: { dispatches: [], pagination: { totalCount: 0 } },
      });
    }

    const filter = {
      ledgerguid: { $in: ledgerGUIDsArray },
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
    const { cmpcode: rawCmpcode, ledgerguid, dispatchStatus, page = 1, limit = 20 } = req.query;

    if (!rawCmpcode) {
      return res.status(400).json({ success: false, message: 'cmpcode is required' });
    }

    const cmpcode = rawCmpcode.trim().toUpperCase();
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
