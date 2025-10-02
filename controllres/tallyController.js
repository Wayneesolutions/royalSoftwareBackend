import Company from "../models/company/companyModel.js";
import User from "../models/user/userModel.js";
import bcrypt from "bcryptjs";
import Counter from "../models/company/counterModel.js";

export const listCompanies = async (req,res) =>{
    try {
        const companies = await Company.find()
        return res.json({success:true,message:"companies list",data:companies})
    } catch (error) {
         return res.json({success:false,message:error.message})
    }
}
export const listUsers = async (req,res) =>{
    try {
        const usres =await User.find()
        res.json({success:true,message:'users list',data:usres})
    } catch (error) {
        return res.json({success:false,message:error.message})
    }
}
export const createCompany = async (req,res) =>{
    try {
        const { companyName,
            companyState,
            companyCountry,
            companyMobile,
            companyEmail,
            companyCode,
            maxUser} = req.body
       
            // get next sequence
    const counter = await Counter.findOneAndUpdate(
      { name: "company_guid" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
        const newCompany = await Company.create({
            companyName,
            companyState,
            companyCode,
            companyCountry,
            companyEmail,
            companyMobile,
            maxUser,
            guid: counter.seq, // ✅ sequential guid
        })
        res.json({success:true,message:"company created",data:newCompany})
    } catch (error) {
        if (error.code === 11000) {
        return res.status(400).json({ 
            success: false, 
            message: "Duplicate value detected", 
            field: Object.keys(error.keyPattern)[0]
        });
    }
         res.json({success:false,message:error.message})
    }
}
export const createUser = async (req,res) =>{
    try {
        const {email,userName,password,mobile,role} = req.body

        // Check if user already exists
                const existingAdmin = await User.findOne({ email });
                if (existingAdmin) {
                  return res.json({success:false, message: `${role} User already exists` });
                }

                // Hash the password
                        const hashedPassword = await bcrypt.hash(password, 10);
                    
                        // Create admin
                        const newUser = await User.create({
                          email,
                          password: hashedPassword,
                          role,
                          mobile,
                          userName,
                        });
                    
                        res.json({
                            success:true,
                          message:  `${role} created successfully`,
                          admin: {
                            _id: newUser._id,
                            email: newUser.email,
                            userName: newUser.name,
                            role: newUser.role,
                          },
                        });
    } catch (error) {
        res.json({success:false,message:error.message})
    }
}