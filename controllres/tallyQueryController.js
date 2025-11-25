import Company from '../models/company/companyModel.js';
import Product from '../models/product/productModel.js';
import User from '../models/user/userModel.js';
import Order from '../models/order/orderModel.js';

const normalizeGuid = (value) => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.toString().trim();
  if (!trimmed) {
    return null;
  }

  // GUID is alphanumeric, return as string
  return trimmed;
};

const findCompanyByGuid = async (rawGuid) => {
  const normalizedGuid = normalizeGuid(rawGuid);
  if (normalizedGuid === null) {
    return null;
  }

  // Try exact match first
  let company = await Company.findOne({ guid: normalizedGuid }).lean();

  // If not found, try case-insensitive search
  if (!company) {
    company = await Company.findOne({ 
      guid: { $regex: new RegExp(`^${normalizedGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
    }).lean();
  }

  return company;
};

export const listCompaniesForTally = async (req, res) => {
  try {
    const companies = await Company.find({})
      .select(
        'companyName companyCode companyEmail companyMobile companyState companyCountry guid maxUser isActive createdAt updatedAt'
      )
      .lean();

    return res.json({
      success: true,
      totalCompanies: companies.length,
      companies,
    });
  } catch (error) {
    console.error('Error fetching companies for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch companies',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const listProductsByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const products = await Product.find({
      companyId: company._id,
    })
      .select(
        'productCode productName description category subCategory brand price stock gstRate isActive createdAt updatedAt'
      )
      .lean();

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalProducts: products.length,
      products,
    });
  } catch (error) {
    console.error('Error fetching products for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch products for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const listUsersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const users = await User.find({
      isActive: { $in: [true, false] },
      $or: [
        { defaultCompany: company._id },
        { 'companies.companyId': company._id },
      ],
    })
      .select(
        'name email mobile userName role address isActive defaultCompany companies createdAt updatedAt'
      )
      .lean();

    const mappedUsers = users.map((user) => {
      const assignment = (user.companies || []).find(
        (c) => c.companyId && c.companyId.toString() === company._id.toString()
      );

      return {
        id: user._id,
        name: user.name,
        email: user.email || '',
        mobile: user.mobile,
        userName: user.userName || '',
        role: user.role,
        isActive: user.isActive,
        address: {
          street: user.address?.street || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          pincode: user.address?.pincode || '',
          country: user.address?.country || '',
        },
        defaultCompany:
          user.defaultCompany &&
          user.defaultCompany.toString() === company._id.toString(),
        assignedAt: assignment?.assignedAt || user.createdAt,
        assignmentRole: assignment?.role || user.role,
        assignedBy: assignment?.assignedBy || null,
        lastUpdated: user.updatedAt,
      };
    });

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalUsers: mappedUsers.length,
      users: mappedUsers,
    });
  } catch (error) {
    console.error('Error fetching users for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const listApprovedOrdersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const company = await findCompanyByGuid(rawGuid);

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found for provided guid',
      });
    }

    const orders = await Order.find({
      companyId: company._id,
      status: { $in: ['approved', 'sent_to_tally', 'delivered', 'dispatched'] },
    })
      .select(
        'orderNumber status customerName customerEmail customerMobile totalAmount finalAmount taxAmount taxableValueTotal cgstTotal sgstTotal igstTotal createdAt updatedAt'
      )
      .lean();

    return res.json({
      success: true,
      company: {
        id: company._id,
        name: company.companyName,
        code: company.companyCode,
        guid: company.guid,
      },
      totalOrders: orders.length,
      orders,
    });
  } catch (error) {
    console.error('Error fetching approved orders for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch approved orders for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

