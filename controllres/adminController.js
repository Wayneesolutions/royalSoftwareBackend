import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user/userModel.js";
import { fetchLedgerFromTally, fetchSalesFromTally } from "../tally/adminDashboard.js";
// Admin Signup
export const adminCreation = async (req, res) => {
  try {
    const { email, password, role, name } = req.body;

    if (!email || !password || !role || !name) {
      return res.json({success:false, message: "All fields are required" });
    }

    // Check if user already exists
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin) {
      return res.json({success:false, message: "Admin already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create admin
    const newAdmin = await User.create({
      email,
      password: hashedPassword,
      role,
      name,
    });

    res.json({
        success:true,
      message: "Admin created successfully",
      admin: {
        _id: newAdmin._id,
        email: newAdmin.email,
        name: newAdmin.name,
        role: newAdmin.role,
      },
    });
  } catch (error) {
    console.error("Admin creation error:", error);
    res.json({success:false ,message: "Server error" });
  }
};

// Admin Login
export const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.json({success:false, message: "Email and password required" });
    }

    const admin = await User.findOne({ email });

    if (!admin || admin.role !== "admin") {
      return res.json({success:false, message: "Invalid credentials" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, admin.password);
    if (!isPasswordCorrect) {
      return res.json({success:false, message: "Invalid credentials" });
    }

    // Optional: Generate token
    const token = jwt.sign(
      { userId: admin._id, role: admin.role },
      process.env.JWT_SECRET || "your_jwt_secret",
      { expiresIn: "7d" }
    );

    return res.json({
        success:true,
      message: "Login successful",
      admin: {
        _id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.json({success:false, message: "Server error" });
  }
};
export const adminDashboard = async (req, res) => {
  try {
    // You can get dynamic dates from query params or hardcode for testing
    const fromDate = req.query.fromDate || "20240401";
    const toDate = req.query.toDate || "20240723";
    const ledgerName = req.query.ledgerName || ''
    const sales = await fetchSalesFromTally(fromDate, toDate);
    const ledger = await fetchLedgerFromTally(fromDate,toDate,ledgerName)
    return res.json({
      success: true,
      data:{
        sales:sales,
        ledger:ledger
      }
    });
  } catch (error) {
    console.log(error.message);
    return res.json({
      success: false,
      message: error.message
    });
  }
};
