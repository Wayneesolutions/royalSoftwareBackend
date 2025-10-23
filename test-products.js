// Simple test script to check if products API is working
import mongoose from 'mongoose';
import Product from './models/product/productModel.js';
import Company from './models/company/companyModel.js';
import User from './models/user/userModel.js';
import dotenv from 'dotenv';

dotenv.config();

const testProductsAPI = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/royalapp');
    console.log('✅ Connected to MongoDB');

    // Check if we have any companies
    const companies = await Company.find();
    console.log(`📊 Found ${companies.length} companies`);
    
    if (companies.length > 0) {
      console.log('Companies:', companies.map(c => ({ id: c._id, name: c.companyName })));
    }

    // Check if we have any users
    const users = await User.find();
    console.log(`👥 Found ${users.length} users`);
    
    const dealers = users.filter(u => u.role === 'dealers');
    console.log(`🏪 Found ${dealers.length} dealers`);
    
    if (dealers.length > 0) {
      console.log('Dealers:', dealers.map(d => ({ id: d._id, name: d.name, role: d.role, company: d.defaultCompany })));
    }

    // Check if we have any products
    const products = await Product.find();
    console.log(`📦 Found ${products.length} products`);
    
    if (products.length > 0) {
      console.log('Products:', products.map(p => ({ 
        id: p._id, 
        code: p.productCode, 
        name: p.productName, 
        price: p.price,
        company: p.companyId 
      })));
    } else {
      console.log('❌ No products found. Run the seed script first:');
      console.log('   node scripts/seedProducts.js');
    }

    // Test product query for a specific company
    if (companies.length > 0 && products.length > 0) {
      const companyId = companies[0]._id;
      const companyProducts = await Product.find({ companyId });
      console.log(`🏢 Products for company ${companies[0].companyName}: ${companyProducts.length}`);
    }

  } catch (error) {
    console.error('❌ Error testing products API:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

// Run the test
testProductsAPI();
