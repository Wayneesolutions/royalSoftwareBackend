import express from 'express';
import {
  syncVouchersFromTally,
  getVouchersByCompany,
  getVoucherByGuid,
  deleteVoucher,
  getVoucherStats
} from '../controllres/voucherController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Voucher
 *   description: Tally Voucher Management APIs
 */

/**
 * @swagger
 * /api/v1/voucher/sync:
 *   post:
 *     summary: Sync vouchers from Tally (Single or Bulk) - No Authentication Required
 *     tags: [Voucher]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vouchers
 *             properties:
 *               vouchers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - cmpcode
 *                     - vchguid
 *                     - vchnumber
 *                     - vchdate
 *                     - vchtype
 *                     - vchpartyguid
 *                     - vchamount
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                       example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                     vchguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                     vchnumber:
 *                       type: string
 *                       example: "INV-2024-001"
 *                     vchdate:
 *                       type: string
 *                       format: date
 *                       example: "2024-12-30"
 *                     vchtype:
 *                       type: string
 *                       example: "Sales"
 *                     vchtypeparent:
 *                       type: string
 *                       example: "Invoice"
 *                     vchpartyguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1"
 *                       description: Ledger GUID (must exist in system)
 *                     vchpartyname:
 *                       type: string
 *                       example: "ABC Traders"
 *                     vchpartyadd1:
 *                       type: string
 *                       example: "123 Main Street"
 *                     vchpartyadd2:
 *                       type: string
 *                       example: "Near City Mall"
 *                     vchpartyadd3:
 *                       type: string
 *                       example: "Ludhiana, Punjab"
 *                     vchpartygstin:
 *                       type: string
 *                       example: "03AABCU9603R1ZM"
 *                     vchsubdealername:
 *                       type: string
 *                       example: "Sub Dealer Name"
 *                     vchsubdealeradd1:
 *                       type: string
 *                       example: "Sub Dealer Address Line 1"
 *                     vchsubdealeradd2:
 *                       type: string
 *                       example: "Sub Dealer Address Line 2"
 *                     vchsubdealeradd3:
 *                       type: string
 *                       example: "Sub Dealer Address Line 3"
 *                     isinvoice:
 *                       type: string
 *                       enum: [Yes, No]
 *                       example: "Yes"
 *                     vchgrno:
 *                       type: string
 *                       example: "GR-12345"
 *                     vchtransport:
 *                       type: string
 *                       example: "Royal Transport"
 *                     vchtruckno:
 *                       type: string
 *                       example: "PB-05-1234"
 *                     vchdrivername:
 *                       type: string
 *                       example: "Rajesh Kumar"
 *                     vchdrivermobile:
 *                       type: string
 *                       example: "9876543210"
 *                     vchdestination:
 *                       type: string
 *                       example: "Delhi"
 *                     vchpymtterms:
 *                       type: string
 *                       example: "Net 30 Days"
 *                     vchotherref:
 *                       type: string
 *                       example: "PO-2024-001"
 *                     vchqtunit:
 *                       type: string
 *                       example: "PCS"
 *                     vchqtunit2:
 *                       type: string
 *                       example: "KG"
 *                     vchgoodsamt:
 *                       type: number
 *                       example: 50000.00
 *                     vchamount:
 *                       type: number
 *                       example: 59000.00
 *                     vchnarration:
 *                       type: string
 *                       example: "Sale of goods as per order"
 *                     remarks:
 *                       type: string
 *                       example: "Payment received"
 *                     other1:
 *                       type: string
 *                       example: "Custom field 1"
 *                     other2:
 *                       type: string
 *                       example: "Custom field 2"
 *                     other3:
 *                       type: string
 *                       example: "Custom field 3"
 *                     other4:
 *                       type: string
 *                       example: "Custom field 4"
 *                     other5:
 *                       type: string
 *                       example: "Custom field 5"
 *                     other6:
 *                       type: string
 *                       example: "Custom field 6"
 *                     other7:
 *                       type: string
 *                       example: "Custom field 7"
 *                     other8:
 *                       type: string
 *                       example: "Custom field 8"
 *                     other9:
 *                       type: string
 *                       example: "Custom field 9"
 *                     other10:
 *                       type: string
 *                       example: "Custom field 10"
 *     responses:
 *       200:
 *         description: Vouchers synced successfully
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
 *                   example: "Voucher sync completed. Success: 5, Failed: 0"
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
 *                           vchnumber:
 *                             type: string
 *                           action:
 *                             type: string
 *                             enum: [Created, Updated]
 *                           ledgerName:
 *                             type: string
 *                     failed:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: number
 *                           vchguid:
 *                             type: string
 *                           vchnumber:
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
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.post('/sync', syncVouchersFromTally);

/**
 * @swagger
 * /api/v1/voucher/list:
 *   get:
 *     summary: Get vouchers by company with filters - No Authentication Required (Tally Integration)
 *     tags: [Voucher]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
 *       - in: query
 *         name: vchtype
 *         schema:
 *           type: string
 *         description: Voucher type (Sales, Purchase, etc.)
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
 *         description: Vouchers fetched successfully
 *       400:
 *         description: Company code is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/list', getVouchersByCompany);

/**
 * @swagger
 * /api/v1/voucher/stats:
 *   get:
 *     summary: Get voucher statistics by company - No Authentication Required (Tally Integration)
 *     tags: [Voucher]
 *     parameters:
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
 *     responses:
 *       200:
 *         description: Statistics fetched successfully
 *       400:
 *         description: Company code is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/stats', getVoucherStats);

/**
 * @swagger
 * /api/v1/voucher/{vchguid}:
 *   get:
 *     summary: Get voucher by GUID - No Authentication Required (Tally Integration)
 *     tags: [Voucher]
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
 *         description: Voucher fetched successfully
 *       404:
 *         description: Voucher not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *   delete:
 *     summary: Delete voucher (soft delete)
 *     tags: [Voucher]
 *     security:
 *       - bearerAuth: []
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
 *         description: Voucher deleted successfully
 *       404:
 *         description: Voucher not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration GET endpoints
router.get('/:vchguid', getVoucherByGuid);

// ✅ Authentication required for DELETE (destructive operation)
router.delete('/:vchguid', requireAuth, deleteVoucher);

export default router;

