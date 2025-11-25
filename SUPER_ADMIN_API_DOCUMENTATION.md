# Royal App - Super Admin API Documentation

## Overview
This document outlines the complete Super Admin functionality for the Royal App, a hierarchy-based sales management system with Tally integration.

## Base URL
```
http://localhost:5000/api/v1/superadmin
```

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## API Endpoints

### 1. Super Admin Authentication

#### Create Super Admin
```http
POST /create
```
**Description:** Create a new super admin user (no authentication required)

**Request Body:**
```json
{
  "email": "superadmin@royalapp.com",
  "password": "password123",
  "name": "Super Admin"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Super admin created",
  "data": {
    "_id": "user_id",
    "email": "superadmin@royalapp.com",
    "name": "Super Admin",
    "role": "superadmin"
  }
}
```

#### Login Super Admin
```http
POST /login
```
**Description:** Login as super admin

**Request Body:**
```json
{
  "email": "superadmin@royalapp.com",
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
      "_id": "user_id",
      "email": "superadmin@royalapp.com",
      "name": "Super Admin",
      "role": "superadmin"
    },
    "token": "jwt_token_here"
  }
}
```

### 2. Admin Management

#### Create Admin
```http
POST /create-admin
```
**Description:** Create a new admin user and assign to a company

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "email": "admin@company.com",
  "password": "password123",
  "name": "Admin User",
  "mobile": "+1234567890",
  "companyId": "company_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Admin created successfully",
  "data": {
    "_id": "admin_id",
    "email": "admin@company.com",
    "name": "Admin User",
    "mobile": "+1234567890",
    "role": "admin",
    "defaultCompany": {
      "_id": "company_id",
      "companyName": "Company Name",
      "companyCode": "COMP001"
    },
    "companies": [
      {
        "companyId": {
          "_id": "company_id",
          "companyName": "Company Name",
          "companyCode": "COMP001"
        },
        "role": "admin",
        "isActive": true
      }
    ]
  }
}
```

#### List All Admins
```http
GET /list-admins?page=1&limit=10&search=admin
```
**Description:** Get paginated list of all admin users

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search by name or email

**Response:**
```json
{
  "success": true,
  "data": {
    "admins": [
      {
        "_id": "admin_id",
        "name": "Admin User",
        "email": "admin@company.com",
        "mobile": "+1234567890",
        "role": "admin",
        "defaultCompany": {
          "companyName": "Company Name",
          "companyCode": "COMP001"
        },
        "companies": [...],
        "createdBy": {
          "name": "Super Admin",
          "email": "superadmin@royalapp.com"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalAdmins": 50,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### Get Admin Details
```http
GET /admin/{adminId}
```
**Description:** Get detailed information about a specific admin

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "admin_id",
    "name": "Admin User",
    "email": "admin@company.com",
    "mobile": "+1234567890",
    "role": "admin",
    "defaultCompany": {
      "companyName": "Company Name",
      "companyCode": "COMP001",
      "companyEmail": "company@email.com",
      "companyMobile": "+1234567890"
    },
    "companies": [...],
    "createdBy": {
      "name": "Super Admin",
      "email": "superadmin@royalapp.com"
    }
  }
}
```

#### Update Admin
```http
PATCH /update-admin/{adminId}
```
**Description:** Update admin information

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Updated Admin Name",
  "email": "newemail@company.com",
  "password": "newpassword123"
}
```

#### Delete Admin
```http
DELETE /delete-admin/{adminId}
```
**Description:** Delete an admin user

**Headers:** `Authorization: Bearer <token>`

#### Assign Company to Admin
```http
POST /assign-company/{adminId}
```
**Description:** Assign an additional company to an admin

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "companyId": "company_id_here",
  "setAsDefault": false
}
```

### 3. Company Management

#### Create Company
```http
POST /create-company
```
**Description:** Create a new company

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "companyName": "Royal Company Ltd",
  "companyState": "Maharashtra",
  "companyCountry": "India",
  "companyMobile": "+1234567890",
  "companyEmail": "info@royalcompany.com",
  "companyCode": "ROYAL001",
  "maxUser": 100,
  "guid": "ABC12345",
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
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Company created successfully",
  "data": {
    "_id": "company_id",
    "companyName": "Royal Company Ltd",
    "companyCode": "ROYAL001",
    "companyEmail": "info@royalcompany.com",
    "companyMobile": "+1234567890",
    "maxUser": 100,
    "guid": "ABC12345",
    "isActive": true,
    "createdBy": "super_admin_id",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### List All Companies
```http
GET /list-all-companies?page=1&limit=10&search=royal
```
**Description:** Get paginated list of all companies

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search by company name or code

**Response:**
```json
{
  "success": true,
  "data": {
    "companies": [
      {
        "_id": "company_id",
        "companyName": "Royal Company Ltd",
        "companyCode": "ROYAL001",
        "companyEmail": "info@royalcompany.com",
        "companyMobile": "+1234567890",
        "maxUser": 100,
        "guid": "ABC12345",
        "isActive": true,
        "createdBy": {
          "name": "Super Admin",
          "email": "superadmin@royalapp.com"
        },
        "assignedAdmins": [
          {
            "adminId": {
              "name": "Admin User",
              "email": "admin@company.com"
            },
            "assignedAt": "2024-01-01T00:00:00.000Z",
            "isActive": true
          }
        ]
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalCompanies": 25,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

#### Update Company
```http
PATCH /update-company/{companyId}
```
**Description:** Update company information

**Headers:** `Authorization: Bearer <token>`

#### Delete Company
```http
DELETE /delete-company/{companyId}
```
**Description:** Delete a company

**Headers:** `Authorization: Bearer <token>`

## Data Models

### User Model
```javascript
{
  _id: ObjectId,
  email: String (unique),
  name: String (required),
  mobile: String (unique, required),
  role: String (enum: ['superadmin', 'admin', 'dealers', 'subdealer', 'asm', 'rsm', 'distibutors', 'suppliers', 'salesman', 'zonal']),
  defaultCompany: ObjectId (ref: 'Company'),
  companies: [{
    companyId: ObjectId (ref: 'Company'),
    role: String,
    isActive: Boolean,
    assignedBy: ObjectId (ref: 'User'),
    assignedAt: Date
  }],
  hierarchy: {
    parentUser: ObjectId (ref: 'User'),
    level: Number
  },
  isActive: Boolean,
  lastLogin: Date,
  createdBy: ObjectId (ref: 'User'),
  createdAt: Date,
  updatedAt: Date
}
```

### Company Model
```javascript
{
  _id: ObjectId,
  companyName: String (required),
  companyState: String (required),
  companyCountry: String (required),
  companyMobile: String (unique, required),
  companyEmail: String (unique, required),
  companyCode: String (unique, required),
  maxUser: Number (required, min: 1),
  guid: String (unique, required, alphanumeric),
  contactDetails: {
    email: String,
    phone: String,
    website: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      pincode: String
    }
  },
  tallySettings: {
    isConnected: Boolean,
    lastSync: Date,
    syncFrequency: String (enum: ['manual', 'hourly', 'daily', 'weekly'])
  },
  settings: {
    allowSelfApproval: Boolean,
    requireOrderApproval: Boolean,
    maxOrderAmount: Number
  },
  isActive: Boolean,
  createdBy: ObjectId (ref: 'User'),
  assignedAdmins: [{
    adminId: ObjectId (ref: 'User'),
    assignedAt: Date,
    isActive: Boolean
  }],
  createdAt: Date,
  updatedAt: Date
}
```

## Key Features

### 1. Hierarchy-Based Access Control
- Super Admin can access all companies and users
- Admin can only access users within their assigned companies
- Proper role-based permissions enforced through middleware

### 2. Company Assignment
- Super Admin can assign multiple companies to an admin
- Default company concept for admin's primary company
- Company switching capability for admins

### 3. Enhanced Authentication
- JWT-based authentication with user context
- Role-based authorization middleware
- Company access validation
- Hierarchy access control

### 4. Comprehensive API Documentation
- Swagger/OpenAPI 3.0 documentation
- Interactive API testing interface
- Available at: `http://localhost:5000/api-docs`

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

### 1. Complete Admin Creation Flow
```bash
# 1. Create Super Admin
curl -X POST http://localhost:5000/api/v1/superadmin/create \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@royalapp.com","password":"password123","name":"Super Admin"}'

# 2. Login as Super Admin
curl -X POST http://localhost:5000/api/v1/superadmin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@royalapp.com","password":"password123"}'

# 3. Create Company
curl -X POST http://localhost:5000/api/v1/superadmin/create-company \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"companyName":"Test Company","companyState":"Maharashtra","companyCountry":"India","companyMobile":"+1234567890","companyEmail":"test@company.com","companyCode":"TEST001","maxUser":50,"guid":"ABC12345"}'

# 4. Create Admin for Company
curl -X POST http://localhost:5000/api/v1/superadmin/create-admin \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email":"admin@testcompany.com","password":"password123","name":"Test Admin","mobile":"+1234567891","companyId":"COMPANY_ID_FROM_STEP_3"}'
```

### 2. Admin Company Management
```bash
# List all admins
curl -X GET "http://localhost:5000/api/v1/superadmin/list-admins?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get admin details
curl -X GET http://localhost:5000/api/v1/superadmin/admin/ADMIN_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# Assign additional company to admin
curl -X POST http://localhost:5000/api/v1/superadmin/assign-company/ADMIN_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"companyId":"ANOTHER_COMPANY_ID","setAsDefault":false}'
```

## Next Steps

This Super Admin functionality provides the foundation for:
1. Admin login with company details display
2. Company switching for admins
3. User hierarchy management within companies
4. Sales order and target management
5. Tally integration and synchronization

The system is now ready for Admin-level functionality implementation.

