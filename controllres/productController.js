import Product from '../models/product/productModel.js';
import Company from '../models/company/companyModel.js';

// Create a new product
export const createProduct = async (req, res) => {
  try {
    const {
      productCode,
      productName,
      description,
      category,
      subCategory,
      brand,
      unit,
      price,
      costPrice,
      mrp,
      discount,
      taxRate,
      stock,
      images,
      specifications
    } = req.body;

    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const createdBy = req.user.userDetails._id;

    console.log('createProduct - User:', req.user.userDetails.name, 'Role:', req.user.userDetails.role);
    console.log('createProduct - Company ID:', companyId);
    console.log('createProduct - Created By:', createdBy);

    // Check if product code already exists
    const existingProduct = await Product.findOne({
      productCode,
      companyId
    });

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: 'Product code already exists'
      });
    }

    const product = new Product({
      productCode,
      productName,
      description,
      category,
      subCategory,
      brand,
      unit,
      price,
      costPrice,
      mrp,
      discount,
      taxRate,
      stock: {
        current: stock?.current || 0,
        minimum: stock?.minimum || 0,
        maximum: stock?.maximum || 1000
      },
      images,
      specifications,
      companyId,
      createdBy
    });

    await product.save();

    console.log('createProduct - Product saved successfully:', product._id);
    console.log('createProduct - Product company ID:', product.companyId);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get all products for a company
export const getProducts = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const {
      page = 1,
      limit = 10,
      category,
      search,
      isAvailable,
      isActive
    } = req.query;

    console.log('getProducts - User:', req.user.userDetails.name, 'Role:', req.user.userDetails.role);
    console.log('getProducts - Company ID:', companyId);
    console.log('getProducts - User Details:', req.user.userDetails);
    console.log('getProducts - Query params:', req.query);

    if (!companyId) {
      console.log('getProducts - ERROR: No company ID found for user');
      return res.status(400).json({
        success: false,
        message: 'User does not have a default company assigned'
      });
    }

    const filter = { companyId };

    // Apply filters
    if (category) filter.category = category;
    if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    console.log('getProducts - Filter:', filter);

    // Debug: Check all products in database
    const allProducts = await Product.find({});
    console.log('getProducts - All products in DB:', allProducts.length);
    allProducts.forEach(p => {
      console.log(`  - Product: ${p.productName} (ID: ${p._id}, Company: ${p.companyId})`);
    });

    const products = await Product.find(filter)
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .sort({ productName: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments(filter);

    console.log('getProducts - Found products:', products.length);
    console.log('getProducts - Total products:', totalProducts);

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalProducts / limit),
        totalProducts,
        hasNext: page < Math.ceil(totalProducts / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get product by ID
export const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const product = await Product.findOne({
      _id: productId,
      companyId
    })
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      product
    });

  } catch (error) {
    console.error('Get product by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const updateData = req.body;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;

    // Remove fields that shouldn't be updated directly
    delete updateData.productCode;
    delete updateData.companyId;
    delete updateData.createdBy;
    delete updateData.createdAt;

    updateData.updatedBy = userId;

    const product = await Product.findOneAndUpdate(
      { _id: productId, companyId },
      updateData,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Delete product (soft delete)
export const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const product = await Product.findOneAndUpdate(
      { _id: productId, companyId },
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });

  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get product categories
export const getProductCategories = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const categories = await Product.distinct('category', {
      companyId,
      isActive: true
    });

    res.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('Get product categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Update product stock
export const updateProductStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity, operation } = req.body;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const product = await Product.findOne({
      _id: productId,
      companyId,
      isActive: true
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await product.updateStock(quantity, operation);

    res.json({
      success: true,
      message: 'Product stock updated successfully',
      product
    });

  } catch (error) {
    console.error('Update product stock error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Get low stock products
export const getLowStockProducts = async (req, res) => {
  try {
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

    const products = await Product.find({
      companyId,
      isActive: true,
      $expr: {
        $lte: ['$stock.current', '$stock.minimum']
      }
    })
      .select('productCode productName stock category')
      .sort({ 'stock.current': 1 });

    res.json({
      success: true,
      products
    });

  } catch (error) {
    console.error('Get low stock products error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
