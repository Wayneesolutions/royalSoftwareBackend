import express from 'express';
import {
  getLedgers,
  getLedgerDetails,
  createLedger,
  updateLedger,
  addTransaction,
  getLedgerSummary,
  getUsersForLedger
} from '../controllres/ledgerController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get all ledgers with filtering and pagination
router.get('/', getLedgers);

// Get ledger summary
router.get('/summary', getLedgerSummary);

// Get users for ledger creation
router.get('/users', getUsersForLedger);

// Get ledger details with transactions
router.get('/:ledgerId', getLedgerDetails);

// Create new ledger
router.post('/', createLedger);

// Update ledger
router.put('/:ledgerId', updateLedger);

// Add transaction to ledger
router.post('/:ledgerId/transactions', addTransaction);

export default router;
