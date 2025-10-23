import express from 'express';
import {
  getZonalDashboardData,
  getZonalTeamMembers
} from '../controllres/zonalController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get Zonal dashboard data
router.get('/dashboard', getZonalDashboardData);

// Get team members
router.get('/team', getZonalTeamMembers);

export default router;
