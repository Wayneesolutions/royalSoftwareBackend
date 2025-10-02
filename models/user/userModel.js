import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: { type: String },
    userName:{type:String},
    password: { type: String, required: true }, // hashed
    mobile: {type:String},
    role: {
        type: String,
        enum: ['admin', 'dealers', 'subdealer','asm','rsm','distibutors','suppliers','salesman'],
        required: true,
    },
},{
    timestamps:true
})

export default mongoose.model("User", userSchema);