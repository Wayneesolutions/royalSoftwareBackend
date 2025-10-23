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
    unit: 'liter',
    price: 450,
    costPrice: 300,
    mrp: 500,
    discount: 0,
    taxRate: 18,
    stock: {
      current: 100,
      minimum: 10,
      maximum: 200
    },
    images: [{
      url: 'https://via.placeholder.com/300x300?text=White+Paint',
      alt: 'Premium White Paint',
      isPrimary: true
    }],
    specifications: {
      coverage: '12-15 sq ft per liter',
      dryingTime: '2-4 hours',
      finish: 'Matte'
    },
    isActive: true,
    isAvailable: true
  },
  {
    productCode: 'PAINT-002',
    productName: 'Royal Blue Paint',
    description: 'Vibrant blue paint for exterior walls',
    category: 'Paint',
    subCategory: 'Exterior',
    brand: 'Royal Paints',
    unit: 'liter',
    price: 520,
    costPrice: 350,
    mrp: 580,
    discount: 0,
    taxRate: 18,
    stock: {
      current: 75,
      minimum: 10,
      maximum: 150
    },
    images: [{
      url: 'https://via.placeholder.com/300x300?text=Blue+Paint',
      alt: 'Royal Blue Paint',
      isPrimary: true
    }],
    specifications: {
      coverage: '10-12 sq ft per liter',
      dryingTime: '3-5 hours',
      finish: 'Semi-Gloss'
    },
    isActive: true,
    isAvailable: true
  },
  {
    productCode: 'PAINT-003',
    productName: 'Eco Green Paint',
    description: 'Environmentally friendly green paint',
    category: 'Paint',
    subCategory: 'Eco-Friendly',
    brand: 'Royal Paints',
    unit: 'liter',
    price: 580,
    costPrice: 400,
    mrp: 650,
    discount: 0,
    taxRate: 18,
    stock: {
      current: 50,
      minimum: 5,
      maximum: 100
    },
    images: [{
      url: 'https://via.placeholder.com/300x300?text=Green+Paint',
      alt: 'Eco Green Paint',
      isPrimary: true
    }],
    specifications: {
      coverage: '12-15 sq ft per liter',
      dryingTime: '2-3 hours',
      finish: 'Matte',
      ecoFriendly: true
    },
    isActive: true,
    isAvailable: true
  },
  {
    productCode: 'BRUSH-001',
    productName: 'Professional Paint Brush Set',
    description: 'High-quality paint brush set for professional use',
    category: 'Tools',
    subCategory: 'Brushes',
    brand: 'Royal Tools',
    unit: 'set',
    price: 250,
    costPrice: 150,
    mrp: 300,
    discount: 0,
    taxRate: 18,
    stock: {
      current: 200,
      minimum: 20,
      maximum: 500
    },
    images: [{
      url: 'https://via.placeholder.com/300x300?text=Paint+Brush',
      alt: 'Professional Paint Brush Set',
      isPrimary: true
    }],
    specifications: {
      material: 'Natural Bristles',
      sizes: '2", 3", 4"',
      handle: 'Wooden'
    },
    isActive: true,
    isAvailable: true
  },
  {
    productCode: 'ROLLER-001',
    productName: 'Paint Roller Kit',
    description: 'Complete paint roller kit with tray',
    category: 'Tools',
    subCategory: 'Rollers',
    brand: 'Royal Tools',
    unit: 'kit',
    price: 180,
    costPrice: 120,
    mrp: 220,
    discount: 0,
    taxRate: 18,
    stock: {
      current: 150,
      minimum: 15,
      maximum: 300
    },
    images: [{
      url: 'https://via.placeholder.com/300x300?text=Paint+Roller',
      alt: 'Paint Roller Kit',
      isPrimary: true
    }],
    specifications: {
      rollerSize: '9 inch',
      nap: '1/2 inch',
      material: 'Synthetic'
    },
    isActive: true,
    isAvailable: true
  },
  {
    productCode: 'PRIMER-001',
    productName: 'Wall Primer',
    description: 'High-quality wall primer for better paint adhesion',
    category: 'Primer',
    subCategory: 'Interior',
    brand: 'Royal Paints',
    unit: 'liter',
    price: 320,
    costPrice: 220,
    mrp: 380,
    discount: 0,
    taxRate: 18,
    stock: {
      current: 80,
      minimum: 10,
      maximum: 150
    },
    images: [{
      url: 'https://via.placeholder.com/300x300?text=Wall+Primer',
      alt: 'Wall Primer',
      isPrimary: true
    }],
    specifications: {
      coverage: '15-20 sq ft per liter',
      dryingTime: '1-2 hours',
      base: 'Water-based'
    },
    isActive: true,
    isAvailable: true
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
