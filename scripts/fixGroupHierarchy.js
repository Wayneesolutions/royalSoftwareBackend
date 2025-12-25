import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Import models
import Group from '../models/group/groupModel.js';
import User from '../models/user/userModel.js';
import { Config } from '../config/config.js';

async function fixGroupHierarchy() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    const dbUrl = Config.USE_DB === "production" ? Config.DB_CLUSTER : Config.DB_LOCAL;
    await mongoose.connect(dbUrl);
    console.log('✅ Connected to MongoDB');

    // Find all groups
    const allGroups = await Group.find({}).lean();
    console.log(`\nFound ${allGroups.length} groups in database`);

    let fixedCount = 0;

    for (const group of allGroups) {
      if (group.GroupParent) {
        // Check if GroupParent is a Group GUID (incorrect)
        const isGroupGUID = await Group.findOne({ GroupGUID: group.GroupParent });

        if (isGroupGUID) {
          console.log(`\n❌ Group "${group.GroupName}" (${group.GroupGUID}) has incorrect GroupParent: ${group.GroupParent}`);
          console.log(`   Should be a user ID, but it's a Group GUID`);

          // Find users in the parent group
          const usersInParentGroup = await User.find({
            'groups.groupGUID': group.GroupParent,
            isActive: true
          }).select('_id name email').lean();

          console.log(`   Found ${usersInParentGroup.length} users in parent group ${isGroupGUID.GroupName}`);

          if (usersInParentGroup.length > 0) {
            const parentUser = usersInParentGroup[0];
            const newParentId = parentUser._id.toString();

            console.log(`   ✅ Updating to user: ${parentUser.name} (${parentUser.email}) - ID: ${newParentId}`);

            // Update the group
            await Group.findByIdAndUpdate(group._id, {
              GroupParent: newParentId
            });

            fixedCount++;
            console.log(`   ✅ Updated successfully!`);
          } else {
            console.log(`   ⚠️ No users found in parent group, cannot fix automatically`);
          }
        }
      }
    }

    console.log(`\n✅ Fixed ${fixedCount} groups`);
    console.log('\n=== Verification ===');
    
    // Verify the fix
    const verifyGroups = await Group.find({}).lean();
    for (const group of verifyGroups) {
      if (group.GroupParent) {
        const isStillGUID = await Group.findOne({ GroupGUID: group.GroupParent });
        if (isStillGUID) {
          console.log(`❌ Group "${group.GroupName}" still has GUID as parent: ${group.GroupParent}`);
        } else {
          console.log(`✅ Group "${group.GroupName}" parent: ${group.GroupParent} (User ID)`);
        }
      } else {
        console.log(`ℹ️ Group "${group.GroupName}" has no parent (root group)`);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the fix
fixGroupHierarchy();

