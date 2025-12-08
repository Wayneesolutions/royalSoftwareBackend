import express from 'express'
import { 
  adminCreation, 
  adminLogin, 
  switchCompany, 
  getCompanyData,
  createUser,
  getUsersByCompany,
  getUsersForParentSelection,
  getGroupsForSelection,
  getAllGroups,
  getUsersByGroup,
  updateUserStatus,
  editUser,
  deleteUser,
  autoAssignGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  createDealer,
  getAllDealers,
  updateDealer,
  deleteDealer,
  createSubDealer,
  getAllSubDealers,
  updateSubDealer,
  deleteSubDealer
} from '../controllres/adminController.js'
import { 
  getUsersByRole, 
  getUserById
} from '../controllres/adminUserController.js'
import { requireAuth, authorizeRoles } from '../middleware/authMiddleware.js'

const adminRoute = express.Router()

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management endpoints
 */

// Public routes (no authentication required)
adminRoute.post('/create', adminCreation)
adminRoute.post('/login', adminLogin)

// Protected routes (authentication required)
adminRoute.get('/company-data', requireAuth, authorizeRoles(['admin', 'zonal', 'rsm', 'asm']), getCompanyData)
adminRoute.post('/switch-company', requireAuth, authorizeRoles(['admin']), switchCompany)

// User management routes
adminRoute.get('/users-by-company', requireAuth, authorizeRoles(['admin']), getUsersByCompany)
adminRoute.get('/users-for-parent', requireAuth, authorizeRoles(['admin']), getUsersForParentSelection)
adminRoute.get('/groups-for-selection', requireAuth, authorizeRoles(['admin']), getGroupsForSelection)
adminRoute.get('/groups', requireAuth, authorizeRoles(['admin']), getAllGroups)
adminRoute.post('/groups', requireAuth, authorizeRoles(['admin']), createGroup)
adminRoute.put('/groups/:groupId', requireAuth, authorizeRoles(['admin']), updateGroup)
adminRoute.delete('/groups/:groupId', requireAuth, authorizeRoles(['admin']), deleteGroup)
adminRoute.get('/groups/:groupId/users', requireAuth, authorizeRoles(['admin']), getUsersByGroup)
adminRoute.get('/role/:role', requireAuth, authorizeRoles(['admin']), getUsersByRole)
adminRoute.get('/get-user/:id', requireAuth, authorizeRoles(['admin']), getUserById)
adminRoute.post('/create-user', requireAuth, authorizeRoles(['admin']), createUser)
adminRoute.put('/user/:userId/status', requireAuth, authorizeRoles(['admin']), updateUserStatus)
adminRoute.put('/edit-user/:userId', requireAuth, authorizeRoles(['admin']), editUser)
adminRoute.delete('/user/:userId', requireAuth, authorizeRoles(['admin']), deleteUser)

// Helper API for group assignment
adminRoute.post('/auto-assign-groups', requireAuth, authorizeRoles(['admin']), autoAssignGroups)

// Dealer (Ledger) management routes
adminRoute.get('/dealers', requireAuth, authorizeRoles(['admin']), getAllDealers)
adminRoute.post('/dealers', requireAuth, authorizeRoles(['admin']), createDealer)
adminRoute.put('/dealers/:dealerId', requireAuth, authorizeRoles(['admin']), updateDealer)
adminRoute.delete('/dealers/:dealerId', requireAuth, authorizeRoles(['admin']), deleteDealer)

// SubDealer management routes
adminRoute.get('/subdealers', requireAuth, authorizeRoles(['admin']), getAllSubDealers)
adminRoute.post('/subdealers', requireAuth, authorizeRoles(['admin']), createSubDealer)
adminRoute.put('/subdealers/:subdealerId', requireAuth, authorizeRoles(['admin']), updateSubDealer)
adminRoute.delete('/subdealers/:subdealerId', requireAuth, authorizeRoles(['admin']), deleteSubDealer)

export default adminRoute