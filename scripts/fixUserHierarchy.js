/**
 * fixUserHierarchy.js
 *
 * One-time migration: auto-set hierarchy.parentUserId on users whose group
 * has a GroupParent, by finding who is assigned to that parent group.
 *
 * SAFE TO RUN MULTIPLE TIMES — only touches users where parentUserId is null/missing.
 * Does NOT overwrite users that already have parentUserId set.
 *
 * Usage:
 *   node scripts/fixUserHierarchy.js --dry-run   ← preview only, no DB writes
 *   node scripts/fixUserHierarchy.js              ← apply changes
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user/userModel.js';
import Group from '../models/group/groupModel.js';

dotenv.config();

const DRY_RUN = process.argv.includes('--dry-run');

const connectDB = async () => {
  const uri = process.env.DB;
  if (!uri) {
    console.error('❌ DB environment variable not set');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
};

const run = async () => {
  await connectDB();

  console.log('');
  console.log(DRY_RUN
    ? '🔍 DRY RUN MODE — no changes will be written to the database'
    : '⚠️  LIVE MODE — changes will be written to the database');
  console.log('');

  // Find users who:
  //  1. Are active
  //  2. Have at least one group assigned
  //  3. Do NOT already have parentUserId set (safe — never overwrites)
  const users = await User.find({
    isActive: true,
    'groups.0': { $exists: true },
    $or: [
      { 'hierarchy.parentUserId': null },
      { 'hierarchy.parentUserId': { $exists: false } },
    ],
  }).select('_id name role groups hierarchy companies').lean();

  console.log(`Found ${users.length} users with no parentUserId set\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      // Use the first active group that has a groupId
      const activeGroup = (user.groups || []).find(g => g.isActive && g.groupId);
      if (!activeGroup) {
        console.log(`⏭  SKIP  ${user.name} (${user.role}) — no active group entry`);
        skipped++;
        continue;
      }

      // Load the full Group document so we have GroupParent
      const groupDoc = await Group.findOne({
        _id: activeGroup.groupId,
        isActive: true,
      }).lean();

      if (!groupDoc) {
        console.log(`⏭  SKIP  ${user.name} (${user.role}) — group doc not found for id ${activeGroup.groupId}`);
        skipped++;
        continue;
      }

      if (!groupDoc.GroupParent) {
        console.log(`⏭  SKIP  ${user.name} (${user.role}) — group "${groupDoc.GroupName}" has no GroupParent`);
        skipped++;
        continue;
      }

      // Find the parent group by its GUID
      const parentGroup = await Group.findOne({
        GroupGUID: groupDoc.GroupParent,
        isActive: true,
      }).lean();

      if (!parentGroup) {
        console.log(`⏭  SKIP  ${user.name} (${user.role}) — parent group GUID "${groupDoc.GroupParent}" not found`);
        skipped++;
        continue;
      }

      // Find the user assigned to the parent group (same company)
      const companyId = (user.companies || []).find(c => c.isActive)?.companyId;

      const parentGroupUser = await User.findOne({
        'groups.groupId': parentGroup._id,
        'groups.isActive': true,
        ...(companyId
          ? { 'companies.companyId': companyId, 'companies.isActive': true }
          : {}),
        isActive: true,
      }).select('_id name role').lean();

      if (!parentGroupUser) {
        console.log(`⏭  SKIP  ${user.name} (${user.role}) — no user found in parent group "${parentGroup.GroupName}"`);
        skipped++;
        continue;
      }

      console.log(`✅ UPDATE ${user.name} (${user.role})`);
      console.log(`         group: "${groupDoc.GroupName}" → parent group: "${parentGroup.GroupName}"`);
      console.log(`         parentUserId → ${parentGroupUser.name} (${parentGroupUser.role})`);

      if (!DRY_RUN) {
        await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              'hierarchy.parentUserId': parentGroupUser._id,
              'hierarchy.parentUserName': parentGroupUser.name,
              'hierarchy.parentUserRole': parentGroupUser.role,
            },
          },
          { runValidators: false }
        );
      }

      updated++;
    } catch (err) {
      console.error(`❌ ERROR processing ${user.name}:`, err.message);
      errors++;
    }
  }

  console.log('');
  console.log('─────────────────────────────────');
  console.log(`Total found  : ${users.length}`);
  console.log(`Updated      : ${updated}`);
  console.log(`Skipped      : ${skipped}`);
  console.log(`Errors       : ${errors}`);
  console.log('─────────────────────────────────');

  if (DRY_RUN) {
    console.log('\n🔍 Dry run complete. Run WITHOUT --dry-run to apply these changes.');
  } else {
    console.log('\n✅ Migration complete.');
  }

  await mongoose.disconnect();
};

run().catch(err => {
  console.error('Script crashed:', err);
  process.exit(1);
});
