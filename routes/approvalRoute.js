import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
import {
  submitOrderForApproval,
  getPendingApprovals,
  approveRejectOrder,
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

// Approve or reject an order
router.post('/:orderId/action', approveRejectOrder);

// Get approval history for an order
router.get('/:orderId/history', getApprovalHistory);

// Get orders created by current user
router.get('/my-orders', getMyOrders);

export default router;
