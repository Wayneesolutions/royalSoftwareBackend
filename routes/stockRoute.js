import express from 'express';
import {
  getStockSummary,
  getStocks,
  getStockDetails,
  createOrUpdateStock,
  updateStockQuantity,
  getLowStockAlerts
} from '../controllres/stockController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get stock summary for dashboard
router.get('/summary', getStockSummary);

// Get low stock alerts
router.get('/alerts', getLowStockAlerts);

// Get all stocks with filtering and pagination
router.get('/', getStocks);

// Get stock details
router.get('/:stockId', getStockDetails);

// Create or update stock
router.post('/', createOrUpdateStock);

// Update stock quantity
router.put('/:stockId/quantity', updateStockQuantity);

export default router;
