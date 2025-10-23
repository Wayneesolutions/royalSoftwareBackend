import express from 'express'
import { 
  getUsersByCompany,
  getUsersByRole,
  getUserProfile,
  updateUserProfile
} from '../controllres/userController.js'
import { requireAuth, authorizeRoles } from '../middleware/authMiddleware.js'

const userRoute = express.Router()

/**
 * @swagger
 * tags:
 *   name: User
 *   description: General user management endpoints for all roles
 */

// Get users by company (accessible by all authenticated users)
userRoute.get('/users-by-company', requireAuth, getUsersByCompany)

// Get users by role (accessible by all authenticated users)
userRoute.get('/role/:role', requireAuth, getUsersByRole)

// Get user profile (accessible by all authenticated users)
userRoute.get('/profile', requireAuth, getUserProfile)

// Update user profile (accessible by all authenticated users)
userRoute.put('/profile', requireAuth, updateUserProfile)

export default userRoute
