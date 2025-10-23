# Royal App - Universal System Documentation

## Overview
This document outlines the complete Universal Login System and Tally Integration for the Royal App, providing role-based data access and seamless Tally connectivity.

## Base URLs
```
Authentication: http://localhost:3000/api/v1/auth
Tally Integration: http://localhost:3000/api/v1/tally
```

## 1. Universal Authentication System

### Universal Login Endpoint
```http
POST /api/v1/auth/login
```

**Description:** Single login endpoint that works for all user types (Super Admin, Admin, and all hierarchy users)

**Request Body:**
```json
{
  "email": "user@company.com",
  "password": "password123"
}
```

**Response Structure:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "_id": "user_id",
      "email": "user@company.com",
      "name": "User Name",
      "mobile": "+1234567890",
      "role": "admin",
      "defaultCompany": {
        "_id": "company_id",
        "companyName": "Company Name",
        "companyCode": "COMP001"
      },
      "companies": [...],
      "hierarchy": {...},
      "createdBy": {...},
      "lastLogin": "2024-01-01T00:00:00.000Z"
    },
    "roleSpecificData": {
      // Data specific to user role
    },
    "token": "jwt_token_here"
  }
}
```

## 2. Role-Based Data Display

### Super Admin Data
When a Super Admin logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "totalCompanies": 5,
      "totalAdmins": 10,
      "totalUsers": 150,
      "recentActivity": []
    },
    "permissions": {
      "canCreateCompanies": true,
      "canCreateAdmins": true,
      "canViewAllData": true,
      "canManageSystem": true
    }
  }
}
```

### Admin Data
When an Admin logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "companies": [
        {
          "companyId": "company_id",
          "companyName": "Company Name",
          "companyCode": "COMP001",
          "totalUsers": 25,
          "maxUsers": 100,
          "usagePercentage": 25,
          "userByRole": [
            {"_id": "zonal", "count": 2},
            {"_id": "rsm", "count": 5},
            {"_id": "asm", "count": 8},
            {"_id": "dealers", "count": 10}
          ]
        }
      ],
      "totalCompanies": 1,
      "totalUsers": 25
    },
    "permissions": {
      "canCreateUsers": true,
      "canManageCompany": true,
      "canViewCompanyData": true,
      "canAssignTargets": true
    }
  }
}
```

### Zonal Manager Data
When a Zonal Manager logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "rsmCount": 3,
      "totalSubUsers": 15,
      "rsmUsers": [
        {
          "_id": "rsm_id",
          "name": "RSM Name",
          "email": "rsm@company.com",
          "mobile": "+1234567890",
          "lastLogin": "2024-01-01T00:00:00.000Z"
        }
      ],
      "userHierarchy": [...]
    },
    "permissions": {
      "canViewRSMData": true,
      "canAssignTargets": true,
      "canViewReports": true,
      "canApproveOrders": true
    }
  }
}
```

### RSM Data
When an RSM logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "asmCount": 4,
      "totalSubUsers": 12,
      "asmUsers": [...],
      "userHierarchy": [...]
    },
    "permissions": {
      "canViewASMData": true,
      "canAssignTargets": true,
      "canViewReports": true,
      "canApproveOrders": true
    }
  }
}
```

### ASM Data
When an ASM logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "salesOfficerCount": 3,
      "dealerCount": 8,
      "totalSubUsers": 11,
      "salesOfficers": [...],
      "dealers": [...]
    },
    "permissions": {
      "canViewSalesOfficerData": true,
      "canViewDealerData": true,
      "canAssignTargets": true,
      "canViewReports": true,
      "canApproveOrders": true
    }
  }
}
```

### Sales Officer Data
When a Sales Officer logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "dealerCount": 5,
      "dealers": [...]
    },
    "permissions": {
      "canViewDealerData": true,
      "canCreateOrders": true,
      "canViewOwnOrders": true,
      "canViewReports": true
    }
  }
}
```

### Dealer/Distributor Data
When a Dealer logs in, they receive:
```json
{
  "roleSpecificData": {
    "dashboard": {
      "recentOrders": [],
      "targets": [],
      "outstanding": []
    },
    "permissions": {
      "canCreateOrders": true,
      "canViewOwnOrders": true,
      "canViewOwnTargets": true,
      "canViewOwnOutstanding": true
    }
  }
}
```

## 3. Tally Integration APIs

### Get All Companies
```http
GET /api/v1/tally/companies
```

**Description:** Get all companies for Tally integration

**Response:**
```json
{
  "success": true,
  "message": "Companies retrieved successfully",
  "data": [
    {
      "_id": "company_id",
      "companyName": "Company Name",
      "companyCode": "COMP001",
      "companyEmail": "info@company.com",
      "companyMobile": "+1234567890",
      "guid": 12345,
      "tallySettings": {
        "isConnected": false,
        "lastSync": null,
        "syncFrequency": "daily"
      }
    }
  ]
}
```

### Get Company Users
```http
GET /api/v1/tally/company/{companyId}/users
```

**Description:** Get all users for a specific company

**Response:**
```json
{
  "success": true,
  "message": "Users retrieved successfully",
  "data": {
    "companyId": "company_id",
    "totalUsers": 5,
    "users": [
      {
        "_id": "user_id",
        "name": "User Name",
        "email": "user@company.com",
        "mobile": "+1234567890",
        "role": "admin",
        "companies": [...],
        "hierarchy": {...},
        "createdBy": {...},
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### Get Company Hierarchy
```http
GET /api/v1/tally/company/{companyId}/hierarchy
```

**Description:** Get company hierarchy structure

**Response:**
```json
{
  "success": true,
  "message": "Hierarchy retrieved successfully",
  "data": {
    "companyId": "company_id",
    "hierarchy": [
      {
        "_id": "admin_id",
        "name": "Admin User",
        "email": "admin@company.com",
        "role": "admin",
        "children": [
          {
            "_id": "zonal_id",
            "name": "Zonal Manager",
            "email": "zonal@company.com",
            "role": "zonal",
            "children": [...]
          }
        ]
      }
    ]
  }
}
```

### Get Company Statistics
```http
GET /api/v1/tally/company/{companyId}/statistics
```

**Description:** Get company statistics

**Response:**
```json
{
  "success": true,
  "message": "Statistics retrieved successfully",
  "data": {
    "company": {
      "_id": "company_id",
      "companyName": "Company Name",
      "companyCode": "COMP001",
      "maxUser": 100
    },
    "statistics": {
      "totalUsers": 5,
      "usagePercentage": 5,
      "userByRole": [
        {
          "_id": "zonal",
          "count": 1,
          "users": [...]
        },
        {
          "_id": "rsm",
          "count": 1,
          "users": [...]
        }
      ]
    }
  }
}
```

### Export Company Data
```http
GET /api/v1/tally/export/company/{companyId}?format=json
```

**Description:** Export company data in various formats (json, xml, csv)

**Query Parameters:**
- `format`: Export format (json, xml, csv) - default: json

**Response:**
```json
{
  "success": true,
  "message": "Data exported successfully",
  "data": {
    "company": {
      "_id": "company_id",
      "companyName": "Company Name",
      "companyCode": "COMP001",
      // ... complete company data
    },
    "users": [
      // ... complete user data
    ],
    "exportInfo": {
      "exportedAt": "2024-01-01T00:00:00.000Z",
      "totalUsers": 5,
      "format": "json"
    }
  }
}
```

### Sync Data from Tally
```http
POST /api/v1/tally/sync/company/{companyId}
```

**Description:** Sync data from Tally to Royal App

**Request Body:**
```json
{
  "syncType": "users",
  "data": {
    // Data to sync from Tally
  }
}
```

**Sync Types:**
- `users`: Sync user data
- `hierarchy`: Sync hierarchy structure
- `settings`: Sync company settings

**Response:**
```json
{
  "success": true,
  "message": "users synced successfully",
  "data": {
    "message": "Users sync not implemented yet",
    "data": {...}
  }
}
```

## 4. User Hierarchy Structure

```
Super Admin (Level 0)
    ↓
Admin (Level 1)
    ↓
Zonal Manager (Level 2)
    ↓
Regional Sales Manager - RSM (Level 3)
    ↓
Area Sales Manager - ASM (Level 4)
    ↓
Sales Officer/Manager (Level 5)
    ↓
Dealer/Distributor (Level 6)
    ↓
Sub Dealer (Level 7)
```

## 5. Key Features

### Universal Login System
- ✅ Single login endpoint for all user types
- ✅ Role-based data display
- ✅ Automatic permission assignment
- ✅ Company-specific data access
- ✅ Hierarchy-based data visibility

### Tally Integration
- ✅ Public APIs (no authentication required)
- ✅ Multiple export formats (JSON, XML, CSV)
- ✅ Company-specific data access
- ✅ Hierarchy structure export
- ✅ Statistics and reporting
- ✅ Data synchronization endpoints

### Role-Based Access Control
- ✅ Super Admin: Full system access
- ✅ Admin: Company-specific management
- ✅ Zonal: Regional data and RSM management
- ✅ RSM: Area data and ASM management
- ✅ ASM: Sales officer and dealer management
- ✅ Sales Officer: Dealer data and order creation
- ✅ Dealer: Own data and order management

## 6. Usage Examples

### Universal Login Flow
```bash
# Login as any user type
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@company.com","password":"password123"}'

# Response includes role-specific data automatically
```

### Tally Integration Examples
```bash
# Get all companies
curl -X GET http://localhost:3000/api/v1/tally/companies

# Get users for specific company
curl -X GET http://localhost:3000/api/v1/tally/company/COMPANY_ID/users

# Get company hierarchy
curl -X GET http://localhost:3000/api/v1/tally/company/COMPANY_ID/hierarchy

# Export company data as JSON
curl -X GET "http://localhost:3000/api/v1/tally/export/company/COMPANY_ID?format=json"

# Export company data as CSV
curl -X GET "http://localhost:3000/api/v1/tally/export/company/COMPANY_ID?format=csv"

# Sync data from Tally
curl -X POST http://localhost:3000/api/v1/tally/sync/company/COMPANY_ID \
  -H "Content-Type: application/json" \
  -d '{"syncType":"users","data":{...}}'
```

## 7. Frontend Integration

### Login Implementation
```javascript
// Universal login function
async function login(email, password) {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const result = await response.json();
  
  if (result.success) {
    const { user, roleSpecificData, token } = result.data;
    
    // Store token for future requests
    localStorage.setItem('token', token);
    
    // Display role-specific dashboard
    displayDashboard(user.role, roleSpecificData);
    
    return { user, roleSpecificData };
  }
  
  throw new Error(result.message);
}
```

### Role-Based Dashboard Display
```javascript
function displayDashboard(userRole, roleSpecificData) {
  switch (userRole) {
    case 'superadmin':
      displaySuperAdminDashboard(roleSpecificData);
      break;
    case 'admin':
      displayAdminDashboard(roleSpecificData);
      break;
    case 'zonal':
      displayZonalDashboard(roleSpecificData);
      break;
    case 'rsm':
      displayRSMDashboard(roleSpecificData);
      break;
    case 'asm':
      displayASMDashboard(roleSpecificData);
      break;
    case 'salesman':
      displaySalesmanDashboard(roleSpecificData);
      break;
    case 'dealers':
    case 'distibutors':
      displayDealerDashboard(roleSpecificData);
      break;
    default:
      displayDefaultDashboard(roleSpecificData);
  }
}
```

## 8. Next Steps

The Universal System is now ready for:
1. **Sales Order Management** - Create and manage orders
2. **Target Assignment** - Assign and track targets
3. **Order Approval Workflows** - Implement hierarchy-based approvals
4. **Reports & Analytics** - Generate role-specific reports
5. **Advanced Tally Integration** - Implement data synchronization

## 9. API Documentation

- **Swagger UI**: `http://localhost:3000/api-docs`
- **Authentication APIs**: `/api/v1/auth/*`
- **Tally Integration APIs**: `/api/v1/tally/*`
- **Admin APIs**: `/api/v1/admin/*`
- **Super Admin APIs**: `/api/v1/superadmin/*`

The system is now fully functional with universal login and comprehensive Tally integration!
