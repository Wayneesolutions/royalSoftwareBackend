import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email: { 
        type: String, 
        unique: true,
        sparse: true // Allows multiple null values
    },
    name: {
        type: String,
        required: true
    },
    userName: {
        type: String,
        unique: true,
        sparse: true
    },
    password: { 
        type: String, 
        required: true 
    }, // hashed
    mobile: {
        type: String,
        unique: true,
        required: true,
        sparse: true
    },
    role: {
        type: String,
        enum: [
            'superadmin',
            'admin',
            'dealers',
            'subdealer',
            'asm',
            'rsm',
            'distibutors',
            'suppliers',
            'salesman',
            'zonal'
        ],
        required: true,
    },
    // Default company for admin users
    defaultCompany: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    companies: [{
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true
        },
        role: {
            type: String,
            enum: [
                'superadmin',
                'admin',
                'dealers',
                'subdealer',
                'asm',
                'rsm',
                'distibutors',
                'suppliers',
                'salesman',
                'zonal'
            ]
        },
        isActive: {
            type: Boolean,
            default: true
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        assignedAt: {
            type: Date,
            default: Date.now
        }
    }],
    hierarchy: {
        parentUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        level: {
            type: Number,
            default: 0 // 0 = superadmin, 1 = admin, etc.
        }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ mobile: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'companies.companyId': 1 });

export default mongoose.model("User", userSchema);