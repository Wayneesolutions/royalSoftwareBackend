import express from 'express';
import {
  syncLedgerEntries,
  getLedgerEntries,
  getLedgerEntriesByVoucher,
  getLedgerEntriesByLedger,
  deleteLedgerEntry
} from '../controllres/ledgerEntriesController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: LedgerEntries
 *   description: Ledger Entries Management APIs - Links vouchers with ledgers
 */

/**
 * @swagger
 * /api/v1/ledger-entries/sync:
 *   post:
 *     summary: Sync ledger entries from Tally (Single or Bulk) - No Authentication Required
 *     tags: [LedgerEntries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entries
 *             properties:
 *               entries:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - cmpcode
 *                     - vchguid
 *                     - ledgerguid
 *                     - ledgeramount
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                       example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                       description: Company code (must exist in system)
 *                     vchguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       description: Voucher GUID (must exist in system)
 *                     ledgerguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                       description: Ledger GUID (must exist in system)
 *                     ledgeramount:
 *                       type: number
 *                       example: 10000.00
 *                       description: Amount for this ledger entry
 *                     other1:
 *                       type: string
 *                       example: "Debit"
 *                       description: Custom field 1 (e.g., Debit/Credit type)
 *                     other2:
 *                       type: string
 *                       example: "Customer Account"
 *                       description: Custom field 2 (e.g., Account type)
 *                     other3:
 *                       type: string
 *                       example: "Invoice Payment"
 *                       description: Custom field 3 (e.g., Transaction type)
 *                     other4:
 *                       type: string
 *                       example: "Q4 2024"
 *                       description: Custom field 4 (e.g., Period)
 *                     other5:
 *                       type: string
 *                       example: "Approved"
 *                       description: Custom field 5 (e.g., Status)
 *           example:
 *             entries:
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                 ledgeramount: 10000.00
 *                 other1: "Debit"
 *                 other2: "Customer Account"
 *                 other3: "Invoice Payment"
 *                 other4: "Q4 2024"
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 ledgerguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2"
 *                 ledgeramount: -10000.00
 *                 other1: "Credit"
 *                 other2: "Sales Account"
 *                 other3: "Invoice Payment"
 *                 other4: "Q4 2024"
 *     responses:
 *       200:
 *         description: Ledger entries synced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Ledger entries sync completed. Success: 2, Failed: 0"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: number
 *                           vchguid:
 *                             type: string
 *                           ledgerguid:
 *                             type: string
 *                           action:
 *                             type: string
 *                             enum: [Created, Updated]
 *                           voucherNumber:
 *                             type: string
 *                           ledgerName:
 *                             type: string
 *                           amount:
 *                             type: number
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: number
 *                           vchguid:
 *                             type: string
 *                           ledgerguid:
 *                             type: string
 *                           error:
 *                             type: string
 *                     totalProcessed:
 *                       type: number
 *                     totalSuccess:
 *                       type: number
 *                     totalFailed:
 *                       type: number
 *       400:
 *         description: Bad request - validation error
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.post('/sync', syncLedgerEntries);

/**
 * @swagger
 * /api/v1/ledger-entries/list:
 *   get:
 *     summary: Get ledger entries with filters - No Authentication Required
 *     tags: [LedgerEntries]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *       - in: query
 *         name: vchguid
 *         schema:
 *           type: string
 *         description: Filter by voucher GUID
 *       - in: query
 *         name: ledgerguid
 *         schema:
 *           type: string
 *         description: Filter by ledger GUID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Ledger entries fetched successfully
 *       400:
 *         description: Company code is required
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/list', getLedgerEntries);

/**
 * @swagger
 * /api/v1/ledger-entries/by-voucher/{vchguid}:
 *   get:
 *     summary: Get all ledger entries for a specific voucher - No Authentication Required
 *     tags: [LedgerEntries]
 *     parameters:
 *       - in: path
 *         name: vchguid
 *         required: true
 *         schema:
 *           type: string
 *         description: Voucher GUID
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *     responses:
 *       200:
 *         description: Ledger entries fetched successfully
 *       404:
 *         description: No ledger entries found for this voucher
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/by-voucher/:vchguid', getLedgerEntriesByVoucher);

/**
 * @swagger
 * /api/v1/ledger-entries/by-ledger/{ledgerguid}:
 *   get:
 *     summary: Get all ledger entries for a specific ledger - No Authentication Required
 *     tags: [LedgerEntries]
 *     parameters:
 *       - in: path
 *         name: ledgerguid
 *         required: true
 *         schema:
 *           type: string
 *         description: Ledger GUID
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *     responses:
 *       200:
 *         description: Ledger entries fetched successfully
 *       404:
 *         description: No ledger entries found for this ledger
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/by-ledger/:ledgerguid', getLedgerEntriesByLedger);

/**
 * @swagger
 * /api/v1/ledger-entries/{id}:
 *   delete:
 *     summary: Delete ledger entry (soft delete) - Authentication Required
 *     tags: [LedgerEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Ledger entry ID
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *     responses:
 *       200:
 *         description: Ledger entry deleted successfully
 *       404:
 *         description: Ledger entry not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// ✅ Authentication required for DELETE (destructive operation)
router.delete('/:id', requireAuth, deleteLedgerEntry);

export default router;

