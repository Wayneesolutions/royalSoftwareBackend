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
        type: String, 
        required: false, // Made optional to allow null values
        unique: true,
        sparse: true, // Allow multiple null values without violating uniqueness
        trim: true
    },
    tallySerialId: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
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
        default: null
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
    ,
    // Bundle B (Korvo + Loyvexa): the brand's Loyvexa loyalty account.
    // Set up from Loyvexa (POST /api/v1/hub/provision) or by an admin
    // (PUT /api/v1/integrations/loyvexa). See services/loyvexa.js.
    integrations: {
        loyvexa: {
            enabled: { type: Boolean, default: false },
            baseUrl: { type: String, trim: true },
            tenantSlug: { type: String, trim: true },
            // lvx_ connector key Korvo uses to call Loyvexa (never sent to apps)
            connectorKey: { type: String, select: false },
            // Key Loyvexa uses to push WhatsApp orders here; only its hash is kept
            inboundKeyHash: { type: String, select: false, index: true, sparse: true },
            inboundKeyPrefix: { type: String },
            earnOn: { type: String, enum: ['approved', 'delivered'], default: 'delivered' },
            lastMasterSyncAt: Date,
            lastOutstandingSyncAt: Date,
        }
    }
}, {
    timestamps: true
});

// Index for better query performance
companySchema.index({ companyCode: 1 });
companySchema.index({ companyEmail: 1 });
companySchema.index({ companyMobile: 1 });
companySchema.index({ guid: 1 });
companySchema.index({ isActive: 1 });
companySchema.index({ tallySerialId: 1 });
// Ensure sparse unique index for gstin so multiple documents without gstin are allowed
companySchema.index({ gstin: 1 }, { unique: true, sparse: true });

export default mongoose.model("Company", companySchema);
