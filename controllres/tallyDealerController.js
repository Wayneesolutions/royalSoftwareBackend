import Company from '../models/company/companyModel.js';
import User from '../models/user/userModel.js';

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

export const getDealersByCompanyGuid = async (req, res) => {
  try {
    const rawGuid = req.params.guid || req.query.guid;
    const normalizedGuid = normalizeGuid(rawGuid);

    if (!normalizedGuid) {
      return res.status(400).json({
        success: false,
        message: 'Company guid is required',
      });
    }

    // Try exact match first
    let company = await Company.findOne({ guid: normalizedGuid }).lean();

    // If not found, try case-insensitive search
    if (!company) {
      company = await Company.findOne({ 
        guid: { $regex: new RegExp(`^${normalizedGuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
      }).lean();
    }

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company not found for GUID: ${normalizedGuid}. Please ensure the company is registered in the system with this GUID.`,
        error: 'COMPANY_NOT_FOUND',
        guid: normalizedGuid,
      });
    }

    const dealers = await User.find({
      role: { $in: ['dealers', 'distibutors'] },
      isActive: true,
      $or: [
        { defaultCompany: company._id },
        { 'companies.companyId': company._id },
      ],
    })
      .select('name email mobile userName address isActive defaultCompany companies createdAt updatedAt')
      .lean();

    const mappedDealers = dealers.map((dealer) => {
      const companyAssignments = (dealer.companies || []).filter(
        (assignment) =>
          assignment.companyId &&
          assignment.companyId.toString() === company._id.toString()
      );

      return {
        id: dealer._id,
        name: dealer.name,
        email: dealer.email || '',
        mobile: dealer.mobile,
        userName: dealer.userName || '',
        isActive: dealer.isActive,
        address: {
          street: dealer.address?.street || '',
          city: dealer.address?.city || '',
          state: dealer.address?.state || '',
          pincode: dealer.address?.pincode || '',
          country: dealer.address?.country || '',
        },
        assignedAt:
          companyAssignments[0]?.assignedAt ||
          dealer.createdAt,
        assignmentRole: companyAssignments[0]?.role || dealer.role,
        assignedBy: companyAssignments[0]?.assignedBy || null,
        defaultCompany:
          dealer.defaultCompany &&
          dealer.defaultCompany.toString() === company._id.toString(),
        lastUpdated: dealer.updatedAt,
      };
    });

    return res.json({
      success: true,
      data: {
        company: {
          id: company._id,
          name: company.companyName,
          guid: company.guid,
          code: company.companyCode,
        },
        totalDealers: mappedDealers.length,
        dealers: mappedDealers,
      },
    });
  } catch (error) {
    console.error('Error fetching dealers for Tally:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dealers for company',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

