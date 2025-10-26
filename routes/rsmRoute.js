import express from 'express';
import {
  getRSMDashboardData,
  getRSMTeamMembers,
  getRSMTeamPerformance,
  getRSMRecentActivity
} from '../controllres/rsmController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get RSM dashboard data
router.get('/dashboard', getRSMDashboardData);

// Get team members
router.get('/team', getRSMTeamMembers);

// Get team performance analytics
router.get('/team-performance', getRSMTeamPerformance);

// Get recent activity
router.get('/recent-activity', getRSMRecentActivity);

export default router;
