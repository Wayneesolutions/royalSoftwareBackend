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
    address: {
        street: {
            type: String,
            default: ''
        },
        city: {
            type: String,
            default: ''
        },
        state: {
            type: String,
            default: ''
        },
        pincode: {
            type: String,
            default: ''
        },
        country: {
            type: String,
            default: 'India'
        }
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
    // Groups array - users can belong to multiple groups
    groups: [{
        groupId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Group'
        },
        groupGUID: {
            type: String,
            trim: true
        },
        groupName: {
            type: String,
            trim: true
        },
        groupParentUser: {
            type: String,
            trim: true,
            default: null
        },
        cmpcode: {
            type: String,
            trim: true
        },
        remarks: {
            type: String,
            trim: true
        },
        other1: {
            type: String,
            trim: true
        },
        other2: {
            type: String,
            trim: true
        },
        other3: {
            type: String,
            trim: true
        },
        other4: {
            type: String,
            trim: true
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        isActive: {
            type: Boolean,
            default: true
        },
        assignedAt: {
            type: Date,
            default: Date.now
        }
    }],
    hierarchy: {
        parentUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true
        },
        parentUserName: {
            type: String,
            trim: true
        },
        parentUserRole: {
            type: String,
            trim: true
        },
        parentGroupGUID: {
            type: String,
            trim: true,
            default: null
        },
        level: {
            type: Number,
            default: 0 // 0 = superadmin, 1 = admin, etc.
        }
    },
    // Tally Group assignment (single group reference)
    tallyGroup: {
        groupId: {
            type: String,
            trim: true
        },
        GroupGUID: {
            type: String,
            trim: true
        },
        GroupName: {
            type: String,
            trim: true
        },
        GroupParent: {
            type: String,
            trim: true,
            default: null
        },
        cmpcode: {
            type: String,
            trim: true
        },
        Remarks: {
            type: String,
            trim: true
        },
        Other1: {
            type: String,
            trim: true
        },
        Other2: {
            type: String,
            trim: true
        },
        Other3: {
            type: String,
            trim: true
        },
        Other4: {
            type: String,
            trim: true
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        assignedAt: {
            type: Date,
            default: Date.now
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
    },
    // Subdealer-specific fields (only used when role is 'subdealer')
    subdealerDetails: {
        SDName: {
            type: String,
            trim: true
        },
        SDType: {
            type: String,
            enum: ['Sub Dealer', 'TSO'],
            trim: true
        },
        SDAddress1: {
            type: String,
            trim: true
        },
        SDAddress2: {
            type: String,
            trim: true
        },
        SDAddress3: {
            type: String,
            trim: true
        },
        SDState: {
            type: String,
            trim: true
        },
        SDCountry: {
            type: String,
            trim: true,
            default: 'India'
        },
        SDPincode: {
            type: String,
            trim: true
        },
        SDContactPerson: {
            type: String,
            trim: true
        },
        SDMobileNo: {
            type: String,
            trim: true
        },
        SDEmail: {
            type: String,
            trim: true,
            lowercase: true
        },
        SDGSTNType: {
            type: String,
            trim: true
        },
        SDGSTNNumber: {
            type: String,
            trim: true
        }
    }
}, {
    timestamps: true
});

// Index for better query performance
userSchema.index({ email: 1 });
userSchema.index({ mobile: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'companies.companyId': 1 });
userSchema.index({ 'groups.groupGUID': 1 });
userSchema.index({ 'hierarchy.parentUserId': 1 });

export default mongoose.model("User", userSchema);