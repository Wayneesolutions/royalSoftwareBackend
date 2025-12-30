import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * @desc    Drop unique indexes from ledgerEntries and inventoryEntries collections
 * @route   POST /api/v1/maintenance/drop-unique-indexes
 * @access  Public (for migration purposes)
 */
router.post('/drop-unique-indexes', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const results = {
      ledgerEntries: { success: false, message: '' },
      inventoryEntries: { success: false, message: '' }
    };

    // Drop unique index from ledgerEntries collection
    try {
      const ledgerCollection = db.collection('ledgerentries');
      const uniqueIndexName = 'vchguid_1_ledgerguid_1_cmpcode_1';
      await ledgerCollection.dropIndex(uniqueIndexName);
      results.ledgerEntries.success = true;
      results.ledgerEntries.message = `Dropped unique index: ${uniqueIndexName}`;
      console.log(`✅ ${results.ledgerEntries.message}`);
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        results.ledgerEntries.success = true;
        results.ledgerEntries.message = 'Index already dropped or does not exist';
        console.log('ℹ️  Ledger entries index already dropped or does not exist');
      } else {
        results.ledgerEntries.success = false;
        results.ledgerEntries.message = error.message;
        console.error('❌ Error dropping ledger entries index:', error.message);
      }
    }

    // Drop unique index from inventoryEntries collection
    try {
      const inventoryCollection = db.collection('inventoryentries');
      const uniqueIndexName = 'vchguid_1_itemguid_1_cmpcode_1';
      await inventoryCollection.dropIndex(uniqueIndexName);
      results.inventoryEntries.success = true;
      results.inventoryEntries.message = `Dropped unique index: ${uniqueIndexName}`;
      console.log(`✅ ${results.inventoryEntries.message}`);
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        results.inventoryEntries.success = true;
        results.inventoryEntries.message = 'Index already dropped or does not exist';
        console.log('ℹ️  Inventory entries index already dropped or does not exist');
      } else {
        results.inventoryEntries.success = false;
        results.inventoryEntries.message = error.message;
        console.error('❌ Error dropping inventory entries index:', error.message);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Index migration completed',
      data: results
    });

  } catch (error) {
    console.error('❌ Error in drop-unique-indexes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to drop unique indexes',
      error: error.message
    });
  }
});

export default router;

