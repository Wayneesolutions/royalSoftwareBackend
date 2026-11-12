import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  submitOrderForApproval,
  getPendingApprovals,
  approveRejectOrder,
  bulkApproveRejectOrders,
  unapproveOrder,
  getApprovalHistory,
  getMyOrders
} from '../controllres/approvalController.js';

const router = express.Router();

// All routes require authentication
router.use(authMiddleware());

// Submit order for approval
router.post('/submit/:orderId', submitOrderForApproval);

// Get orders pending approval for current user
router.get('/pending', getPendingApprovals);

// Bulk approve or reject multiple orders
router.post('/bulk-action', bulkApproveRejectOrders);

// Approve or reject a single order
router.post('/:orderId/action', approveRejectOrder);

// Unapprove (revert approved order back to pending_approval)
router.post('/:orderId/unapprove', unapproveOrder);

// Get approval history for an order
router.get('/:orderId/history', getApprovalHistory);

// Get orders created by current user
router.get('/my-orders', getMyOrders);

export default router;
