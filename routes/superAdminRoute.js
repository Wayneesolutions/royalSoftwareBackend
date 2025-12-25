import express from 'express'
import {
  createAdmin,
  createSuperAdmin,
  loginSuperAdmin,
  listAdmins,
  updateAdmin,
  deleteAdmin,
  assignCompanyToAdmin,
  getAdminById,
  getSalesReport,
  exportSalesReport,
  getSuperAdminOutstandingSummary,
  getSuperAdminOutstandingList,
  getSuperAdminOutstandingDetails,
  updateSuperAdminOutstanding,
  addSuperAdminCollectionNote
} from '../controllres/superAdminController.js'
import { authorizeRoles, requireAuth } from '../middleware/authMiddleware.js'
import {
  createCompany,
  deleteCompany,
  toggleCompanyStatus,
  getCompanies,
  getCompanyById,
  updateCompany,
  getSystemStats
} from '../controllres/companyController.js'

const superAdminRoute = express.Router()

/**
 * @swagger
 * tags:
 *   name: Super Admin
 *   description: Super Admin management endpoints
 */

// auth-free routes
/**
 * @swagger
 * /api/v1/superadmin/create:
 *   post:
 *     summary: Create a new super admin
 *     tags: [Super Admin]
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
 *     responses:
 *       200:
 *         description: Super admin created successfully
 *       400:
 *         description: Super admin already exists
 */
superAdminRoute.post('/create', createSuperAdmin)

/**
 * @swagger
 * /api/v1/superadmin/login:
 *   post:
 *     summary: Login as super admin
 *     tags: [Super Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     admin:
 *                       $ref: '#/components/schemas/User'
 *                     token:
 *                       type: string
 *       400:
 *         description: Invalid credentials
 */
superAdminRoute.post('/login', loginSuperAdmin)

// protected superadmin-only routes
superAdminRoute.post(
  '/create-admin',
  requireAuth,
  authorizeRoles(['superadmin']),
  createAdmin
)
superAdminRoute.get(
  '/list-admins',
  requireAuth,
  authorizeRoles(['superadmin']),
  listAdmins
)
superAdminRoute.patch(
  '/update-admin/:id',
  requireAuth,
  authorizeRoles(['superadmin']),
  updateAdmin
)
superAdminRoute.delete(
  '/delete-admin/:id',
  requireAuth,
  authorizeRoles(['superadmin']),
  deleteAdmin
)

// Get admin details
superAdminRoute.get(
  '/admin/:adminId',
  requireAuth,
  authorizeRoles(['superadmin']),
  getAdminById
)

// Assign company to admin
superAdminRoute.post(
  '/assign-company/:adminId',
  requireAuth,
  authorizeRoles(['superadmin']),
  assignCompanyToAdmin
)

// company managemant
superAdminRoute.post(
  '/create-company',
  requireAuth,
  authorizeRoles(['superadmin']),
  createCompany
)
superAdminRoute.get(
  '/list-all-companies',
  requireAuth,
  authorizeRoles(['superadmin']),
  getCompanies
)
superAdminRoute.get(
  '/company/:id',
  requireAuth,
  authorizeRoles(['superadmin']),
  getCompanyById
)
superAdminRoute.patch(
  '/update-company/:id',
  requireAuth,
  authorizeRoles(['superadmin']),
  updateCompany
)
superAdminRoute.patch(
  '/toggle-company-status/:id',
  requireAuth,
  authorizeRoles(['superadmin']),
  toggleCompanyStatus
)
superAdminRoute.delete(
  '/delete-company/:id',
  requireAuth,
  authorizeRoles(['superadmin']),
  deleteCompany
)

// Get system statistics
superAdminRoute.get(
  '/system-stats',
  requireAuth,
  authorizeRoles(['superadmin']),
  getSystemStats
)

// Sales report routes
superAdminRoute.get(
  '/sales-report',
  requireAuth,
  authorizeRoles(['superadmin']),
  getSalesReport
)

superAdminRoute.get(
  '/sales-report/export',
  requireAuth,
  authorizeRoles(['superadmin']),
  exportSalesReport
)

// Outstanding management routes
superAdminRoute.get(
  '/outstanding-summary',
  requireAuth,
  authorizeRoles(['superadmin']),
  getSuperAdminOutstandingSummary
)

superAdminRoute.get(
  '/outstanding-list',
  requireAuth,
  authorizeRoles(['superadmin']),
  getSuperAdminOutstandingList
)

superAdminRoute.get(
  '/outstanding/:outstandingId',
  requireAuth,
  authorizeRoles(['superadmin']),
  getSuperAdminOutstandingDetails
)

superAdminRoute.patch(
  '/outstanding/:outstandingId/update',
  requireAuth,
  authorizeRoles(['superadmin']),
  updateSuperAdminOutstanding
)

superAdminRoute.post(
  '/outstanding/:outstandingId/add-note',
  requireAuth,
  authorizeRoles(['superadmin']),
  addSuperAdminCollectionNote
)

export { superAdminRoute }
