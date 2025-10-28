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

// Create sample targets for RSM team members
const createSampleTargets = async () => {
  try {
    console.log('Creating sample targets...');

    // Get a company (assuming there's at least one)
    const company = await Company.findOne();
    if (!company) {
      console.log('No company found. Please create a company first.');
      return;
    }

    // Get RSM users
    const rsmUsers = await User.find({ role: 'rsm', isActive: true }).limit(1);
    if (rsmUsers.length === 0) {
      console.log('No RSM users found. Please create RSM users first.');
      return;
    }

    const rsmUser = rsmUsers[0];
    console.log(`Creating targets for RSM: ${rsmUser.name}`);

    // Get team members under this RSM
    const teamMembers = await User.find({
      'defaultCompany': company._id,
      isActive: true,
      _id: { $ne: rsmUser._id },
      $or: [
        { 'hierarchy.parentUser': rsmUser._id },
        { 
          'hierarchy.level': { $gt: 0 },
          role: { $in: ['asm', 'salesman', 'dealers', 'distibutors', 'subdealer'] }
        }
      ]
    }).limit(5);

    if (teamMembers.length === 0) {
      console.log('No team members found under this RSM.');
      return;
    }

    console.log(`Found ${teamMembers.length} team members`);

    // Create targets for current month
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    const targets = [];

    for (const member of teamMembers) {
      // Generate unique target ID
      const targetId = `TGT-${currentYear}-${currentMonth.toString().padStart(2, '0')}-${member._id.toString().slice(-6)}`;

      // Check if target already exists
      const existingTarget = await Target.findOne({
        assignedTo: member._id,
        'period.year': currentYear,
        'period.month': currentMonth,
        isActive: true
      });

      if (existingTarget) {
        console.log(`Target already exists for ${member.name}`);
        continue;
      }

      // Create target based on role
      let targetAmount = 0;
      switch (member.role) {
        case 'asm':
          targetAmount = 500000; // ₹5,00,000
          break;
        case 'salesman':
          targetAmount = 200000; // ₹2,00,000
          break;
        case 'dealers':
          targetAmount = 100000; // ₹1,00,000
          break;
        case 'distibutors':
          targetAmount = 300000; // ₹3,00,000
          break;
        case 'subdealer':
          targetAmount = 75000; // ₹75,000
          break;
        default:
          targetAmount = 100000; // ₹1,00,000
      }

      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

      const target = new Target({
        targetId,
        companyId: company._id,
        assignedTo: member._id,
        assignedBy: rsmUser._id,
        targetType: 'monthly',
        period: {
          startDate,
          endDate,
          year: currentYear,
          month: currentMonth
        },
        targetAmount,
        targetQuantity: 0,
        achievedAmount: Math.floor(Math.random() * targetAmount * 0.8), // Random achievement up to 80%
        achievedQuantity: 0,
        achievementPercentage: 0,
        hierarchyLevel: member.hierarchy?.level || 0,
        role: member.role,
        notes: `Monthly target for ${member.name}`,
        status: 'active',
        isActive: true
      });

      targets.push(target);
    }

    if (targets.length > 0) {
      await Target.insertMany(targets);
      console.log(`Successfully created ${targets.length} targets`);
      
      // Display created targets
      targets.forEach(target => {
        console.log(`- ${target.assignedTo.name} (${target.role}): ₹${target.targetAmount.toLocaleString()} target, ₹${target.achievedAmount.toLocaleString()} achieved`);
      });
    } else {
      console.log('No new targets created');
    }

  } catch (error) {
    console.error('Error creating sample targets:', error);
  }
};

// Main execution
const main = async () => {
  await connectDB();
  await createSampleTargets();
  await mongoose.connection.close();
  console.log('Script completed');
};

// Run the script
main().catch(console.error);
