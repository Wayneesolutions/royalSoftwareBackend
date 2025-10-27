// backend/scripts/setupASMTeamMembers.js
import mongoose from 'mongoose';
import User from '../models/user/userModel.js';
import { config } from '../config/config.js';

// Connect to MongoDB
mongoose.connect(config.MONGODB_URI);

const setupASMTeamMembers = async () => {
  try {
    console.log('Setting up ASM team members...');

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
      reportingManager: { $exists: false } // Users without a reporting manager
    });

    console.log(`Found ${assignableUsers.length} users that can be assigned to ASMs`);

    if (assignableUsers.length === 0) {
      console.log('No users available for assignment. Please create users with roles: salesman, dealers, distibutors');
      return;
    }

    // Assign users to ASMs
    let assignedCount = 0;
    for (const asm of asmUsers) {
      // Assign 2-4 users to each ASM
      const usersToAssign = assignableUsers.slice(assignedCount, assignedCount + Math.floor(Math.random() * 3) + 2);
      
      for (const user of usersToAssign) {
        user.reportingManager = asm._id;
        await user.save();
        console.log(`Assigned ${user.name} (${user.role}) to ASM ${asm.name}`);
        assignedCount++;
      }
    }

    console.log(`Successfully assigned ${assignedCount} users to ASM teams`);
    console.log('ASM team setup completed!');

  } catch (error) {
    console.error('Error setting up ASM team members:', error);
  } finally {
    mongoose.disconnect();
  }
};

// Run the setup
setupASMTeamMembers();
