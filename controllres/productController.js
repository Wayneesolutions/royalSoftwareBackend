import Product from '../models/product/productModel.js';
import Company from '../models/company/companyModel.js';

class InvalidProductPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidProductPayloadError';
    this.statusCode = 400;
  }
}

const normalizeString = (value, fallback = undefined) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? fallback : trimmed;
};

const normalizeNumber = (value, fallback = undefined) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeInteger = (value, fallback = undefined) => {
  const parsed = normalizeNumber(value, fallback);
  if (parsed === undefined) {
    return fallback;
  }
  return Math.trunc(parsed);
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(lowered)) {
      return true;
    }
    if (['false', '0', 'no'].includes(lowered)) {
      return false;
    }
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  return fallback;
};

const resolveName = (payload) =>
  normalizeString(payload?.name) || normalizeString(payload?.productName);

const resolveCategory = (payload) => normalizeString(payload?.category, 'General');

const resolveProductCode = (payload) => normalizeString(payload?.productCode);

const buildCreateProductPayload = (payload, context) => {
    const {
    companyId,
    companyCode,
    createdBy,
    name,
    category,
    productCode,
  } = context;

  const stdPurcRate = normalizeNumber(payload.stdPurcRate, 0);
  const priceInput = normalizeNumber(payload.price);
  const stdSaleRateInput = normalizeNumber(payload.stdSaleRate);
  const stdSaleRate = stdSaleRateInput ?? priceInput ?? 0;
  const resolvedPrice = priceInput ?? stdSaleRate;

  const gstRateInput = normalizeNumber(payload.gstRate);
  const itemGstInput = normalizeNumber(payload.itemGstPer);
  const resolvedGstRate = gstRateInput ?? itemGstInput ?? 18;
  const resolvedItemGst = itemGstInput ?? resolvedGstRate;

  return {
      name,
    partNo: normalizeString(payload.partNo),
    itemAlias: normalizeString(payload.itemAlias),
    description: normalizeString(payload.description),
    parent: normalizeString(payload.parent),
      category,
    baseUnits: normalizeString(payload.baseUnits),
    additionalUnits: normalizeString(payload.additionalUnits),
      stdPurcRate,
      stdSaleRate,
    itemGstPer: resolvedItemGst,
    itemHsn: normalizeString(payload.itemHsn),
    itemHsnDesc: normalizeString(payload.itemHsnDesc),
    openingBalance: normalizeNumber(payload.openingBalance, 0),
    itemOpRate: normalizeNumber(payload.itemOpRate, 0),
    companyCode: normalizeString(payload.companyCode, companyCode),
    isFinishItem: normalizeBoolean(payload.isFinishItem, false),
    other1: normalizeString(payload.other1),
    other2: normalizeString(payload.other2),
    other3: normalizeString(payload.other3),
    other4: normalizeString(payload.other4),
    other5: normalizeString(payload.other5),
      productCode,
    productName: normalizeString(payload.productName, name),
    subCategory: normalizeString(payload.subCategory),
    brand: normalizeString(payload.brand),
    price: resolvedPrice,
    stock: normalizeNumber(payload.stock, 0),
    gstRate: resolvedGstRate,
    companyId,
    isActive: normalizeBoolean(payload.isActive, true),
    createdBy,
  };
};

const buildUpdateProductPayload = (payload, currentProduct, companyCodeFallback) => {
  const updateData = {};
  const hasOwn = (key) => Object.prototype.hasOwnProperty.call(payload, key);

  if (hasOwn('productCode')) {
    const updatedCode = normalizeString(payload.productCode);
    if (!updatedCode) {
      throw new InvalidProductPayloadError('Product code cannot be empty');
    }
    updateData.productCode = updatedCode;
  }

  if (hasOwn('name') || hasOwn('productName')) {
    const resolvedName = normalizeString(payload.name) || normalizeString(payload.productName);
    if (resolvedName) {
      updateData.name = resolvedName;
    }

    if (hasOwn('productName')) {
      const resolvedProductName =
        normalizeString(payload.productName, resolvedName || currentProduct.productName);
      updateData.productName = resolvedProductName;
    } else if (resolvedName) {
      updateData.productName = resolvedName;
    }
  }

  const stringFields = [
    'partNo',
    'itemAlias',
    'description',
    'parent',
    'category',
    'baseUnits',
    'additionalUnits',
    'itemHsn',
    'itemHsnDesc',
    'companyCode',
    'subCategory',
    'brand',
    'other1',
    'other2',
    'other3',
    'other4',
    'other5',
  ];

  stringFields.forEach((field) => {
    if (!hasOwn(field)) {
      return;
    }
    let fallback = '';
    if (field === 'category') {
      fallback = currentProduct.category || 'General';
    } else if (field === 'companyCode') {
      fallback = companyCodeFallback || currentProduct.companyCode;
    }
    const value = normalizeString(payload[field], fallback);
    updateData[field] = value ?? fallback;
  });

  const numberFields = [
    'stdPurcRate',
    'stdSaleRate',
    'openingBalance',
    'itemOpRate',
    'price',
    'gstRate',
    'itemGstPer',
  ];

  numberFields.forEach((field) => {
    if (!hasOwn(field)) {
      return;
    }
    const value = normalizeNumber(payload[field]);
    if (value === undefined) {
      throw new InvalidProductPayloadError(`Invalid value provided for ${field}`);
    }
    updateData[field] = value;
  });

  if (hasOwn('stock')) {
    const stockValue = normalizeNumber(payload.stock);
    if (stockValue === undefined) {
      throw new InvalidProductPayloadError('Invalid value provided for stock');
    }
    updateData.stock = stockValue;
  }

  if (hasOwn('price') && !hasOwn('stdSaleRate') && updateData.price !== undefined) {
    updateData.stdSaleRate = updateData.price;
  }

  if (hasOwn('stdSaleRate') && !hasOwn('price') && updateData.stdSaleRate !== undefined) {
    updateData.price = updateData.stdSaleRate;
  }

  if (hasOwn('gstRate') && !hasOwn('itemGstPer') && updateData.gstRate !== undefined) {
    updateData.itemGstPer = updateData.gstRate;
  }

  if (hasOwn('itemGstPer') && !hasOwn('gstRate') && updateData.itemGstPer !== undefined) {
    updateData.gstRate = updateData.itemGstPer;
  }

  const booleanFields = ['isFinishItem', 'isActive'];
  booleanFields.forEach((field) => {
    if (!hasOwn(field)) {
      return;
    }
    updateData[field] = normalizeBoolean(
      payload[field],
      typeof currentProduct[field] === 'boolean' ? currentProduct[field] : false,
    );
  });

  return updateData;
};

// Create a new product
export const createProduct = async (req, res) => {
  try {
    const userDetails = req.user?.userDetails;
    const companyRef = userDetails?.defaultCompany;

    const companyId = companyRef?._id || companyRef;
    const createdBy = userDetails?._id;

    if (!companyId || !createdBy) {
      return res.status(400).json({
        success: false,
        message: 'Unable to determine company or user context',
      });
    }

    const company = await Company.findById(companyId).select('companyCode');
    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Default company not found. Please contact support.',
      });
    }

    const derivedName = resolveName(req.body);
    if (!derivedName) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required',
      });
    }

    const derivedCategory = resolveCategory(req.body);
    const derivedProductCode = resolveProductCode(req.body);

    if (derivedProductCode) {
      const existingProduct = await Product.findOne({
        productCode: derivedProductCode,
        companyId,
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product code already exists for this company',
        });
      }
    }

    const productPayload = buildCreateProductPayload(req.body, {
      companyId,
      companyCode: company.companyCode,
      createdBy,
      name: derivedName,
      category: derivedCategory,
      productCode: derivedProductCode,
    });

    const product = await Product.create(productPayload);

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product,
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// Get all products for a company
export const getProducts = async (req, res) => {
  try {
    const companyId =
      req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const {
      page = 1,
      limit = 10,
      category,
      search,
      isActive,
      brand,
      parent,
      isFinishItem,
    } = req.query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.max(Math.min(parseInt(limit, 10) || 10, 100), 1);

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a default company assigned',
      });
    }

    const filter = { companyId };

    if (category) filter.category = category;
    if (brand) filter.brand = brand;
    if (parent) filter.parent = parent;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (isFinishItem !== undefined) filter.isFinishItem = isFinishItem === 'true';
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

    const skip = (parsedPage - 1) * parsedLimit;

    const products = await Product.find(filter)
      .select(
        'name productName productCode partNo itemAlias description parent category subCategory brand baseUnits additionalUnits stdPurcRate stdSaleRate price stock itemGstPer itemHsn itemHsnDesc gstRate companyCode isFinishItem other1 other2 other3 other4 other5 isActive createdAt updatedAt',
      )
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role')
      .sort({ name: 1, productName: 1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    const totalProducts = await Product.countDocuments(filter);

    res.json({
      success: true,
      products,
      pagination: {
        currentPage: parsedPage,
        totalPages: Math.ceil(totalProducts / parsedLimit),
        totalProducts,
        hasNext: parsedPage < Math.ceil(totalProducts / parsedLimit),
        hasPrev: parsedPage > 1,
      },
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
    const companyId =
      req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;

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
    const companyId =
      req.user.userDetails.defaultCompany._id || req.user.userDetails.defaultCompany;
    const userId = req.user.userDetails._id;

    const product = await Product.findOne({
      _id: productId,
      companyId,
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const company = await Company.findById(companyId).select('companyCode');

    const updateData = buildUpdateProductPayload(req.body, product, company?.companyCode);
    updateData.updatedBy = userId;

    if (Object.keys(updateData).length === 1 && updateData.updatedBy) {
      return res.status(400).json({
        success: false,
        message: 'No fields provided to update',
      });
    }

    if (updateData.productCode) {
      const duplicateProduct = await Product.findOne({
        _id: { $ne: productId },
        productCode: updateData.productCode,
        companyId,
      });

      if (duplicateProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product code already exists for this company',
        });
      }
    }

    const updatedProduct = await Product.findOneAndUpdate(
      { _id: productId, companyId },
      updateData,
      { new: true, runValidators: true },
    )
      .populate('createdBy', 'name role')
      .populate('updatedBy', 'name role');

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct,
    });

  } catch (error) {
    if (error instanceof InvalidProductPayloadError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
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
