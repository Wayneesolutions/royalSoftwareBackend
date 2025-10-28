import mongoose from 'mongoose';
import Target from '../models/target/targetModel.js';
import User from '../models/user/userModel.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/royalsoftware');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Debug target data
const debugTargets = async () => {
  try {
    console.log('=== TARGET DEBUG REPORT ===\n');

    // Get all targets
    const allTargets = await Target.find({ isActive: true })
      .populate('assignedTo', 'name email role')
      .populate('assignedBy', 'name email role')
      .populate('companyId', 'companyName companyCode');

    console.log(`Total active targets: ${allTargets.length}\n`);

    if (allTargets.length === 0) {
      console.log('❌ No targets found in database!');
      console.log('💡 Run the seedTargets.js script to create sample targets.');
      return;
    }

    // Group by company
    const targetsByCompany = {};
    allTargets.forEach(target => {
      const companyName = target.companyId?.companyName || 'Unknown Company';
      if (!targetsByCompany[companyName]) {
        targetsByCompany[companyName] = [];
      }
      targetsByCompany[companyName].push(target);
    });

    // Display targets by company
    Object.keys(targetsByCompany).forEach(companyName => {
      console.log(`📊 Company: ${companyName}`);
      console.log(`   Targets: ${targetsByCompany[companyName].length}`);
      
      targetsByCompany[companyName].forEach(target => {
        console.log(`   - ${target.assignedTo?.name || 'Unknown'} (${target.assignedTo?.role || 'Unknown Role'})`);
        console.log(`     Assigned by: ${target.assignedBy?.name || 'Unknown'} (${target.assignedBy?.role || 'Unknown Role'})`);
        console.log(`     Period: ${target.period.year}-${target.period.month}`);
        console.log(`     Amount: ₹${target.targetAmount.toLocaleString()}`);
        console.log(`     Achieved: ₹${target.achievedAmount.toLocaleString()} (${target.achievementPercentage.toFixed(1)}%)`);
        console.log(`     Status: ${target.status}`);
        console.log('');
      });
    });

    // Check for RSM users
    console.log('\n=== RSM USERS ===');
    const rsmUsers = await User.find({ role: 'rsm', isActive: true })
      .populate('defaultCompany', 'companyName companyCode');
    
    if (rsmUsers.length === 0) {
      console.log('❌ No RSM users found!');
    } else {
      rsmUsers.forEach(rsm => {
        console.log(`- ${rsm.name} (${rsm.email})`);
        console.log(`  Company: ${rsm.defaultCompany?.companyName || 'No Company'}`);
        console.log(`  ID: ${rsm._id}`);
        
        // Check targets for this RSM
        const rsmTargets = allTargets.filter(target => 
          target.assignedTo?._id.toString() === rsm._id.toString() ||
          target.assignedBy?._id.toString() === rsm._id.toString()
        );
        console.log(`  Targets: ${rsmTargets.length}`);
        console.log('');
      });
    }

    // Check for Zonal users
    console.log('\n=== ZONAL USERS ===');
    const zonalUsers = await User.find({ role: 'zonal', isActive: true })
      .populate('defaultCompany', 'companyName companyCode');
    
    if (zonalUsers.length === 0) {
      console.log('❌ No Zonal users found!');
    } else {
      zonalUsers.forEach(zonal => {
        console.log(`- ${zonal.name} (${zonal.email})`);
        console.log(`  Company: ${zonal.defaultCompany?.companyName || 'No Company'}`);
        console.log(`  ID: ${zonal._id}`);
        
        // Check targets assigned by this Zonal
        const zonalAssignedTargets = allTargets.filter(target => 
          target.assignedBy?._id.toString() === zonal._id.toString()
        );
        console.log(`  Targets assigned: ${zonalAssignedTargets.length}`);
        console.log('');
      });
    }

  } catch (error) {
    console.error('Error debugging targets:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await debugTargets();
  await mongoose.connection.close();
  console.log('\n=== DEBUG COMPLETE ===');
};

// Run the script
main().catch(console.error);
