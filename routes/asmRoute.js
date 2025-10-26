// backend/routes/asmRoute.js
import express from 'express';
import {
  getASMDashboardData,
  getASMTeamMembers,
  getASMTeamPerformance,
  getASMRecentActivity
} from '../controllres/asmController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get ASM dashboard data
router.get('/dashboard', getASMDashboardData);

// Get team members
router.get('/team', getASMTeamMembers);

// Get team performance analytics
router.get('/team-performance', getASMTeamPerformance);

// Get recent activity
router.get('/recent-activity', getASMRecentActivity);

export default router;
