import User from "../models/user/userModel.js"
import bcrypt from 'bcryptjs'

export const getUserById = async (req,res) =>{
    try {
        const { id } = req.params 
        const user = await User.findById(id)
        return res.json({
            success:true,
            message:"user details",
            data:user
        })
    } catch (error) {
        return res.json({ success: false, message: error.message });
    }
}
export const getUsersByRole = async (req,res) =>{
    try {
        const { role } = req.params;

        // Optionally validate the role
        const allowedRoles = ['admin', 'dealers', 'subdealer', 'asm', 'rsm', 'distibutors', 'suppliers', 'salesman'];
        if (!allowedRoles.includes(role)) {
            return res.json({success:false, message: "Invalid role" });
        }

        const users = await User.find({ role });
        res.json({ success: true, data:users });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
}

export const createUser = async (req , res) =>{
     try {
        const { email, password, role, name } = req.body;
    
        if (!email || !password || !role || !name) {
          return res.json({success:false, message: "All fields are required" });
        }
    
        // Check if user already exists
        const existingAdmin = await User.findOne({ email });
        if (existingAdmin) {
          return res.json({success:false, message: `${role} User already exists` });
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
          message:  `${role} created successfully`,
          admin: {
            _id: newAdmin._id,
            email: newAdmin.email,
            name: newAdmin.name,
            role: newAdmin.role,
          },
        });
      } catch (error) {
        console.error("Admin creation error:", error);
        res.json({success:false ,message: ` Server error`  });
      }
}
