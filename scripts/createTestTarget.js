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

// Create a test target assignment from Zonal to RSM
const createTestTargetAssignment = async () => {
  try {
    console.log('Creating test target assignment...');

    // Get a Zonal user
    const zonalUser = await User.findOne({ role: 'zonal', isActive: true });
    if (!zonalUser) {
      console.log('❌ No Zonal user found. Please create a Zonal user first.');
      return;
    }

    // Get an RSM user
    const rsmUser = await User.findOne({ role: 'rsm', isActive: true });
    if (!rsmUser) {
      console.log('❌ No RSM user found. Please create an RSM user first.');
      return;
    }

    console.log(`Zonal User: ${zonalUser.name} (${zonalUser._id})`);
    console.log(`RSM User: ${rsmUser.name} (${rsmUser._id})`);

    // Get company
    const company = await Company.findOne();
    if (!company) {
      console.log('❌ No company found. Please create a company first.');
      return;
    }

    console.log(`Company: ${company.companyName} (${company._id})`);

    // Create target for RSM
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const targetId = `TGT-${currentYear}-${currentMonth.toString().padStart(2, '0')}-${rsmUser._id.toString().slice(-6)}`;

    // Check if target already exists
    const existingTarget = await Target.findOne({
      assignedTo: rsmUser._id,
      'period.year': currentYear,
      'period.month': currentMonth,
      isActive: true
    });

    if (existingTarget) {
      console.log('✅ Target already exists for this RSM');
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
      assignedTo: rsmUser._id,
      assignedBy: zonalUser._id,
      targetType: 'monthly',
      period: {
        startDate,
        endDate,
        year: currentYear,
        month: currentMonth
      },
      targetAmount: 1000000, // ₹10,00,000
      targetQuantity: 0,
      achievedAmount: 0,
      achievedQuantity: 0,
      achievementPercentage: 0,
      hierarchyLevel: rsmUser.hierarchy?.level || 3,
      role: rsmUser.role,
      notes: `Monthly target for RSM ${rsmUser.name} assigned by Zonal ${zonalUser.name}`,
      status: 'active',
      isActive: true
    });

    await target.save();
    console.log('✅ Successfully created target assignment');
    console.log(`   Target ID: ${target.targetId}`);
    console.log(`   Assigned to: ${rsmUser.name} (RSM)`);
    console.log(`   Assigned by: ${zonalUser.name} (Zonal)`);
    console.log(`   Amount: ₹${target.targetAmount.toLocaleString()}`);
    console.log(`   Period: ${target.period.year}-${target.period.month}`);

  } catch (error) {
    console.error('Error creating test target assignment:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await createTestTargetAssignment();
  await mongoose.connection.close();
  console.log('Script completed');
};

// Run the script
main().catch(console.error);
