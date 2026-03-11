# Tally ERP Integration API Documentation

## Overview

This document provides comprehensive documentation for all Tally ERP integration APIs in the Royal Software Backend. These APIs enable bidirectional synchronization between Tally ERP and Royal Software, supporting companies, products, users, groups, dealers, subdealers, and orders.

> Prefer a shorter, easier-to-scan version?
> See: `backend/routes/tally/TALLY_API_DOCUMENTATION_SIMPLIFIED.md`

## Base URL

```
/api/v1/tally
```

## Standard Request-Response Pattern

All APIs follow a consistent pattern:

### Request Pattern
- **Single Payload**: Send a single JSON object
- **Batch Payload**: Send an array of JSON objects (where applicable)
- **Unique Identifier**: Each update/delete operation requires a unique identifier (guid, id, email, etc.)
- **Partial Updates**: Only provided fields are updated; omitted fields remain unchanged
- **Content-Type**: `application/json` or `text/xml` (XML support for Tally integration)

### Response Pattern
All APIs return a standard response structure:

```json
{
  "success": boolean,
  "results": [
    {
      "success": boolean,
      "message": "string (optional)",
      "error": "string (optional)",
      // ... updated/created data object
    }
  ]
}
```

### Status Codes
- **200**: All operations successful
- **207**: Partial success (some operations succeeded, some failed)
- **400**: All operations failed or validation error
- **404**: Resource not found
- **500**: Server error

### Auto-Managed Fields
- `createdAt` and `updatedAt` timestamps are automatically managed by the backend
- Default or system-controlled fields may be auto-adjusted
- Company codes (`cmpcode`) are automatically assigned from company GUID

---

## Table of Contents

1. [Company APIs](#company-apis)
2. [Product APIs](#product-apis)
3. [User APIs](#user-apis)
4. [Group APIs](#group-apis)
5. [Dealer APIs](#dealer-apis)
6. [SubDealer APIs](#subdealer-apis)
7. [Order APIs](#order-apis)

---

## Company APIs

### 1. Create Company

**Endpoint:** `POST /api/v1/tally/companies`

**Description:** Creates a new company from Tally ERP. If the company already exists (based on GUID), returns the existing record.

**Request Body:**
```json
{
  "guid": "ABC12345",
  "companyCode": "ROYAL01",
  "companyName": "Royal Paints Pvt Ltd",
  "companyEmail": "info@royalpaints.com",
  "companyMobile": "+919876543210",
  "companyState": "Karnataka",
  "companyCountry": "India",
  "maxUser": 100,
  "gstin": "29ABCDE1234F2Z5",
  "tallySerialId": "TALLY-SERIAL-001",
  "contactDetails": {
    "email": "support@royalpaints.com",
    "phone": "+919999888877",
    "website": "https://royalpaints.com",
    "address": {
      "street": "123 Main Street",
      "city": "Bangalore",
      "state": "Karnataka",
      "country": "India",
      "pincode": "560001"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "company": {
    "_id": "69205108354a88c52269d9c4",
    "guid": "ABC12345",
    "companyCode": "ROYAL01",
    "companyName": "Royal Paints Pvt Ltd",
    "companyEmail": "info@royalpaints.com",
    "companyMobile": "+919876543210",
    "companyState": "Karnataka",
    "companyCountry": "India",
    "maxUser": 100,
    "gstin": "29ABCDE1234F2Z5",
    "tallySerialId": "TALLY-SERIAL-001",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Required Fields:**
- `guid`
- `companyCode`
- `companyName`
- `companyEmail`
- `companyMobile`
- `companyState`
- `companyCountry`
- `maxUser`

---

### 2. Update Company

**Endpoint:** `PATCH /api/v1/tally/companies`

**Description:** Updates existing company/companies. Accepts single object or array. Only provided fields are updated.

**Request Body (Single):**
```json
{
  "guid": "ABC12345",
  "companyName": "Updated Company Name",
  "companyEmail": "newemail@royalpaints.com",
  "maxUser": 150
}
```

**Request Body (Batch):**
```json
[
  {
    "guid": "ABC12345",
    "companyName": "Updated Company Name 1"
  },
  {
    "guid": "XYZ67890",
    "companyEmail": "newemail2@royalpaints.com"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "company": {
        "_id": "69205108354a88c52269d9c4",
        "guid": "ABC12345",
        "companyName": "Updated Company Name",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    }
  ]
}
```

**Required Fields:**
- `guid` (to identify the company)

---

### 3. List All Companies

**Endpoint:** `GET /api/v1/tally/companies`

**Description:** Returns all companies configured in Royal Software.

**Response:**
```json
{
  "success": true,
  "count": 10,
  "companies": [
    {
      "_id": "69205108354a88c52269d9c4",
      "guid": "ABC12345",
      "companyCode": "ROYAL01",
      "companyName": "Royal Paints Pvt Ltd",
      "companyEmail": "info@royalpaints.com",
      "isActive": true
    }
  ]
}
```

---

### 4. Search Companies

**Endpoint:** `GET /api/v1/tally/companies/search`

**Description:** Search companies by GUID, code, serial, or name.

**Query Parameters:**
- `query` (string, optional): Free text search on name, code, email, GUID, or Tally serial
- `companyCode` (string, optional): Filter by company code
- `guid` (string, optional): Filter by GUID
- `tallySerialId` (string, optional): Filter by Tally serial ID
- `isActive` (boolean, optional): Filter by active status
- `limit` (integer, optional): Maximum results (default: 50)

**Example:**
```
GET /api/v1/tally/companies/search?query=Royal&limit=10
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "companies": [...]
}
```

---

### 5. Delete Company

**Endpoint:** `DELETE /api/v1/tally/companies/delete`

**Description:** Deletes one or multiple companies by GUID.

**Request Body (Single):**
```json
{
  "guid": "ABC12345"
}
```

**Request Body (Batch):**
```json
[
  { "guid": "ABC12345" },
  { "guid": "XYZ67890" }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "guid": "ABC12345",
      "message": "Company deleted successfully"
    }
  ]
}
```

**Required Fields:**
- `guid`

---

## Product APIs

### 1. Create/Update Product (Upsert)

**Endpoint:** `POST /api/v1/tally/products`

**Description:** Creates or updates products from Tally. Supports single product or batch processing.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "productCode": "PROD001",
  "productName": "Premium Paint 5L",
  "partNo": "PN-12345",
  "itemAlias": "PP5L",
  "description": "High quality premium paint",
  "parent": "Paints",
  "category": "Interior Paints",
  "subCategory": "Premium",
  "brand": "Royal",
  "baseUnits": "Liters",
  "additionalUnits": "Gallons",
  "price": 1500.50,
  "stdPurcRate": 1200.00,
  "stdSaleRate": 1500.50,
  "stock": 100,
  "gstRate": 18,
  "itemGstPer": 18,
  "itemHsn": "32091010",
  "itemHsnDesc": "Paints and varnishes",
  "openingBalance": 50,
  "itemOpRate": 1400.00,
  "companyCode": "ROYAL01",
  "isActive": true,
  "isFinishItem": true,
  "other1": "Custom field data 1",
  "other2": "Custom field data 2",
  "other3": "Custom field data 3",
  "other4": "Custom field data 4",
  "other5": "Custom field data 5"
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "productCode": "PROD001",
    "productName": "Premium Paint 5L"
  },
  {
    "companyGuid": "ABC12345",
    "productCode": "PROD002",
    "productName": "Standard Paint 1L"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "product": {
        "_id": "69205108354a88c52269d9c4",
        "name": "Premium Paint 5L",
        "productCode": "PROD001",
        "companyGuid": "ABC12345"
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `productCode`
- `productName`

---

### 2. Update Product

**Endpoint:** `PATCH /api/v1/tally/products`

**Description:** Updates existing products. Requires companyGuid and productCode (or productId).

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "productCode": "PROD001",
  "productName": "Updated Product Name",
  "price": 1600.00,
  "stock": 150
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "productCode": "PROD001",
    "price": 1600.00
  },
  {
    "companyGuid": "ABC12345",
    "productCode": "PROD002",
    "stock": 200
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "product": {
        "_id": "69205108354a88c52269d9c4",
        "productCode": "PROD001",
        "price": 1600.00,
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `productCode` or `productId`

---

### 3. Delete Product

**Endpoint:** `DELETE /api/v1/tally/companies/:guid/products`

**Description:** Deletes one or multiple products for a company by product code.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Request Body (Single):**
```json
{
  "productCode": "PROD001"
}
```

**Request Body (Batch):**
```json
[
  { "productCode": "PROD001" },
  { "productCode": "PROD002" }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "productCode": "PROD001",
      "message": "Product deleted successfully"
    }
  ]
}
```

**Required Fields:**
- `productCode`

---

### 4. Search Products

**Endpoint:** `GET /api/v1/tally/companies/:guid/products/search`

**Description:** Search products for a company by various criteria.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Query Parameters:**
- `query` (string, optional): Free text search across name, code, alias, description
- `productCode` (string, optional): Filter by product code
- `name` (string, optional): Filter by product name
- `category` (string, optional): Filter by category
- `isActive` (boolean, optional): Filter by active status
- `limit` (integer, optional): Maximum results (default: 50)

**Example:**
```
GET /api/v1/tally/companies/ABC12345/products/search?query=Paint&limit=20
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "products": [...]
}
```

---

### 5. List Products by Company

**Endpoint:** `GET /api/v1/tally/companies/:guid/products`

**Description:** Returns all products for a company.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "count": 50,
  "products": [...]
}
```

---

## User APIs

### 1. Create/Update User (Upsert)

**Endpoint:** `POST /api/v1/tally/users`

**Description:** Creates or updates users from Tally. Role is automatically set to "groupuser". Supports single user or batch processing.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "userName": "johndoe",
  "password": "SecurePassword123",
  "mobile": "+919876543210",
  "isActive": true,
  "address": {
    "street": "123 Main Street",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "country": "India"
  }
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "name": "John Doe",
    "email": "john.doe@example.com",
    "userName": "johndoe",
    "password": "SecurePassword123",
    "mobile": "+919876543210"
  },
  {
    "companyGuid": "ABC12345",
    "name": "Jane Smith",
    "email": "jane.smith@example.com",
    "userName": "janesmith",
    "password": "SecurePassword456",
    "mobile": "+919876543211"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "user": {
        "_id": "69205108354a88c52269d9c4",
        "name": "John Doe",
        "email": "john.doe@example.com",
        "userName": "johndoe",
        "mobile": "+919876543210",
        "role": "groupuser",
        "companies": ["ABC12345"]
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `name`
- `email`
- `userName`
- `password`
- `mobile`

**Note:** Role is automatically set to "groupuser" and cannot be changed via Tally API.

---

### 2. Update User

**Endpoint:** `PATCH /api/v1/tally/users/update` or `PUT /api/v1/tally/users/update`

**Alternative Endpoints:**
- `PATCH /api/v1/tally/companies/:guid/users/update`
- `PUT /api/v1/tally/companies/:guid/users/update`

**Description:** Updates existing users only (does not create new users). Company GUID can be provided in query parameter, path parameter, or request body.

**Query Parameters (Optional):**
- `companyGuid` (string): Company GUID (applies to all users if not in body)

**Path Parameters (Optional):**
- `guid` (string): Company GUID (if using path-based endpoint)

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "email": "john.doe@example.com",
  "name": "John Updated",
  "mobile": "+919876543212",
  "isActive": true
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "email": "john.doe@example.com",
    "name": "John Updated"
  },
  {
    "companyGuid": "ABC12345",
    "email": "jane.smith@example.com",
    "mobile": "+919876543213"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "user": {
        "_id": "69205108354a88c52269d9c4",
        "email": "john.doe@example.com",
        "name": "John Updated",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid` (required if not in query/path)
- User identifier: `email` (preferred), `mobile`, or `userName` (at least one required)

**Note:** Email is the primary identifier for user lookup.

---

### 3. List Users by Company

**Endpoint:** `GET /api/v1/tally/companies/:guid/users`

**Description:** Returns all users associated with a company.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "count": 25,
  "users": [
    {
      "_id": "69205108354a88c52269d9c4",
      "name": "John Doe",
      "email": "john.doe@example.com",
      "userName": "johndoe",
      "mobile": "+919876543210",
      "role": "groupuser",
      "isActive": true
    }
  ]
}
```

---

### 4. Delete User

**Endpoint:** `DELETE /api/v1/tally/users/delete` or `DELETE /api/v1/tally/companies/:guid/users`

**Description:** Deletes one or multiple users.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "email": "john.doe@example.com"
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "email": "john.doe@example.com"
  },
  {
    "companyGuid": "ABC12345",
    "email": "jane.smith@example.com"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "email": "john.doe@example.com",
      "message": "User deleted successfully"
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- User identifier: `email`, `mobile`, or `userName`

---

## Group APIs

### 1. Create/Update Group (Upsert)

**Endpoint:** `POST /api/v1/tally/groups`

**Description:** Creates or updates groups from Tally. Supports single group or batch processing.

**Request Body (Single):**
```json
{
  "GroupGUID": "GRP001",
  "GroupName": "Sales Team",
  "companyGuid": "ABC12345",
  "GroupParent": "GRP-PARENT-001",
  "Remarks": "Main sales group",
  "Other1": "Custom field 1",
  "Other2": "Custom field 2",
  "Other3": "Custom field 3",
  "Other4": "Custom field 4"
}
```

**Request Body (Batch):**
```json
[
  {
    "GroupGUID": "GRP001",
    "GroupName": "Sales Team",
    "companyGuid": "ABC12345"
  },
  {
    "GroupGUID": "GRP002",
    "GroupName": "Marketing Team",
    "companyGuid": "ABC12345"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "group": {
        "_id": "69205108354a88c52269d9c4",
        "GroupGUID": "GRP001",
        "GroupName": "Sales Team",
        "cmpcode": "ROYAL01",
        "companyGuid": "ABC12345"
      },
      "message": "Group created successfully"
    }
  ]
}
```

**Required Fields:**
- `GroupGUID`
- `GroupName`
- `companyGuid`

**Note:** `cmpcode` is automatically assigned from company.

---

### 2. Update Group

**Endpoint:** `PATCH /api/v1/tally/groups`

**Description:** Updates existing groups. Supports hierarchy updates via `GroupParent` or `parentGroupGUID`.

**Request Body (Single):**
```json
{
  "GroupGUID": "GRP001",
  "companyGuid": "ABC12345",
  "GroupName": "Updated Sales Team",
  "GroupParent": "GRP-PARENT-002",
  "Remarks": "Updated remarks"
}
```

**Request Body (Batch):**
```json
[
  {
    "GroupGUID": "GRP001",
    "companyGuid": "ABC12345",
    "GroupName": "Updated Sales Team"
  },
  {
    "GroupGUID": "GRP002",
    "companyGuid": "ABC12345",
    "GroupParent": null
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "group": {
        "_id": "69205108354a88c52269d9c4",
        "GroupGUID": "GRP001",
        "GroupName": "Updated Sales Team",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    }
  ]
}
```

**Required Fields:**
- `GroupGUID`
- `companyGuid`

**Note:** Set `GroupParent` to `null` or empty string to remove parent relationship.

---

### 3. Delete Group

**Endpoint:** `DELETE /api/v1/tally/groups/delete`

**Description:** Deletes one or multiple groups by GroupGUID.

**Request Body (Single):**
```json
{
  "GroupGUID": "GRP001"
}
```

**Request Body (Batch):**
```json
[
  { "GroupGUID": "GRP001" },
  { "GroupGUID": "GRP002" }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "GroupGUID": "GRP001",
      "message": "Group deleted successfully"
    }
  ]
}
```

**Required Fields:**
- `GroupGUID`

---

### 4. Search Groups

**Endpoint:** `GET /api/v1/tally/groups/search`

**Description:** Search groups by GUID, name, cmpcode, or parent.

**Query Parameters:**
- `query` (string, optional): Free text search on GroupGUID, GroupName, Remarks, or cmpcode
- `GroupGUID` (string, optional): Filter by Group GUID
- `GroupName` (string, optional): Filter by group name
- `cmpcode` (string, optional): Filter by company code
- `GroupParent` (string, optional): Filter by parent group GUID
- `isActive` (boolean, optional): Filter by active status
- `limit` (integer, optional): Maximum results (default: 50)

**Example:**
```
GET /api/v1/tally/groups/search?query=Sales&limit=20
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "groups": [...]
}
```

---

### 5. List Groups by Company

**Endpoint:** `GET /api/v1/tally/companies/:guid/groups`

**Description:** Returns all groups belonging to a company.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "count": 10,
  "groups": [...]
}
```

---

### 6. List Users by Group

**Endpoint:** `GET /api/v1/tally/groups/:groupGuid/users`

**Description:** Returns all users assigned to a specific group.

**Path Parameters:**
- `groupGuid` (string, required): Group GUID

**Response:**
```json
{
  "success": true,
  "count": 15,
  "users": [...]
}
```

---

## Dealer APIs

### 1. Create/Update Dealer (Upsert)

**Endpoint:** `POST /api/v1/tally/dealers`

**Description:** Creates or updates dealers (Ledgers) from Tally. Supports single dealer or batch processing.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "LedgerGUID": "LED-001",
  "LedgerName": "ABC Distributors",
  "LedgerMobile": "+919876543210",
  "Email": "abc@distributors.com",
  "password": "SecurePassword123",
  "LedgerGSTIN": "29ABCDE1234F2Z5",
  "LedgerAddress1": "123 Dealer Street",
  "LedgerAddress2": "Near Main Road",
  "LedgerState": "Karnataka",
  "LedgerOpening": 50000.00,
  "LedgerOpeningDate": "2024-01-01",
  "LedgerJoinDate": "2024-01-01",
  "groupGUID": "GRP001",
  "Remarks": "Main dealer",
  "Other1": "Custom field 1",
  "Other2": "Custom field 2",
  "Other3": "Custom field 3",
  "Other4": "Custom field 4",
  "Other5": "Custom field 5",
  "other6": "Custom field 6",
  "other7": "Custom field 7",
  "other8": "Custom field 8",
  "isActive": true
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "LedgerGUID": "LED-001",
    "LedgerName": "ABC Distributors"
  },
  {
    "companyGuid": "ABC12345",
    "LedgerGUID": "LED-002",
    "LedgerName": "XYZ Distributors"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "dealer": {
        "_id": "69205108354a88c52269d9c4",
        "LedgerGUID": "LED-001",
        "LedgerName": "ABC Distributors",
        "companyGuid": "ABC12345"
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `LedgerGUID`
- `LedgerName`

---

### 2. List Dealers by Company

**Endpoint:** `GET /api/v1/tally/dealers/:guid`

**Description:** Returns all dealers (Ledgers) for a company.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "count": 20,
  "dealers": [...]
}
```

---

### 3. Update Dealer

**Endpoint:** `PUT /api/v1/tally/dealers/update`

**Description:** Updates existing dealers. Only provided fields are updated.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "LedgerGUID": "LED-001",
  "LedgerName": "Updated Dealer Name",
  "LedgerMobile": "+919876543211",
  "Email": "newemail@distributors.com",
  "LedgerGSTIN": "29ABCDE1234F2Z6",
  "groupGUID": "GRP002",
  "isActive": true
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "LedgerGUID": "LED-001",
    "LedgerName": "Updated Dealer Name"
  },
  {
    "companyGuid": "ABC12345",
    "LedgerGUID": "LED-002",
    "isActive": false
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "dealer": {
        "_id": "69205108354a88c52269d9c4",
        "LedgerGUID": "LED-001",
        "LedgerName": "Updated Dealer Name",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `LedgerGUID`

---

### 4. Delete Dealer

**Endpoint:** `DELETE /api/v1/tally/dealers/delete`

**Description:** Deletes one or multiple dealers.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "LedgerGUID": "LED-001"
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "LedgerGUID": "LED-001"
  },
  {
    "companyGuid": "ABC12345",
    "LedgerGUID": "LED-002"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "LedgerGUID": "LED-001",
      "message": "Dealer deleted successfully"
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `LedgerGUID`

---

## SubDealer APIs

### 1. Create/Update SubDealer (Upsert)

**Endpoint:** `POST /api/v1/tally/subdealers`

**Description:** Creates or updates subdealers from Tally. Supports dealer connection via `ledgerGUID`. Supports single subdealer or batch processing.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "SDName": "XYZ Sub Distributors",
  "SDType": "Sub Dealer",
  "SDAddress1": "123 Sub Dealer Street",
  "SDAddress2": "Near Market",
  "SDAddress3": "Area 5",
  "SDState": "Karnataka",
  "SDCountry": "India",
  "SDPincode": "560001",
  "SDContactPerson": "John Doe",
  "SDMobileNo": "+919876543210",
  "SDEmail": "xyz@subdistributors.com",
  "SDGSTNType": "Regular",
  "SDGSTNNumber": "29ABCDE1234F2Z5",
  "ledgerGUID": "LED-001",
  "groupGUID": "GRP001",
  "password": "SecurePassword123",
  "isActive": true
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "SDName": "XYZ Sub Distributors",
    "SDType": "Sub Dealer",
    "ledgerGUID": "LED-001"
  },
  {
    "companyGuid": "ABC12345",
    "SDName": "ABC Sub Distributors",
    "SDType": "TSO"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "SDName": "XYZ Sub Distributors",
      "subdealer": {
        "_id": "69205108354a88c52269d9c4",
        "SDName": "XYZ Sub Distributors",
        "companyGuid": "ABC12345"
      },
      "message": "Subdealer created successfully and connected to dealer: ABC Distributors (LED-001)",
      "connectedToDealer": true,
      "ledgerGUID": "LED-001"
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `SDName`

**Optional Fields:**
- `ledgerGUID` or `LedgerGUID`: Connect subdealer to a dealer/ledger

**Note:** If `ledgerGUID` is provided, the subdealer will be connected to the dealer. The system validates that the ledger exists in the same company.

---

### 2. List SubDealers by Company

**Endpoint:** `GET /api/v1/tally/subdealers/:guid`

**Description:** Returns all subdealers for a company.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "count": 15,
  "subdealers": [...]
}
```

---

### 3. Update SubDealer

**Endpoint:** `PUT /api/v1/tally/subdealers/update`

**Description:** Updates existing subdealers. Only provided fields are updated.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "SDName": "XYZ Sub Distributors",
  "SDMobileNo": "+919876543211",
  "SDEmail": "newemail@subdistributors.com",
  "SDState": "Maharashtra",
  "isActive": true
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "SDName": "XYZ Sub Distributors",
    "SDMobileNo": "+919876543211"
  },
  {
    "companyGuid": "ABC12345",
    "SDName": "ABC Sub Distributors",
    "isActive": false
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "subdealer": {
        "_id": "69205108354a88c52269d9c4",
        "SDName": "XYZ Sub Distributors",
        "SDMobileNo": "+919876543211",
        "updatedAt": "2024-01-15T11:00:00.000Z"
      }
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `SDName` (to identify the subdealer)

---

### 4. Delete SubDealer

**Endpoint:** `DELETE /api/v1/tally/subdealers/delete`

**Description:** Deletes one or multiple subdealers.

**Request Body (Single):**
```json
{
  "companyGuid": "ABC12345",
  "SDName": "XYZ Sub Distributors"
}
```

**Request Body (Batch):**
```json
[
  {
    "companyGuid": "ABC12345",
    "SDName": "XYZ Sub Distributors"
  },
  {
    "companyGuid": "ABC12345",
    "SDName": "ABC Sub Distributors"
  }
]
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "SDName": "XYZ Sub Distributors",
      "message": "Subdealer deleted successfully"
    }
  ]
}
```

**Required Fields:**
- `companyGuid`
- `SDName`

---

## Order APIs

### 1. List Approved Orders

**Endpoint:** `GET /api/v1/tally/companies/:guid/orders/approved`

**Description:** Returns all approved orders for a company. Orders are formatted for Tally import.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "company": {
    "id": "69205108354a88c52269d9c4",
    "name": "Royal Paints Pvt Ltd",
    "code": "ROYAL01",
    "guid": "ABC12345"
  },
  "totalOrders": 25,
  "orders": [
    {
      "_id": "69205108354a88c52269d9c5",
      "orderNumber": "ORD-001",
      "orderDate": "2024-01-15",
      "status": "approved",
      "customerName": "ABC Distributors",
      "customerAddress": "123 Main Street",
      "ledgerGUID": "LED-001",
      "subDealer": {
        "SDName": "XYZ Sub Distributors",
        "SDGSTNNumber": "29ABCDE1234F2Z5"
      },
      "totalAmount": 50000.00,
      "discountAmount": 1000.00,
      "taxableValue": 49000.00,
      "taxAmount": 8820.00,
      "finalAmount": 57820.00,
      "cgstTotal": 4410.00,
      "sgstTotal": 4410.00,
      "igstTotal": 0.00,
      "termsofpayment": "Net 30",
      "otherref": "REF-001",
      "termsofdel1": "FOB",
      "termsofdel2": "Standard",
      "ordernotes": "Handle with care",
      "items": [
        {
          "productCode": "PROD001",
          "productName": "Premium Paint 5L",
          "quantity": 10,
          "unitPrice": 1500.00,
          "totalPrice": 15000.00,
          "discount": 0,
          "taxableValue": 15000.00,
          "cgstAmount": 1350.00,
          "sgstAmount": 1350.00,
          "igstAmount": 0.00
        }
      ],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### 2. List Unapproved Orders

**Endpoint:** `GET /api/v1/tally/companies/:guid/orders/unapproved`

**Description:** Returns all draft and pending approval orders for a company.

**Path Parameters:**
- `guid` (string, required): Company GUID

**Response:**
```json
{
  "success": true,
  "company": {
    "id": "69205108354a88c52269d9c4",
    "name": "Royal Paints Pvt Ltd",
    "code": "ROYAL01",
    "guid": "ABC12345"
  },
  "totalOrders": 10,
  "orders": [
    {
      "orderNumber": "ORD-002",
      "status": "draft",
      "customerName": "ABC Distributors",
      "customerEmail": "abc@distributors.com",
      "customerMobile": "+919876543210",
      "dealerName": "ABC Distributors",
      "subDealerName": "XYZ Sub Distributors",
      "totalAmount": 30000.00,
      "finalAmount": 35400.00,
      "taxAmount": 5400.00,
      "taxableValueTotal": 30000.00,
      "cgstTotal": 2700.00,
      "sgstTotal": 2700.00,
      "igstTotal": 0.00,
      "createdBy": {
        "name": "John Doe",
        "email": "john.doe@example.com",
        "userName": "johndoe",
        "role": "groupuser"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE (only in development mode)"
}
```

### Common Error Codes

- `COMPANY_NOT_FOUND`: Company with specified GUID not found
- `PRODUCT_NOT_FOUND`: Product not found
- `USER_NOT_FOUND`: User not found
- `GROUP_NOT_FOUND`: Group not found
- `DEALER_NOT_FOUND`: Dealer/Ledger not found
- `SUBDEALER_NOT_FOUND`: Subdealer not found
- `VALIDATION_ERROR`: Request validation failed
- `INVALID_TALLY_PAYLOAD`: Invalid JSON or XML payload format
- `DUPLICATE_ENTRY`: Duplicate record detected

### Partial Success Response (207)

When some operations succeed and others fail:

```json
{
  "success": false,
  "results": [
    {
      "success": true,
      "product": {...}
    },
    {
      "success": false,
      "productCode": "PROD002",
      "message": "Company not found for GUID: XYZ123",
      "error": "COMPANY_NOT_FOUND"
    }
  ]
}
```

---

## Best Practices

1. **Batch Processing**: Use array payloads for bulk operations to improve performance
2. **Idempotency**: POST endpoints are idempotent - sending the same data multiple times is safe
3. **Partial Updates**: Only send fields that need to be updated in PATCH/PUT requests
4. **Error Handling**: Always check the `success` flag and handle partial success (207) responses
5. **Unique Identifiers**: Always provide the required unique identifier (guid, email, productCode, etc.) for updates and deletes
6. **Company Validation**: Ensure company exists before creating related entities (products, users, etc.)
7. **XML Support**: APIs accept both JSON and XML payloads for Tally integration

---

## Notes

- All timestamps are in ISO 8601 format (UTC)
- All monetary values are in the base currency (typically INR)
- All phone numbers should include country code
- Email addresses must be valid and unique where applicable
- Passwords are automatically hashed before storage
- Company codes (`cmpcode`) are automatically assigned from company GUID
- User roles are automatically set to "groupuser" for Tally-synced users
- Group hierarchy can be updated via `GroupParent` field
- Subdealers can be connected to dealers via `ledgerGUID` field

---

## Support

For API support or questions, please contact the development team or refer to the Swagger documentation at `/api/v1/api-docs`.

