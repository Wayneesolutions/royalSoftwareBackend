import express from 'express';
import { getPriceLists, getPriceListNames } from '../controllres/tallyPriceListController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const priceListRoute = express.Router();

/**
 * @swagger
 * tags:
 *   name: Price Lists
 *   description: Price list endpoints for the mobile app
 */

/**
 * @swagger
 * /api/v1/pricelists:
 *   get:
 *     summary: Get price list entries
 *     description: >
 *       Returns price list entries for the authenticated user's company.
 *       Filter by plname, itemguid, or cmpcode. Response also includes
 *       a distinct `plnames` array for building dropdowns.
 *     tags: [Price Lists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: plname
 *         schema:
 *           type: string
 *         description: Filter by price list name (e.g. "Dealer Rate")
 *       - in: query
 *         name: itemguid
 *         schema:
 *           type: string
 *         description: Filter by item GUID
 *       - in: query
 *         name: cmpcode
 *         schema:
 *           type: string
 *         description: Filter by company code
 *     responses:
 *       200:
 *         description: Price list entries returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 total:
 *                   type: integer
 *                 plnames:
 *                   type: array
 *                   items:
 *                     type: string
 *                   description: Distinct price list names (for dropdown)
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
priceListRoute.get('/', requireAuth, getPriceLists);

/**
 * @swagger
 * /api/v1/pricelists/names:
 *   get:
 *     summary: Get distinct price list names
 *     description: Returns only the list of distinct price list names for dropdown use.
 *     tags: [Price Lists]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Price list names returned
 *       401:
 *         description: Unauthorized
 */
priceListRoute.get('/names', requireAuth, getPriceListNames);

export default priceListRoute;
