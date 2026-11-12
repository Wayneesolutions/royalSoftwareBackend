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

/**
 * @swagger
 * tags:
 *   name: Approvals
 *   description: Order approval workflow endpoints
 */

/**
 * @swagger
 * /api/v1/approvals/submit/{orderId}:
 *   post:
 *     summary: Submit an order for approval
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order submitted for approval
 */
router.post('/submit/:orderId', submitOrderForApproval);

/**
 * @swagger
 * /api/v1/approvals/pending:
 *   get:
 *     summary: Get all orders pending approval for the current user
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of pending approval orders
 */
router.get('/pending', getPendingApprovals);

/**
 * @swagger
 * /api/v1/approvals/bulk-action:
 *   post:
 *     summary: Bulk approve or reject multiple orders at once
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderIds
 *               - action
 *             properties:
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["6a95406c72ce30f394d38fa9"]
 *               action:
 *                 type: string
 *                 enum: [approved, rejected]
 *                 example: approved
 *               notes:
 *                 type: string
 *                 example: "Bulk approved"
 *     responses:
 *       200:
 *         description: All orders processed successfully
 *       207:
 *         description: Partial success - some orders processed, some failed
 *       400:
 *         description: All orders failed or invalid input
 */
router.post('/bulk-action', bulkApproveRejectOrders);

/**
 * @swagger
 * /api/v1/approvals/my-orders:
 *   get:
 *     summary: Get orders created by the current user
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of orders created by user
 */
router.get('/my-orders', getMyOrders);

/**
 * @swagger
 * /api/v1/approvals/{orderId}/action:
 *   post:
 *     summary: Approve or reject a single order
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - action
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [approved, rejected]
 *                 example: approved
 *               notes:
 *                 type: string
 *                 example: "Approved by admin"
 *     responses:
 *       200:
 *         description: Order approved or rejected
 */
router.post('/:orderId/action', approveRejectOrder);

/**
 * @swagger
 * /api/v1/approvals/{orderId}/unapprove:
 *   post:
 *     summary: Revert an approved order back to pending_approval
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of an order with status = approved
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Returning for correction"
 *     responses:
 *       200:
 *         description: Order returned to pending approval
 *       404:
 *         description: Order not found or not in approved status
 */
router.post('/:orderId/unapprove', unapproveOrder);

/**
 * @swagger
 * /api/v1/approvals/{orderId}/history:
 *   get:
 *     summary: Get approval history for an order
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Approval history
 */
router.get('/:orderId/history', getApprovalHistory);

export default router;
