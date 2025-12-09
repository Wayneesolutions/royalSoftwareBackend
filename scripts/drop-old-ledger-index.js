/**
 * Script to drop old ledgerId index that no longer exists in the schema
 * Run this once to fix the duplicate key error: E11000 duplicate key error collection: royalsoftware.ledgers index: ledgerId_1
 * 
 * Usage: node scripts/drop-old-ledger-index.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/royalsoftware';

async function dropOldIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('ledgers');

    // Get all indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes on ledgers collection:');
    indexes.forEach(index => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    // Check if ledgerId_1 index exists
    const ledgerIdIndex = indexes.find(idx => idx.name === 'ledgerId_1');
    
    if (ledgerIdIndex) {
      console.log('\n🗑️  Found old ledgerId_1 index, dropping it...');
      try {
        await collection.dropIndex('ledgerId_1');
        console.log('✅ Successfully dropped ledgerId_1 index');
      } catch (dropError) {
        if (dropError.code === 27 || dropError.message?.includes('index not found')) {
          console.log('⚠️  Index already removed or not found');
        } else {
          throw dropError;
        }
      }
    } else {
      console.log('\n✅ No ledgerId_1 index found (already removed or never existed)');
    }

    // Show updated indexes
    const updatedIndexes = await collection.indexes();
    console.log('\n📋 Updated indexes:');
    updatedIndexes.forEach(index => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log('\n✅ Script completed successfully');
    console.log('💡 You can now create ledgers without the duplicate key error');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

dropOldIndex();

