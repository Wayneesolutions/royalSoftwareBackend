import mongoose from "mongoose";

const superAdminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // hashed
    role: {
        type: String,
        enum: ['superadmin'],
        default:"superadmin"
    },
    name: { type: String },
},{
    timestamps:true
})

export default mongoose.model("SuperAdmin", superAdminSchema);