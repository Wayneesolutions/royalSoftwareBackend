import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const dropUniqueIndexes = async () => {
  try {
    console.log('🔄 Connecting to MongoDB...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/royalsoftware');
    
    console.log('✅ Connected to MongoDB');
    
    const db = mongoose.connection.db;
    
    // Drop unique index from ledgerEntries collection
    console.log('\n📋 Processing LedgerEntries collection...');
    try {
      const ledgerCollection = db.collection('ledgerentries');
      
      // List existing indexes
      const ledgerIndexes = await ledgerCollection.indexes();
      console.log('Current indexes:', ledgerIndexes.map(idx => idx.name));
      
      // Drop the unique index
      const uniqueIndexName = 'vchguid_1_ledgerguid_1_cmpcode_1';
      await ledgerCollection.dropIndex(uniqueIndexName);
      console.log(`✅ Dropped unique index: ${uniqueIndexName}`);
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Index already dropped or does not exist');
      } else {
        console.error('❌ Error dropping ledger entries index:', error.message);
      }
    }
    
    // Drop unique index from inventoryEntries collection
    console.log('\n📋 Processing InventoryEntries collection...');
    try {
      const inventoryCollection = db.collection('inventoryentries');
      
      // List existing indexes
      const inventoryIndexes = await inventoryCollection.indexes();
      console.log('Current indexes:', inventoryIndexes.map(idx => idx.name));
      
      // Drop the unique index
      const uniqueIndexName = 'vchguid_1_itemguid_1_cmpcode_1';
      await inventoryCollection.dropIndex(uniqueIndexName);
      console.log(`✅ Dropped unique index: ${uniqueIndexName}`);
    } catch (error) {
      if (error.code === 27 || error.message.includes('index not found')) {
        console.log('ℹ️  Index already dropped or does not exist');
      } else {
        console.error('❌ Error dropping inventory entries index:', error.message);
      }
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📝 You can now insert multiple entries for the same ledger/item in a voucher');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the migration
dropUniqueIndexes();

