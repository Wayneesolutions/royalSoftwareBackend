import express from 'express';
import {
  createSubDealer,
  getSubDealers,
  getSubDealerById,
  updateSubDealer,
  deactivateSubDealer
} from '../controllres/dealerTeamController.js';
import { requireAuth, authorizeRoles } from '../middleware/authMiddleware.js';

const dealerTeamRoute = express.Router();

/**
 * @swagger
 * tags:
 *   name: Dealer Team Management
 *   description: Dealer team management endpoints
 */

/**
 * @swagger
 * /api/v1/dealer/create-subdealer:
 *   post:
 *     summary: Create a new sub-dealer under the dealer
 *     tags: [Dealer Team Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - mobile
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               mobile:
 *                 type: string
 *               address:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   pincode:
 *                     type: string
 *                   country:
 *                     type: string
 *     responses:
 *       201:
 *         description: Sub-dealer created successfully
 *       400:
 *         description: Bad request
 *       403:
 *         description: Access denied
 */
dealerTeamRoute.post('/create-subdealer', requireAuth, authorizeRoles(['dealers']), createSubDealer);

/**
 * @swagger
 * /api/v1/dealer/subdealers:
 *   get:
 *     summary: Get all sub-dealers under the dealer
 *     tags: [Dealer Team Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *           default: 10
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or email
 *     responses:
 *       200:
 *         description: Sub-dealers retrieved successfully
 *       403:
 *         description: Access denied
 */
dealerTeamRoute.get('/subdealers', requireAuth, authorizeRoles(['dealers']), getSubDealers);

/**
 * @swagger
 * /api/v1/dealer/subdealers/{subDealerId}:
 *   get:
 *     summary: Get sub-dealer by ID
 *     tags: [Dealer Team Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subDealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Sub-dealer ID
 *     responses:
 *       200:
 *         description: Sub-dealer retrieved successfully
 *       404:
 *         description: Sub-dealer not found
 *       403:
 *         description: Access denied
 */
dealerTeamRoute.get('/subdealers/:subDealerId', requireAuth, authorizeRoles(['dealers']), getSubDealerById);

/**
 * @swagger
 * /api/v1/dealer/subdealers/{subDealerId}:
 *   put:
 *     summary: Update sub-dealer
 *     tags: [Dealer Team Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subDealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Sub-dealer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               mobile:
 *                 type: string
 *               address:
 *                 type: object
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Sub-dealer updated successfully
 *       404:
 *         description: Sub-dealer not found
 *       403:
 *         description: Access denied
 */
dealerTeamRoute.put('/subdealers/:subDealerId', requireAuth, authorizeRoles(['dealers']), updateSubDealer);

/**
 * @swagger
 * /api/v1/dealer/subdealers/{subDealerId}:
 *   delete:
 *     summary: Deactivate sub-dealer
 *     tags: [Dealer Team Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subDealerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Sub-dealer ID
 *     responses:
 *       200:
 *         description: Sub-dealer deactivated successfully
 *       404:
 *         description: Sub-dealer not found
 *       403:
 *         description: Access denied
 */
dealerTeamRoute.delete('/subdealers/:subDealerId', requireAuth, authorizeRoles(['dealers']), deactivateSubDealer);

export default dealerTeamRoute;
