// backend/scripts/setupASMHierarchy.js
import mongoose from 'mongoose';
import User from '../models/user/userModel.js';
import { config } from '../config/config.js';

// Connect to MongoDB
mongoose.connect(config.MONGODB_URI);

const setupASMHierarchy = async () => {
  try {
    console.log('Setting up ASM hierarchy relationships...');

    // Find all ASM users
    const asmUsers = await User.find({ role: 'asm' });
    console.log(`Found ${asmUsers.length} ASM users`);

    if (asmUsers.length === 0) {
      console.log('No ASM users found. Please create ASM users first.');
      return;
    }

    // Find users that can be assigned to ASMs (salesman, dealers, distibutors)
    const assignableUsers = await User.find({
      role: { $in: ['salesman', 'dealers', 'distibutors'] },
      $or: [
        { 'hierarchy.parentUser': { $exists: false } },
        { 'hierarchy.parentUser': null }
      ]
    });

    console.log(`Found ${assignableUsers.length} users that can be assigned to ASMs`);

    if (assignableUsers.length === 0) {
      console.log('No users available for assignment. All users already have hierarchy relationships.');
      return;
    }

    // Assign users to ASMs
    let assignedCount = 0;
    for (const asm of asmUsers) {
      // Assign 2-4 users to each ASM
      const usersToAssign = assignableUsers.slice(assignedCount, assignedCount + Math.floor(Math.random() * 3) + 2);
      
      for (const user of usersToAssign) {
        // Set hierarchy relationship
        user.hierarchy = {
          parentUser: asm._id,
          level: (asm.hierarchy?.level || 0) + 1
        };
        await user.save();
        console.log(`Assigned ${user.name} (${user.role}) to ASM ${asm.name}`);
        assignedCount++;
      }
    }

    console.log(`Successfully assigned ${assignedCount} users to ASM hierarchy`);
    console.log('ASM hierarchy setup completed!');

  } catch (error) {
    console.error('Error setting up ASM hierarchy:', error);
  } finally {
    mongoose.disconnect();
  }
};

// Run the setup
setupASMHierarchy();
