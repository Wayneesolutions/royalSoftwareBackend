import Company from "../models/company/companyModel.js";

// Create Company
export const createCompany = async (req, res) => {
    try {
        const company = await Company.create(req.body);
        res.json({ success: true, data:company });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Get All Companies
export const getCompanies = async (req, res) => {
    try {
        const companies = await Company.find().sort({ createdAt: -1 });
        res.json({ success: true, data:companies });
    } catch (error) {
        res.json({ success: false, message: error.message });
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
