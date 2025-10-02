import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    companyName: { type: String, required: true },
    companyState: { type: String, required: true },
    companyCountry: { type: String, required: true },
    companyMobile: { type: String, required: true },
    companyEmail: { type: String, required: true },
    companyCode: { type: String, required: true, unique: true },
    maxUser: { type: Number, required: true },
    guid:{ type: Number, required: true, unique: true }
}, {
    timestamps: true
});

export default mongoose.model("Company", companySchema);
