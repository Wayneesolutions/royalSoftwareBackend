import Product from '../models/product/productModel.js';
import Company from '../models/company/companyModel.js';

// Create a new product
export const createProduct = async (req, res) => {
  try {
    const {
      // Stockitem Master Fields
      name,
      partNo,
      itemAlias,
      description,
      parent,
      category,
      baseUnits,
      additionalUnits,
      stdPurcRate,
      stdSaleRate,
      itemGstPer,
      itemHsn,
      itemHsnDesc,
      openingBalance,
      itemOpRate,
      companyCode,
      isFinishItem,
      other1,
      other2,
      other3,
      other4,
      other5,
      // Legacy fields
      productCode,
      productName,
      subCategory,
      brand,
      price,
      stock,
      gstRate
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
      // Stockitem Master Fields
      name: name || productName || '',
      partNo,
      itemAlias,
      description,
      parent,
      category,
      baseUnits,
      additionalUnits,
      stdPurcRate: typeof stdPurcRate === 'number' ? stdPurcRate : parseFloat(stdPurcRate || 0),
      stdSaleRate: typeof stdSaleRate === 'number' ? stdSaleRate : parseFloat(stdSaleRate || 0),
      itemGstPer: (() => {
        const parsed = typeof itemGstPer === 'number' ? itemGstPer : parseFloat(itemGstPer ?? '');
        return Number.isFinite(parsed) ? parsed : (gstRate ? (typeof gstRate === 'number' ? gstRate : parseFloat(gstRate ?? '')) : 0);
      })(),
      itemHsn,
      itemHsnDesc,
      openingBalance: typeof openingBalance === 'number' ? openingBalance : parseFloat(openingBalance || 0),
      itemOpRate: typeof itemOpRate === 'number' ? itemOpRate : parseFloat(itemOpRate || 0),
      companyCode,
      isFinishItem: typeof isFinishItem === 'boolean' ? isFinishItem : false,
      other1,
      other2,
      other3,
      other4,
      other5,
      // Legacy fields
      productCode,
      productName: productName || name,
      subCategory,
      brand,
      price: typeof price === 'number' ? price : parseFloat(price || stdSaleRate || 0),
      stock: typeof stock === 'number' ? stock : parseInt(stock || 0, 10),
      gstRate: (() => {
        const parsed =
          typeof gstRate === 'number' ? gstRate : parseFloat(gstRate ?? '');
        return Number.isFinite(parsed) ? parsed : (itemGstPer ? (typeof itemGstPer === 'number' ? itemGstPer : parseFloat(itemGstPer ?? '')) : 18);
      })(),
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
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { partNo: { $regex: search, $options: 'i' } },
        { itemAlias: { $regex: search, $options: 'i' } },
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
      .sort({ name: 1, productName: 1 })
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
    const {
      // Stockitem Master Fields
      name,
      partNo,
      itemAlias,
      description,
      parent,
      category,
      baseUnits,
      additionalUnits,
      stdPurcRate,
      stdSaleRate,
      itemGstPer,
      itemHsn,
      itemHsnDesc,
      openingBalance,
      itemOpRate,
      companyCode,
      isFinishItem,
      other1,
      other2,
      other3,
      other4,
      other5,
      // Legacy fields
      productName,
      subCategory,
      brand,
      price,
      stock,
      isActive,
      gstRate
    } = req.body;
    const companyId = req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;

    const updateData = {
      updatedBy: userId
    };

    // Stockitem Master Fields
    if (name !== undefined) updateData.name = name;
    if (partNo !== undefined) updateData.partNo = partNo;
    if (itemAlias !== undefined) updateData.itemAlias = itemAlias;
    if (description !== undefined) updateData.description = description;
    if (parent !== undefined) updateData.parent = parent;
    if (category !== undefined) updateData.category = category;
    if (baseUnits !== undefined) updateData.baseUnits = baseUnits;
    if (additionalUnits !== undefined) updateData.additionalUnits = additionalUnits;
    if (stdPurcRate !== undefined) {
      updateData.stdPurcRate = typeof stdPurcRate === 'number' ? stdPurcRate : parseFloat(stdPurcRate);
    }
    if (stdSaleRate !== undefined) {
      updateData.stdSaleRate = typeof stdSaleRate === 'number' ? stdSaleRate : parseFloat(stdSaleRate);
    }
    if (itemGstPer !== undefined) {
      const parsed = typeof itemGstPer === 'number' ? itemGstPer : parseFloat(itemGstPer);
      if (!Number.isNaN(parsed)) updateData.itemGstPer = parsed;
    }
    if (itemHsn !== undefined) updateData.itemHsn = itemHsn;
    if (itemHsnDesc !== undefined) updateData.itemHsnDesc = itemHsnDesc;
    if (openingBalance !== undefined) {
      updateData.openingBalance = typeof openingBalance === 'number' ? openingBalance : parseFloat(openingBalance);
    }
    if (itemOpRate !== undefined) {
      const parsed = typeof itemOpRate === 'number' ? itemOpRate : parseFloat(itemOpRate);
      if (!Number.isNaN(parsed)) updateData.itemOpRate = parsed;
    }
    if (companyCode !== undefined) updateData.companyCode = companyCode;
    if (isFinishItem !== undefined) updateData.isFinishItem = isFinishItem;
    if (other1 !== undefined) updateData.other1 = other1;
    if (other2 !== undefined) updateData.other2 = other2;
    if (other3 !== undefined) updateData.other3 = other3;
    if (other4 !== undefined) updateData.other4 = other4;
    if (other5 !== undefined) updateData.other5 = other5;
    
    // Legacy fields
    if (productName !== undefined) {
      updateData.productName = productName;
      if (!updateData.name) updateData.name = productName;
    }
    if (subCategory !== undefined) updateData.subCategory = subCategory;
    if (brand !== undefined) updateData.brand = brand;
    if (price !== undefined) {
      updateData.price = typeof price === 'number' ? price : parseFloat(price);
    }
    if (stock !== undefined) {
      updateData.stock = typeof stock === 'number' ? stock : parseInt(stock, 10);
    }
    if (isActive !== undefined) updateData.isActive = isActive;
    if (gstRate !== undefined) {
      const parsedGst = typeof gstRate === 'number' ? gstRate : parseFloat(gstRate);
      if (!Number.isNaN(parsedGst)) {
        updateData.gstRate = parsedGst;
        if (!updateData.itemGstPer) updateData.itemGstPer = parsedGst;
      }
    }

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

    const LOW_STOCK_THRESHOLD = 5;

    const products = await Product.find({
      companyId,
      isActive: true,
      stock: { $lte: LOW_STOCK_THRESHOLD }
    })
      .select('productCode productName stock category')
      .sort({ stock: 1 });

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
