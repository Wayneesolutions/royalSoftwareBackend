import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/user/userModel.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/royalsoftware');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// Sample address data for different states in India
const sampleAddresses = [
  {
    street: "123 Main Street",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
    country: "India"
  },
  {
    street: "456 Park Avenue",
    city: "Delhi",
    state: "Delhi",
    pincode: "110001",
    country: "India"
  },
  {
    street: "789 MG Road",
    city: "Bangalore",
    state: "Karnataka",
    pincode: "560001",
    country: "India"
  },
  {
    street: "321 Brigade Road",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600001",
    country: "India"
  },
  {
    street: "654 Park Street",
    city: "Kolkata",
    state: "West Bengal",
    pincode: "700001",
    country: "India"
  },
  {
    street: "987 Commercial Street",
    city: "Hyderabad",
    state: "Telangana",
    pincode: "500001",
    country: "India"
  },
  {
    street: "147 Linking Road",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411001",
    country: "India"
  },
  {
    street: "258 Sector 17",
    city: "Chandigarh",
    state: "Chandigarh",
    pincode: "160017",
    country: "India"
  },
  {
    street: "369 MG Road",
    city: "Kochi",
    state: "Kerala",
    pincode: "682001",
    country: "India"
  },
  {
    street: "741 Civil Lines",
    city: "Jaipur",
    state: "Rajasthan",
    pincode: "302006",
    country: "India"
  }
];

// Function to get a random address
const getRandomAddress = () => {
  return sampleAddresses[Math.floor(Math.random() * sampleAddresses.length)];
};

// Function to update user addresses
const updateUserAddresses = async () => {
  try {
    console.log('🔍 Starting user address update process...');
    
    // Find all users without address fields or with empty address
    const usersWithoutAddress = await User.find({
      $or: [
        { address: { $exists: false } },
        { 'address.street': { $exists: false } },
        { 'address.street': '' },
        { 'address.city': '' },
        { 'address.state': '' }
      ]
    });

    console.log(`📊 Found ${usersWithoutAddress.length} users without proper address information`);

    if (usersWithoutAddress.length === 0) {
      console.log('✅ All users already have address information');
      return;
    }

    let updatedCount = 0;
    let errorCount = 0;

    for (const user of usersWithoutAddress) {
      try {
        // Get a random address
        const address = getRandomAddress();
        
        // Update the user with address information
        await User.findByIdAndUpdate(user._id, {
          $set: {
            address: {
              street: address.street,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              country: address.country
            }
          }
        });

        console.log(`✅ Updated user: ${user.name} (${user.email}) - ${address.city}, ${address.state}`);
        updatedCount++;

      } catch (error) {
        console.error(`❌ Error updating user ${user.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Update Summary:');
    console.log(`✅ Successfully updated: ${updatedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📊 Total processed: ${usersWithoutAddress.length} users`);

    // Verify the update
    const usersWithAddress = await User.countDocuments({
      'address.street': { $exists: true, $ne: '' },
      'address.city': { $exists: true, $ne: '' },
      'address.state': { $exists: true, $ne: '' }
    });

    const totalUsers = await User.countDocuments();
    console.log(`\n🔍 Verification:`);
    console.log(`📊 Total users: ${totalUsers}`);
    console.log(`📊 Users with address: ${usersWithAddress}`);
    console.log(`📊 Coverage: ${((usersWithAddress / totalUsers) * 100).toFixed(2)}%`);

  } catch (error) {
    console.error('❌ Error in updateUserAddresses:', error);
  }
};

// Function to add address fields to all users (even those with existing addresses)
const addAddressFieldsToAllUsers = async () => {
  try {
    console.log('🔍 Adding address fields to all users...');
    
    // Find all users
    const allUsers = await User.find({});
    console.log(`📊 Found ${allUsers.length} total users`);

    let updatedCount = 0;
    let errorCount = 0;

    for (const user of allUsers) {
      try {
        // Check if user already has complete address
        const hasCompleteAddress = user.address && 
          user.address.street && 
          user.address.city && 
          user.address.state && 
          user.address.pincode;

        if (hasCompleteAddress) {
          console.log(`⏭️  Skipping user ${user.name} - already has complete address`);
          continue;
        }

        // Get a random address
        const address = getRandomAddress();
        
        // Update the user with address information
        await User.findByIdAndUpdate(user._id, {
          $set: {
            address: {
              street: address.street,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              country: address.country
            }
          }
        });

        console.log(`✅ Updated user: ${user.name} (${user.email}) - ${address.city}, ${address.state}`);
        updatedCount++;

      } catch (error) {
        console.error(`❌ Error updating user ${user.name}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Update Summary:');
    console.log(`✅ Successfully updated: ${updatedCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📊 Total processed: ${allUsers.length} users`);

  } catch (error) {
    console.error('❌ Error in addAddressFieldsToAllUsers:', error);
  }
};

// Main execution function
const main = async () => {
  try {
    await connectDB();
    
    console.log('🚀 Starting User Address Update Script');
    console.log('=====================================');
    
    // Check command line arguments
    const args = process.argv.slice(2);
    const updateAll = args.includes('--all');
    
    if (updateAll) {
      console.log('📝 Mode: Update ALL users (including those with existing addresses)');
      await addAddressFieldsToAllUsers();
    } else {
      console.log('📝 Mode: Update only users without address information');
      await updateUserAddresses();
    }
    
    console.log('\n✅ Script completed successfully!');
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the script
main();
