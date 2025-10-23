import mongoose from "mongoose";

const companySchema = new mongoose.Schema({
    companyName: { 
        type: String, 
        required: true,
        trim: true
    },
    companyState: { 
        type: String, 
        required: true,
        trim: true
    },
    companyCountry: { 
        type: String, 
        required: true,
        trim: true
    },
    companyMobile: { 
        type: String, 
        required: true,
        unique: true
    },
    companyEmail: { 
        type: String, 
        required: true,
        unique: true,
        lowercase: true
    },
    companyCode: { 
        type: String, 
        required: true, 
        unique: true,
        uppercase: true,
        trim: true
    },
    maxUser: { 
        type: Number, 
        required: true,
        min: 1
    },
    // Optional GSTIN - must be unique when provided
    gstin: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    guid: { 
        type: Number, 
        required: true, 
        unique: true 
    },
    contactDetails: {
        email: {
            type: String,
            lowercase: true
        },
        phone: {
            type: String
        },
        website: {
            type: String
        },
        address: {
            street: String,
            city: String,
            state: String,
            country: String,
            pincode: String
        }
    },
    
    // Company settings
    settings: {
        allowSelfApproval: {
            type: Boolean,
            default: true
        },
        requireOrderApproval: {
            type: Boolean,
            default: true
        },
        maxOrderAmount: {
            type: Number,
            default: 100000
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Track admin assignments
    assignedAdmins: [{
        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        assignedAt: {
            type: Date,
            default: Date.now
        },
        isActive: {
            type: Boolean,
            default: true
        }
    }]
}, {
    timestamps: true
});

// Index for better query performance
companySchema.index({ companyCode: 1 });
companySchema.index({ companyEmail: 1 });
companySchema.index({ companyMobile: 1 });
companySchema.index({ guid: 1 });
companySchema.index({ isActive: 1 });
// Ensure sparse unique index for gstin so multiple documents without gstin are allowed
companySchema.index({ gstin: 1 }, { unique: true, sparse: true });

export default mongoose.model("Company", companySchema);
