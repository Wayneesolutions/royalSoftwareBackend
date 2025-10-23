import express from 'express';
import {
  getApprovedOrders,
  updateOrderTallyInfo,
  getTargets,
  updateTargetsFromTally,
  getCompanyInfo,
  getOrderStats,
  syncLedgerData
} from '../controllres/tallyController.js';

const router = express.Router();

// Note: These routes are for Tally integration and don't require authentication
// Tally owners will use these endpoints directly

// ==================== ORDER MANAGEMENT ====================

// GET: Fetch approved orders for Tally sync
router.get('/orders/approved', getApprovedOrders);

// POST: Update order with Tally GUID after voucher creation
router.post('/orders/update-tally-info', updateOrderTallyInfo);

// ==================== TARGET MANAGEMENT ====================

// GET: Fetch targets for Tally comparison
router.get('/targets', getTargets);

// POST: Update targets with Tally data
router.post('/targets/update-from-tally', updateTargetsFromTally);

// ==================== COMPANY & USER INFO ====================

// GET: Fetch company and user information
router.get('/company/info', getCompanyInfo);

// ==================== STATISTICS ====================

// GET: Fetch order statistics
router.get('/orders/stats', getOrderStats);

// ==================== LEDGER & OUTSTANDING ====================

// POST: Sync ledger/outstanding data from Tally
router.post('/ledger/sync', syncLedgerData);

export default router;
