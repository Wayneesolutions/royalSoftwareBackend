import express from 'express'
import { 
  getUsersByCompany,
  getUsersByRole,
  getUserProfile,
  updateUserProfile,
  deleteUser,
  switchCompany,
  getSubDealersByDealer
} from '../controllres/userController.js'
import { requireAuth, authorizeRoles } from '../middleware/authMiddleware.js'

const userRoute = express.Router()

/**
 * @swagger
 * tags:
 *   name: User
 *   description: General user management endpoints for all roles
 */

// Switch company (accessible by all authenticated users with company assignments)
userRoute.post('/switch-company', requireAuth, switchCompany)

// Get users by company (accessible by all authenticated users)
userRoute.get('/users-by-company', requireAuth, getUsersByCompany)

// Get users by role (accessible by all authenticated users)
userRoute.get('/role/:role', requireAuth, getUsersByRole)

// Get user profile (accessible by all authenticated users)
userRoute.get('/profile', requireAuth, getUserProfile)

// Update user profile (accessible by all authenticated users)
userRoute.put('/profile', requireAuth, updateUserProfile)

// Delete user (accessible by admin and superadmin only)
userRoute.delete('/delete/:userId', requireAuth, authorizeRoles(['admin', 'superadmin']), deleteUser)

// Get subdealers by dealer ID (accessible by all authenticated users for order creation)
userRoute.get('/subdealers/by-dealer/:dealerId', requireAuth, getSubDealersByDealer)

export default userRoute
