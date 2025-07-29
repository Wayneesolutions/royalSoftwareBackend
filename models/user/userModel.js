import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // hashed
    role: {
        type: String,
        enum: ['admin', 'dealers', 'subdealer','asm','rsm','distibutors','suppliers','salesman'],
        required: true,
    },
    name: { type: String },
},{
    timestamps:true
})

export default mongoose.model("User", userSchema);