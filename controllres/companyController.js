import Company from "../models/company/companyModel.js";

/**
 * @swagger
 * /api/v1/superadmin/create-company:
 *   post:
 *     summary: Create a new company
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyName
 *               - companyState
 *               - companyCountry
 *               - companyMobile
 *               - companyEmail
 *               - companyCode
 *               - maxUser
 *               - guid
 *             properties:
 *               companyName:
 *                 type: string
 *               companyState:
 *                 type: string
 *               companyCountry:
 *                 type: string
 *               companyMobile:
 *                 type: string
 *               companyEmail:
 *                 type: string
 *                 format: email
 *               companyCode:
 *                 type: string
 *               maxUser:
 *                 type: number
 *               guid:
 *                 type: number
 *               contactDetails:
 *                 type: object
 *                 properties:
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *                   website:
 *                     type: string
 *                   address:
 *                     type: object
 *                     properties:
 *                       street:
 *                         type: string
 *                       city:
 *                         type: string
 *                       state:
 *                         type: string
 *                       country:
 *                         type: string
 *                       pincode:
 *                         type: string
 *     responses:
 *       201:
 *         description: Company created successfully
 *       400:
 *         description: Bad request - Company code, email, or mobile already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Create Company
export const createCompany = async (req, res) => {
    try {
        const { companyCode, companyEmail, companyMobile } = req.body;

    // Normalize optional GSTIN: remove if empty to avoid null uniqueness conflicts
    if (!req.body.gstin || String(req.body.gstin).trim() === '') {
      delete req.body.gstin;
    }

    // If guid not provided, generate a unique 5-digit GUID (numeric). If provided, coerce to number/string and accept.
    if (!req.body.guid) {
      let candidate;
      let attempts = 0;
      do {
        // 5-digit number between 10000 and 99999
        candidate = Math.floor(10000 + Math.random() * 90000);
        attempts += 1;
        // Avoid infinite loops
        if (attempts > 10) break;
      } while (await Company.exists({ guid: candidate }));
      req.body.guid = candidate;
    } else {
      // Accept guid from frontend; support both numeric or string
      const incoming = req.body.guid;
      // If numeric-like, store as number; else store as string
      const numVal = Number(incoming);
      req.body.guid = Number.isFinite(numVal) && String(incoming).trim() !== '' ? numVal : String(incoming).trim();
    }

    // Check if companyCode exists
    const existingCode = await Company.findOne({ companyCode });
    if (existingCode) {
      return res.status(400).json({ 
        success: false, 
        message: `Company code "${companyCode}" is already in use.` 
      });
    }

    // Check if companyEmail exists
    const existingEmail = await Company.findOne({ companyEmail });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        message: `Company email "${companyEmail}" is already in use.` 
      });
    }

    // Check if companyMobile exists
    const existingMobile = await Company.findOne({ companyMobile });
    if (existingMobile) {
      return res.status(400).json({ 
        success: false, 
        message: `Company mobile "${companyMobile}" is already in use.` 
      });
    }

        const companyData = {
            ...req.body,
            createdBy: req.user.userId
        };
        
        const company = await Company.create(companyData);
        res.status(201).json({ success: true, message: 'Company created successfully', data: company });
    } catch (error) {
        console.error('Error creating company:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to create company',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * @swagger
 * /api/v1/superadmin/list-all-companies:
 *   get:
 *     summary: Get all companies
 *     tags: [Super Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of companies per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by company name or code
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Get All Companies
export const getCompanies = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        // Build search query
        const searchQuery = {
            ...(search && {
                $or: [
                    { companyName: { $regex: search, $options: 'i' } },
                    { companyCode: { $regex: search, $options: 'i' } }
                ]
            })
        };

        const companies = await Company.find(searchQuery)
            .populate('createdBy', 'name email')
            .populate('assignedAdmins.adminId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCompanies = await Company.countDocuments(searchQuery);
        const totalPages = Math.ceil(totalCompanies / limit);

        res.json({ 
            success: true, 
            data: {
                companies,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCompanies,
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                }
            }
        });
    } catch (error) {
        console.error('Error getting companies:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get companies',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get Single Company
export const getCompanyById = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.json({ success: true, message: "Company not found" });
        res.json({ success: true, data:company });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Update Company
export const updateCompany = async (req, res) => {
    try {
        const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!company) return res.json({ success: false, message: "Company not found" });
        res.json({ success: true, data:company });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Delete Company
export const deleteCompany = async (req, res) => {
    try {
        const company = await Company.findByIdAndDelete(req.params.id);
        if (!company) return res.json({ success: false, message: "Company not found" });
        res.json({ success: true, message: "Company deleted successfully" });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};
