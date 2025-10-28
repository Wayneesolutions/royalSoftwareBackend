import mongoose from 'mongoose';
import Target from '../models/target/targetModel.js';
import User from '../models/user/userModel.js';
import Company from '../models/company/companyModel.js';

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

// Create a test target assignment from RSM to ASM
const createRSMToASMTargetAssignment = async () => {
  try {
    console.log('Creating RSM to ASM target assignment...');

    // Get an RSM user
    const rsmUser = await User.findOne({ role: 'rsm', isActive: true });
    if (!rsmUser) {
      console.log('❌ No RSM user found. Please create an RSM user first.');
      return;
    }

    // Get an ASM user
    const asmUser = await User.findOne({ role: 'asm', isActive: true });
    if (!asmUser) {
      console.log('❌ No ASM user found. Please create an ASM user first.');
      return;
    }

    console.log(`RSM User: ${rsmUser.name} (${rsmUser._id})`);
    console.log(`ASM User: ${asmUser.name} (${asmUser._id})`);

    // Get company
    const company = await Company.findOne();
    if (!company) {
      console.log('❌ No company found. Please create a company first.');
      return;
    }

    console.log(`Company: ${company.companyName} (${company._id})`);

    // Create target for ASM
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const targetId = `TGT-${currentYear}-${currentMonth.toString().padStart(2, '0')}-${asmUser._id.toString().slice(-6)}`;

    // Check if target already exists
    const existingTarget = await Target.findOne({
      assignedTo: asmUser._id,
      'period.year': currentYear,
      'period.month': currentMonth,
      isActive: true
    });

    if (existingTarget) {
      console.log('✅ Target already exists for this ASM');
      console.log(`   Target ID: ${existingTarget.targetId}`);
      console.log(`   Assigned by: ${existingTarget.assignedBy}`);
      console.log(`   Amount: ₹${existingTarget.targetAmount.toLocaleString()}`);
      return;
    }

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const target = new Target({
      targetId,
      companyId: company._id,
      assignedTo: asmUser._id,
      assignedBy: rsmUser._id,
      targetType: 'monthly',
      period: {
        startDate,
        endDate,
        year: currentYear,
        month: currentMonth
      },
      targetAmount: 750000, // ₹7,50,000
      targetQuantity: 0,
      achievedAmount: Math.floor(Math.random() * 750000 * 0.6), // Random achievement up to 60%
      achievedQuantity: 0,
      achievementPercentage: 0,
      hierarchyLevel: asmUser.hierarchy?.level || 4,
      role: asmUser.role,
      notes: `Monthly target for ASM ${asmUser.name} assigned by RSM ${rsmUser.name}`,
      status: 'active',
      isActive: true
    });

    await target.save();
    console.log('✅ Successfully created RSM to ASM target assignment');
    console.log(`   Target ID: ${target.targetId}`);
    console.log(`   Assigned to: ${asmUser.name} (ASM)`);
    console.log(`   Assigned by: ${rsmUser.name} (RSM)`);
    console.log(`   Amount: ₹${target.targetAmount.toLocaleString()}`);
    console.log(`   Achieved: ₹${target.achievedAmount.toLocaleString()}`);
    console.log(`   Period: ${target.period.year}-${target.period.month}`);

    // Now test if ASM can see this target
    console.log('\n🔍 Testing ASM target visibility...');
    
    const asmTargets = await Target.find({
      companyId: company._id,
      isActive: true,
      $or: [
        { assignedTo: asmUser._id },
        { assignedBy: asmUser._id }
      ]
    })
    .populate('assignedTo', 'name email role')
    .populate('assignedBy', 'name email role');

    console.log(`ASM can see ${asmTargets.length} targets:`);
    asmTargets.forEach(target => {
      console.log(`   - ${target.assignedTo?.name || 'Unknown'} (${target.assignedTo?.role || 'Unknown Role'})`);
      console.log(`     Assigned by: ${target.assignedBy?.name || 'Unknown'} (${target.assignedBy?.role || 'Unknown Role'})`);
      console.log(`     Amount: ₹${target.targetAmount.toLocaleString()}`);
      console.log(`     Period: ${target.period.year}-${target.period.month}`);
    });

  } catch (error) {
    console.error('Error creating RSM to ASM target assignment:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await createRSMToASMTargetAssignment();
  await mongoose.connection.close();
  console.log('Script completed');
};

// Run the script
main().catch(console.error);
