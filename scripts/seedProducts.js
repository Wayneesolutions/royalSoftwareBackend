import mongoose from 'mongoose';
import Product from '../models/product/productModel.js';
import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';
import dotenv from 'dotenv';

dotenv.config();

const sampleProducts = [
  {
    productCode: 'PAINT-001',
    productName: 'Premium White Paint',
    description: 'High-quality white paint for interior walls',
    category: 'Paint',
    subCategory: 'Interior',
    brand: 'Royal Paints',
    price: 450,
    stock: 100,
    isActive: true
  },
  {
    productCode: 'PAINT-002',
    productName: 'Royal Blue Paint',
    description: 'Vibrant blue paint for exterior walls',
    category: 'Paint',
    subCategory: 'Exterior',
    brand: 'Royal Paints',
    price: 520,
    stock: 75,
    isActive: true
  },
  {
    productCode: 'PAINT-003',
    productName: 'Eco Green Paint',
    description: 'Environmentally friendly green paint',
    category: 'Paint',
    subCategory: 'Eco-Friendly',
    brand: 'Royal Paints',
    price: 580,
    stock: 50,
    isActive: true
  },
  {
    productCode: 'BRUSH-001',
    productName: 'Professional Paint Brush Set',
    description: 'High-quality paint brush set for professional use',
    category: 'Tools',
    subCategory: 'Brushes',
    brand: 'Royal Tools',
    price: 250,
    stock: 200,
    isActive: true
  },
  {
    productCode: 'ROLLER-001',
    productName: 'Paint Roller Kit',
    description: 'Complete paint roller kit with tray',
    category: 'Tools',
    subCategory: 'Rollers',
    brand: 'Royal Tools',
    price: 180,
    stock: 150,
    isActive: true
  },
  {
    productCode: 'PRIMER-001',
    productName: 'Wall Primer',
    description: 'High-quality wall primer for better paint adhesion',
    category: 'Primer',
    subCategory: 'Interior',
    brand: 'Royal Paints',
    price: 320,
    stock: 80,
    isActive: true
  }
];

const seedProducts = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/royalapp');
    console.log('Connected to MongoDB');

    // Find the first company and admin user
    const company = await Company.findOne();
    const adminUser = await User.findOne({ role: 'admin' });

    if (!company) {
      console.log('No company found. Please create a company first.');
      return;
    }

    if (!adminUser) {
      console.log('No admin user found. Please create an admin user first.');
      return;
    }

    console.log(`Seeding products for company: ${company.companyName}`);
    console.log(`Created by admin: ${adminUser.name}`);

    // Clear existing products for this company
    await Product.deleteMany({ companyId: company._id });
    console.log('Cleared existing products');

    // Add sample products
    const productsToCreate = sampleProducts.map(product => ({
      ...product,
      companyId: company._id,
      createdBy: adminUser._id
    }));

    const createdProducts = await Product.insertMany(productsToCreate);
    console.log(`Created ${createdProducts.length} sample products`);

    // Display created products
    createdProducts.forEach(product => {
      console.log(`- ${product.productCode}: ${product.productName} (₹${product.price})`);
    });

    console.log('Product seeding completed successfully!');

  } catch (error) {
    console.error('Error seeding products:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
};

// Run the seeding function
seedProducts();
