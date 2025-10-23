import express from 'express';
import {
  getMyTargets,
  assignTargets,
  getUsersForTargetAssignment,
  getTargetPerformanceReport,
  updateTarget,
  calculateTargetAchievements
} from '../controllres/targetController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get targets for current user
router.get('/my-targets', getMyTargets);

// Get users available for target assignment
router.get('/users-for-assignment', getUsersForTargetAssignment);

// Assign targets to hierarchy
router.post('/assign', assignTargets);

// Get target performance report
router.get('/performance-report', getTargetPerformanceReport);

// Update individual target
router.put('/:targetId', updateTarget);

// Calculate target achievements from orders
router.post('/calculate-achievements', calculateTargetAchievements);

export default router;