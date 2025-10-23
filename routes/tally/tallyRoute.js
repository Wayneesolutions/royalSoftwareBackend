import express from 'express'
import { 
    getCompaniesForTally,
    getUsersForTally,
    getCompanyHierarchy,
    getCompanyStatistics,
    syncDataFromTally,
    exportDataForTally
} from '../../controllres/tallyController.js'

const tallyRoute = express.Router()

/**
 * @swagger
 * tags:
 *   name: Tally Integration
 *   description: Tally integration endpoints for data exchange
 */

// Public Tally APIs (no authentication required for Tally to access)

/**
 * @swagger
 * /api/v1/tally/companies:
 *   get:
 *     summary: Get all companies for Tally integration
 *     tags: [Tally Integration]
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 */
tallyRoute.get('/companies', getCompaniesForTally)

/**
 * @swagger
 * /api/v1/tally/company/{companyId}/users:
 *   get:
 *     summary: Get all users for a specific company
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 */
tallyRoute.get('/company/:companyId/users', getUsersForTally)

/**
 * @swagger
 * /api/v1/tally/company/{companyId}/hierarchy:
 *   get:
 *     summary: Get company hierarchy structure
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Hierarchy retrieved successfully
 */
tallyRoute.get('/company/:companyId/hierarchy', getCompanyHierarchy)

/**
 * @swagger
 * /api/v1/tally/company/{companyId}/statistics:
 *   get:
 *     summary: Get company statistics
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 */
tallyRoute.get('/company/:companyId/statistics', getCompanyStatistics)

/**
 * @swagger
 * /api/v1/tally/export/company/{companyId}:
 *   get:
 *     summary: Export company data for Tally
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: ['json', 'xml', 'csv']
 *           default: 'json'
 *         description: Export format
 *     responses:
 *       200:
 *         description: Data exported successfully
 */
tallyRoute.get('/export/company/:companyId', exportDataForTally)

/**
 * @swagger
 * /api/v1/tally/sync/company/{companyId}:
 *   post:
 *     summary: Sync data from Tally to Royal App
 *     tags: [Tally Integration]
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               syncType:
 *                 type: string
 *                 enum: ['users', 'hierarchy', 'settings']
 *               data:
 *                 type: object
 *                 description: Data to sync from Tally
 *     responses:
 *       200:
 *         description: Data synced successfully
 */
tallyRoute.post('/sync/company/:companyId', syncDataFromTally)

export { tallyRoute }