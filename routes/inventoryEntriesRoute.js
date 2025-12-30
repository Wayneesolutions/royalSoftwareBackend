import express from 'express';
import {
  syncInventoryEntries,
  getInventoryEntries,
  getInventoryEntriesByVoucher,
  getInventoryEntriesByItem,
  deleteInventoryEntry
} from '../controllres/inventoryEntriesController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: InventoryEntries
 *   description: Inventory Entries Management APIs - Tracks items/products in vouchers
 */

/**
 * @swagger
 * /api/v1/inventory-entries/sync:
 *   post:
 *     summary: Sync inventory entries from Tally (Single or Bulk) - No Authentication Required
 *     tags: [InventoryEntries]
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
 *                     - itemguid
 *                     - itemamount
 *                   properties:
 *                     cmpcode:
 *                       type: string
 *                       example: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                       description: Company code (must exist in system)
 *                     vchguid:
 *                       type: string
 *                       example: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                       description: Voucher GUID (must exist in system)
 *                     itemguid:
 *                       type: string
 *                       example: "ITEM-001"
 *                       description: Item/Product GUID
 *                     itemmainqty:
 *                       type: number
 *                       example: 10.00
 *                       description: Main quantity
 *                     itemaltqty:
 *                       type: number
 *                       example: 1.00
 *                       description: Alternate quantity
 *                     itemmainunit:
 *                       type: string
 *                       example: "PCS"
 *                       description: Main unit (pieces, kg, etc.)
 *                     itemaltunit:
 *                       type: string
 *                       example: "BOX"
 *                       description: Alternate unit
 *                     itemrate:
 *                       type: number
 *                       example: 100.00
 *                       description: Rate per unit
 *                     itemrateunit:
 *                       type: string
 *                       example: "PCS"
 *                       description: Unit for rate
 *                     itemdisc:
 *                       type: number
 *                       example: 50.00
 *                       description: Discount amount
 *                     itemamount:
 *                       type: number
 *                       example: 950.00
 *                       description: Total amount (required)
 *                     itemdescription:
 *                       type: string
 *                       example: "Product XYZ - Red Color"
 *                       description: Item description
 *                     other1:
 *                       type: string
 *                       example: "Batch No: B001"
 *                     other2:
 *                       type: string
 *                       example: "Expiry: 2025-12-31"
 *                     other3:
 *                       type: string
 *                       example: "Warehouse: Main"
 *                     other4:
 *                       type: string
 *                       example: "Custom field 4"
 *                     other5:
 *                       type: string
 *                       example: "Custom field 5"
 *           example:
 *             entries:
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 itemguid: "ITEM-001"
 *                 itemmainqty: 10.00
 *                 itemmainunit: "PCS"
 *                 itemrate: 100.00
 *                 itemamount: 1000.00
 *                 itemdescription: "Product XYZ"
 *                 other1: "Batch: B001"
 *                 other2: "Expiry: 2025-12-31"
 *                 other3: "Warehouse: Main"
 *                 other4: "Quality: A+"
 *               - cmpcode: "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
 *                 vchguid: "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234"
 *                 itemguid: "ITEM-002"
 *                 itemmainqty: 5.00
 *                 itemmainunit: "KG"
 *                 itemrate: 200.00
 *                 itemamount: 1000.00
 *                 itemdescription: "Product ABC"
 *                 other1: "Batch: B002"
 *                 other2: "Expiry: 2026-06-30"
 *                 other3: "Warehouse: Secondary"
 *                 other4: "Quality: B+"
 *     responses:
 *       200:
 *         description: Inventory entries synced successfully
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
 *                   example: "Inventory entries sync completed. Success: 2, Failed: 0"
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
 *                           itemguid:
 *                             type: string
 *                           action:
 *                             type: string
 *                             enum: [Created, Updated]
 *                           voucherNumber:
 *                             type: string
 *                           itemDescription:
 *                             type: string
 *                           quantity:
 *                             type: number
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
 *                           itemguid:
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
router.post('/sync', syncInventoryEntries);

/**
 * @swagger
 * /api/v1/inventory-entries/list:
 *   get:
 *     summary: Get inventory entries with filters - No Authentication Required
 *     tags: [InventoryEntries]
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
 *         name: itemguid
 *         schema:
 *           type: string
 *         description: Filter by item GUID
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
 *         description: Inventory entries fetched successfully
 *       400:
 *         description: Company code is required
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/list', getInventoryEntries);

/**
 * @swagger
 * /api/v1/inventory-entries/by-voucher/{vchguid}:
 *   get:
 *     summary: Get all inventory entries for a specific voucher - No Authentication Required
 *     tags: [InventoryEntries]
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
 *         description: Inventory entries fetched successfully
 *       404:
 *         description: No inventory entries found for this voucher
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/by-voucher/:vchguid', getInventoryEntriesByVoucher);

/**
 * @swagger
 * /api/v1/inventory-entries/by-item/{itemguid}:
 *   get:
 *     summary: Get all inventory entries for a specific item - No Authentication Required
 *     tags: [InventoryEntries]
 *     parameters:
 *       - in: path
 *         name: itemguid
 *         required: true
 *         schema:
 *           type: string
 *         description: Item GUID
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *     responses:
 *       200:
 *         description: Inventory entries fetched successfully
 *       404:
 *         description: No inventory entries found for this item
 *       500:
 *         description: Server error
 */
// ✅ No authentication required for Tally integration endpoints
router.get('/by-item/:itemguid', getInventoryEntriesByItem);

/**
 * @swagger
 * /api/v1/inventory-entries/{id}:
 *   delete:
 *     summary: Delete inventory entry (soft delete) - Authentication Required
 *     tags: [InventoryEntries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory entry ID
 *       - in: query
 *         name: cmpcode
 *         required: true
 *         schema:
 *           type: string
 *         description: Company code
 *     responses:
 *       200:
 *         description: Inventory entry deleted successfully
 *       404:
 *         description: Inventory entry not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
// ✅ Authentication required for DELETE (destructive operation)
router.delete('/:id', requireAuth, deleteInventoryEntry);

export default router;

