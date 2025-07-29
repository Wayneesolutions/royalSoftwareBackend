import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    legalName: { type: String, required: true },
    gstin: { type: Number, required: true, unique: true },
    contact: { type: Number, required: true },
    companyAddress: { type: String, required: true }
}, {
    timestamps: true
});

export default mongoose.model("Company", companySchema);
