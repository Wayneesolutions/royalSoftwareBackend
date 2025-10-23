# Royal App - Admin API Documentation

## Overview
This document outlines the complete Admin functionality for the Royal App, including company management, user creation, and hierarchy management.

## Base URL
```
http://localhost:3000/api/v1/admin
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## API Endpoints

### 1. Admin Authentication

#### Admin Login
```http
POST /login
```
**Description:** Login as admin and get company details

**Request Body:**
```json
{
  "email": "admin@royalcompany.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "admin": {
      "_id": "admin_id",
      "email": "admin@royalcompany.com",
      "name": "Admin User",
      "mobile": "+1234567891",
      "role": "admin",
      "defaultCompany": {
        "_id": "company_id",
        "companyName": "Royal Company Ltd",
        "companyCode": "ROYAL001",
        "companyEmail": "info@royalcompany.com",
        "companyMobile": "+1234567890",
        "contactDetails": {
          "email": "contact@royalcompany.com",
          "phone": "+1234567890",
          "website": "https://royalcompany.com"
        }
      },
      "companies": [
        {
          "companyId": {
            "_id": "company_id",
            "companyName": "Royal Company Ltd",
            "companyCode": "ROYAL001"
          },
          "role": "admin",
          "isActive": true
        }
      ]
    },
    "token": "jwt_token_here"
  }
}
```

### 2. Company Management

#### Get Company Data
```http
GET /company-data?companyId=company_id_here
```
**Description:** Get detailed company information and statistics

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `companyId` (optional): Company ID (uses default if not provided)

**Response:**
```json
{
  "success": true,
  "data": {
    "company": {
      "_id": "company_id",
      "companyName": "Royal Company Ltd",
      "companyCode": "ROYAL001",
      "companyEmail": "info@royalcompany.com",
      "companyMobile": "+1234567890",
      "maxUser": 100,
      "contactDetails": {
        "email": "contact@royalcompany.com",
        "phone": "+1234567890",
        "website": "https://royalcompany.com",
        "address": {
          "street": "123 Business Street",
          "city": "Mumbai",
          "state": "Maharashtra",
          "country": "India",
          "pincode": "400001"
        }
      },
      "settings": {
        "allowSelfApproval": true,
        "requireOrderApproval": true,
        "maxOrderAmount": 100000
      },
      "tallySettings": {
        "isConnected": false,
        "syncFrequency": "daily"
      },
      "createdBy": {
        "name": "Super Admin",
        "email": "superadmin@royalapp.com"
      },
      "assignedAdmins": [
        {
          "adminId": {
            "name": "Admin User",
            "email": "admin@royalcompany.com"
          },
          "assignedAt": "2024-01-01T00:00:00.000Z",
          "isActive": true
        }
      ],
      "createdAt": "2024-01-01T00:00:00.000Z"
    },
    "statistics": {
      "totalUsers": 5,
      "userByRole": [
        {
          "_id": "zonal",
          "count": 1
        },
        {
          "_id": "rsm",
          "count": 1
        },
        {
          "_id": "asm",
          "count": 1
        },
        {
          "_id": "dealers",
          "count": 1
        }
      ],
      "maxUsersAllowed": 100,
      "usagePercentage": 5
    }
  }
}
```

#### Switch Company
```http
POST /switch-company
```
**Description:** Switch admin's default company

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "companyId": "company_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Company switched successfully",
  "data": {
    "admin": {
      "_id": "admin_id",
      "email": "admin@royalcompany.com",
      "name": "Admin User",
      "mobile": "+1234567891",
      "role": "admin",
      "defaultCompany": {
        "_id": "new_company_id",
        "companyName": "New Company Ltd",
        "companyCode": "NEW001"
      },
      "companies": [...]
    }
  }
}
```

### 3. User Management

#### Create User
```http
POST /create-user
```
**Description:** Create a new user in the hierarchy

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "email": "rsm@royalcompany.com",
  "password": "password123",
  "name": "Regional Sales Manager",
  "mobile": "+1234567893",
  "role": "rsm",
  "companyId": "company_id_here",
  "parentUserId": "parent_user_id_here"
}
```

**Supported Roles:**
- `zonal` - Zonal Manager
- `rsm` - Regional Sales Manager
- `asm` - Area Sales Manager
- `salesman` - Sales Officer/Manager
- `dealers` - Dealer/Distributor
- `subdealer` - Sub Dealer
- `distibutors` - Distributor

**Response:**
```json
{
  "success": true,
  "message": "rsm created successfully",
  "data": {
    "_id": "user_id",
    "email": "rsm@royalcompany.com",
    "name": "Regional Sales Manager",
    "mobile": "+1234567893",
    "role": "rsm",
    "companies": [
      {
        "companyId": {
          "_id": "company_id",
          "companyName": "Royal Company Ltd",
          "companyCode": "ROYAL001"
        },
        "role": "rsm",
        "isActive": true,
        "assignedBy": "admin_id",
        "assignedAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "hierarchy": {
      "parentUser": {
        "_id": "parent_user_id",
        "name": "Zonal Manager",
        "email": "zonal@royalcompany.com",
        "role": "zonal"
      },
      "level": 3
    },
    "createdBy": {
      "_id": "admin_id",
      "name": "Admin User",
      "email": "admin@royalcompany.com"
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Users by Company
```http
GET /users-by-company?companyId=company_id&role=rsm&page=1&limit=10
```
**Description:** Get all users in admin's company with pagination

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `companyId` (optional): Company ID (uses default if not provided)
- `role` (optional): Filter by role
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "_id": "user_id",
        "name": "Regional Sales Manager",
        "email": "rsm@royalcompany.com",
        "mobile": "+1234567893",
        "role": "rsm",
        "companies": [...],
        "hierarchy": {
          "parentUser": {
            "name": "Zonal Manager",
            "email": "zonal@royalcompany.com",
            "role": "zonal"
          },
          "level": 3
        },
        "createdBy": {
          "name": "Admin User",
          "email": "admin@royalcompany.com"
        },
        "isActive": true,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalUsers": 4,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

#### Get Users by Role
```http
GET /role/{role}
```
**Description:** Get all users with a specific role

**Headers:** `Authorization: Bearer <token>`

**Path Parameters:**
- `role`: Role to filter by (zonal, rsm, asm, salesman, dealers, subdealer, distibutors)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "user_id",
      "name": "Regional Sales Manager",
      "email": "rsm@royalcompany.com",
      "mobile": "+1234567893",
      "role": "rsm",
      "companies": [...],
      "hierarchy": {
        "parentUser": {
          "name": "Zonal Manager",
          "email": "zonal@royalcompany.com",
          "role": "zonal"
        },
        "level": 3
      }
    }
  ]
}
```

#### Get User by ID
```http
GET /get-user/{userId}
```
**Description:** Get detailed information about a specific user

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "user details",
  "data": {
    "_id": "user_id",
    "name": "Regional Sales Manager",
    "email": "rsm@royalcompany.com",
    "mobile": "+1234567893",
    "role": "rsm",
    "companies": [...],
    "hierarchy": {...},
    "createdBy": {...},
    "isActive": true,
    "lastLogin": "2024-01-01T00:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Dashboard

#### Admin Dashboard
```http
GET /dashboard?fromDate=20240401&toDate=20240723&ledgerName=ledger_name
```
**Description:** Get admin dashboard data with Tally integration

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `fromDate` (optional): Start date for data (format: YYYYMMDD)
- `toDate` (optional): End date for data (format: YYYYMMDD)
- `ledgerName` (optional): Specific ledger name to filter

**Response:**
```json
{
  "success": true,
  "data": {
    "sales": {
      // Sales data from Tally
    },
    "ledger": {
      // Ledger data from Tally
    }
  }
}
```

## User Hierarchy

The system follows this hierarchy structure:

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

## Key Features

### 1. Company-Based Access Control
- Admins can only access users within their assigned companies
- Company switching capability for multi-company admins
- Company-specific statistics and data

### 2. Hierarchy Management
- Automatic hierarchy level assignment based on role
- Parent-child relationship tracking
- Role-based permissions and data visibility

### 3. User Creation Flow
- Admins can create users at any level below them
- Automatic company assignment
- Hierarchy relationship establishment
- Role-based access validation

### 4. Data Visibility
- Admins see all users in their companies
- Role-based filtering and search
- Company-specific statistics and usage tracking

## Error Handling

All APIs return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error (development only)"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not Found
- `500`: Internal Server Error

## Usage Examples

### 1. Complete Admin Workflow
```bash
# 1. Admin Login
curl -X POST http://localhost:3000/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@royalcompany.com","password":"password123"}'

# 2. Get Company Data
curl -X GET "http://localhost:3000/api/v1/admin/company-data" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Create Zonal Manager
curl -X POST http://localhost:3000/api/v1/admin/create-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email":"zonal@royalcompany.com","password":"password123","name":"Zonal Manager","mobile":"+1234567892","role":"zonal","companyId":"COMPANY_ID"}'

# 4. Create RSM under Zonal
curl -X POST http://localhost:3000/api/v1/admin/create-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email":"rsm@royalcompany.com","password":"password123","name":"Regional Sales Manager","mobile":"+1234567893","role":"rsm","companyId":"COMPANY_ID","parentUserId":"ZONAL_USER_ID"}'

# 5. Get All Users in Company
curl -X GET "http://localhost:3000/api/v1/admin/users-by-company" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 6. Switch Company (if admin has multiple companies)
curl -X POST http://localhost:3000/api/v1/admin/switch-company \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"companyId":"ANOTHER_COMPANY_ID"}'
```

### 2. User Management Examples
```bash
# Get all RSM users
curl -X GET http://localhost:3000/api/v1/admin/role/rsm \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific user details
curl -X GET http://localhost:3000/api/v1/admin/get-user/USER_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Create ASM user
curl -X POST http://localhost:3000/api/v1/admin/create-user \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email":"asm@royalcompany.com","password":"password123","name":"Area Sales Manager","mobile":"+1234567894","role":"asm","companyId":"COMPANY_ID","parentUserId":"RSM_USER_ID"}'
```

## Next Steps

This Admin functionality provides the foundation for:
1. Sales order management within companies
2. Target assignment and tracking
3. Reports and analytics
4. Tally integration for data synchronization
5. Order approval workflows

The system is now ready for Sales Order and Target management implementation.

