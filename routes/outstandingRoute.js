import express from 'express';
import {
  getOutstandingSummary,
  getOutstandingList,
  getOutstandingDetails,
  updateOutstanding,
  addCollectionNote,
  assignOutstanding,
  getUsersForAssignment
} from '../controllres/outstandingController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get outstanding summary and statistics
router.get('/summary', getOutstandingSummary);

// Get outstanding list with filters and pagination
router.get('/list', getOutstandingList);

// Get outstanding details by ID
router.get('/:outstandingId', getOutstandingDetails);

// Update outstanding record
router.put('/:outstandingId', updateOutstanding);

// Add collection note
router.post('/:outstandingId/notes', addCollectionNote);

// Assign outstanding to user
router.post('/:outstandingId/assign', assignOutstanding);

// Get users for assignment
router.get('/users/for-assignment', getUsersForAssignment);

export default router;
