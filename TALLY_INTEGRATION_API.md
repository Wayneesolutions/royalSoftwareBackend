# 🔗 Tally Integration API Documentation

## Overview
This API allows Tally ERP system to integrate with Royal App for seamless data exchange. Tally owners can use these endpoints to fetch approved orders, update order status, and sync target data.

## Base URL
```
http://localhost:5000/api/v1/tally
```

---

## 📋 **API Endpoints**

### 0️⃣ **Master Data**

#### GET Company Dealers
**Endpoint:** `GET /company/{companyId}/dealers`

**Description:** Fetch active dealers (and subdealers if requested) for a company. Designed for Tally to maintain party masters.

**Path Parameters:**
- `companyId` (required): Company ID

**Query Parameters:**
- `updatedAfter` (optional): ISO date string to fetch only dealers updated after this timestamp
- `includeInactive` (optional, default `false`): Set to `true` to include inactive dealers
- `role` (optional, default `dealers`): Role filter (`dealers`, `subdealer`)

**Example Request:**
```bash
GET /api/v1/tally/company/68f4d554e863e90829877a60/dealers?updatedAfter=2024-10-01T00:00:00.000Z
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "appUserId": "6700ab79c0a9273c5c3d81ac",
      "name": "Royal Traders",
      "userName": "ROYAL-0001",
      "email": "dealer@royal.com",
      "mobile": "9999912345",
      "role": "dealers",
      "address": {
        "street": "12 Market Road",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "pincode": "600001",
        "country": "India"
      },
      "hierarchy": {
        "parentUser": "66ff3d6bd7d7bf3f288c0bef",
        "level": 6
      },
      "companyAssignments": [
        {
          "companyId": "68f4d554e863e90829877a60",
          "role": "dealers",
          "isActive": true,
          "assignedAt": "2024-09-01T08:00:00.000Z",
          "assignedBy": "66ff3d6bd7d7bf3f288c0bef"
        }
      ],
      "createdBy": "66ff3d6bd7d7bf3f288c0bef",
      "isActive": true,
      "createdAt": "2024-09-01T08:00:00.000Z",
      "updatedAt": "2024-10-05T06:30:00.000Z"
    }
  ]
}
```

#### GET Company Admins
**Endpoint:** `GET /company/{companyId}/admins`

**Description:** Fetch admin users created for a specific company. Useful to keep Tally’s security mappings aligned.

**Path Parameters:**
- `companyId` (required): Company ID

**Query Parameters:**
- `updatedAfter` (optional): ISO date string to fetch only admins updated after this timestamp
- `includeInactive` (optional, default `false`): Set to `true` to include inactive admin accounts

**Example Request:**
```bash
GET /api/v1/tally/company/68f4d554e863e90829877a60/admins
```

**Response:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "appUserId": "66ff3d6bd7d7bf3f288c0bef",
      "name": "Anita Admin",
      "userName": "ANITA-ADMIN",
      "email": "admin@royal.com",
      "mobile": "9876543210",
      "role": "admin",
      "hierarchy": {
        "parentUser": "66ff3d6bd7d7bf3f288c0bee",
        "level": 1
      },
      "companyAssignments": [
        {
          "companyId": "68f4d554e863e90829877a60",
          "isActive": true,
          "assignedAt": "2024-08-12T09:00:00.000Z",
          "assignedBy": "66ff3d6bd7d7bf3f288c0bee"
        }
      ],
      "createdBy": "66ff3d6bd7d7bf3f288c0bee",
      "createdAt": "2024-08-12T09:00:00.000Z",
      "updatedAt": "2024-10-10T11:30:00.000Z",
      "isActive": true
    }
  ]
}
```

### 1️⃣ **Order Management**

#### GET Company Orders
**Endpoint:** `GET /company/{companyId}/orders`

**Description:** Fetch all orders for a company with optional filters. This serves as the master list for Tally to pull fresh orders (any status).

**Path Parameters:**
- `companyId` (required): Company ID

**Query Parameters:**
- `status` (optional): Comma separated list of statuses (default: all)
- `fromDate` (optional): Filter by order date start (YYYY-MM-DD or ISO)
- `toDate` (optional): Filter by order date end
- `updatedAfter` (optional): Fetch orders updated after the given timestamp
- `dealerId` (optional): Filter by specific dealer
- `customerId` (optional): Filter by customer
- `limit` (optional, default `100`, max `500`)
- `offset` (optional, default `0`)

**Example Request:**
```bash
GET /api/v1/tally/company/68f4d554e863e90829877a60/orders?status=approved,sent_to_tally&fromDate=2024-10-01
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "appOrderId": "6700b3f2f2c6127ab724713a",
      "orderNumber": "ROYAL-ORD-20241005-0001",
      "status": "approved",
      "companyId": "68f4d554e863e90829877a60",
      "customer": {
        "id": "6700ab79c0a9273c5c3d81ac",
        "name": "Royal Traders",
        "email": "dealer@royal.com",
        "mobile": "9999912345",
        "address": {
          "street": "12 Market Road",
          "city": "Chennai",
          "state": "Tamil Nadu",
          "pincode": "600001",
          "country": "India"
        }
      },
      "dealer": {
        "id": "6700ab79c0a9273c5c3d81ac",
        "name": "Royal Traders",
        "email": "dealer@royal.com",
        "mobile": "9999912345"
      },
      "items": [
        {
          "productId": "66fe8cbdf8d8e82811d2b5f1",
          "productName": "Royal Cement 50kg",
          "productCode": "RC-50",
          "quantity": 10,
          "unitPrice": 350,
          "totalPrice": 3500,
          "discount": 0,
          "tax": 18
        }
      ],
      "orderDate": "2024-10-05T08:15:00.000Z",
      "deliveryDate": null,
      "totals": {
        "totalAmount": 3500,
        "discountAmount": 0,
        "taxAmount": 630,
        "finalAmount": 4130
      },
      "payment": {
        "status": "pending",
        "method": "credit"
      },
      "tally": {
        "tallyGUID": null,
        "tallySyncStatus": "pending",
        "tallySyncAt": null
      },
      "createdBy": {
        "id": "6700ab79c0a9273c5c3d81ac",
        "name": "Royal Traders",
        "role": "dealers",
        "email": "dealer@royal.com"
      },
      "approvedBy": null,
      "approvalHistory": [],
      "notes": "Urgent delivery requested",
      "shippingAddress": null,
      "updatedAt": "2024-10-05T08:20:00.000Z",
      "createdAt": "2024-10-05T08:15:00.000Z"
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 100,
    "offset": 0,
    "hasMore": false
  },
  "message": "Orders retrieved successfully"
}
```

#### GET Approved Orders
**Endpoint:** `GET /orders/approved`

**Description:** Fetch approved orders that need to be synced to Tally

**Query Parameters:**
- `companyId` (required): Company ID
- `fromDate` (optional): Start date (YYYY-MM-DD)
- `toDate` (optional): End date (YYYY-MM-DD)
- `limit` (optional): Number of records (default: 100)
- `offset` (optional): Skip records (default: 0)

**Example Request:**
```bash
GET /api/v1/tally/orders/approved?companyId=68f4d554e863e90829877a60&fromDate=2024-01-01&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "appOrderId": "68f8cd55d473fa8d4af0b817",
      "orderNumber": "ORD-2024-001",
      "customerName": "John Doe",
      "customerEmail": "john@example.com",
      "customerMobile": "9876543210",
      "items": [
        {
          "productId": "68f8cd55d473fa8d4af0b818",
          "productName": "Sample Product",
          "productCode": "PROD-001",
          "quantity": 10,
          "unitPrice": 100,
          "totalPrice": 1000
        }
      ],
      "totalAmount": 1000,
      "finalAmount": 1000,
      "orderDate": "2024-01-15T10:30:00Z",
      "createdBy": {
        "id": "68f4d5dfe863e90829877a71",
        "name": "Dealer Name",
        "role": "dealers"
      },
      "approvedBy": {
        "id": "68f4d5dfe863e90829877a72",
        "name": "Admin Name",
        "role": "admin"
      }
    }
  ],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

#### POST Update Order Tally Info
**Endpoint:** `POST /orders/update-tally-info`

**Description:** Update order with Tally GUID after voucher creation

**Request Body:**
```json
{
  "appOrderId": "68f8cd55d473fa8d4af0b817",
  "tallyGUID": "TALLY-GUID-12345",
  "tallyVoucherNumber": "VCH-2024-001",
  "syncStatus": "synced"
}
```

**Response:**
```json
{
  "success": true,
  "order": {
    "appOrderId": "68f8cd55d473fa8d4af0b817",
    "orderNumber": "ORD-2024-001",
    "tallyGUID": "TALLY-GUID-12345",
    "tallyVoucherNumber": "VCH-2024-001",
    "tallySyncStatus": "synced",
    "tallySyncAt": "2024-01-15T12:00:00Z",
    "status": "sent_to_tally"
  }
}
```

#### POST Import Orders from Tally
**Endpoint:** `POST /company/{companyId}/orders/import`

**Description:** Push sales orders from Tally into the mobile app database. Supports create/update operations based on `tallyGUID` or `orderNumber`.

**Path Parameters:**
- `companyId` (required): Company ID

**Request Body:**
```json
{
  "orders": [
    {
      "tallyGUID": "TALLY-ORD-00045",
      "orderNumber": "ROYAL-ORD-20241005-0005",
      "status": "approved",
      "createdBy": "6700ab79c0a9273c5c3d81ac",
      "dealerId": "6700ab79c0a9273c5c3d81ac",
      "customerId": "6700ab79c0a9273c5c3d81ac",
      "orderDate": "2024-10-05T09:00:00.000Z",
      "deliveryDate": "2024-10-08T09:00:00.000Z",
      "payment": {
        "status": "paid",
        "method": "bank_transfer"
      },
      "items": [
        {
          "productId": "66fe8cbdf8d8e82811d2b5f1",
          "productName": "Royal Cement 50kg",
          "productCode": "RC-50",
          "quantity": 20,
          "unitPrice": 340,
          "totalPrice": 6800,
          "discount": 5,
          "tax": 18
        }
      ],
      "totals": {
        "totalAmount": 6800,
        "discountAmount": 340,
        "taxAmount": 1178.4,
        "finalAmount": 7638.4
      },
      "notes": "Imported from Tally on 5 Oct",
      "approvedBy": "66ff3d6bd7d7bf3f288c0bef",
      "approvedAt": "2024-10-05T09:05:00.000Z",
      "tallySyncStatus": "synced",
      "tallySyncAt": "2024-10-05T09:05:00.000Z"
    }
  ]
}
```

**Response (Mixed Success):**
```json
{
  "success": false,
  "summary": {
    "created": 1,
    "updated": 2,
    "errors": [
      {
        "index": 2,
        "orderNumber": "ROYAL-ORD-20241005-0007",
        "tallyGUID": null,
        "message": "Each item must include a valid productId"
      }
    ]
  },
  "message": "Orders processed from Tally"
}
```

### 2️⃣ **Target Management**

#### GET Targets
**Endpoint:** `GET /targets`

**Description:** Fetch targets for comparison with Tally data

**Query Parameters:**
- `companyId` (required): Company ID
- `year` (optional): Target year
- `month` (optional): Target month
- `role` (optional): User role filter

**Example Request:**
```bash
GET /api/v1/tally/targets?companyId=68f4d554e863e90829877a60&year=2024&month=1
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "appTargetId": "68f8cd55d473fa8d4af0b819",
      "targetId": "TGT-2024-001",
      "assignedTo": {
        "id": "68f4d5dfe863e90829877a71",
        "name": "Dealer Name",
        "role": "dealers"
      },
      "targetType": "monthly",
      "period": {
        "year": 2024,
        "month": 1,
        "startDate": "2024-01-01T00:00:00Z",
        "endDate": "2024-01-31T23:59:59Z"
      },
      "targetAmount": 100000,
      "targetQuantity": 1000,
      "achievedAmount": 75000,
      "achievedQuantity": 750,
      "achievementPercentage": 75
    }
  ]
}
```

#### POST Update Targets from Tally
**Endpoint:** `POST /targets/update-from-tally`

**Description:** Update targets with achievement data from Tally

**Request Body:**
```json
{
  "targets": [
    {
      "appTargetId": "68f8cd55d473fa8d4af0b819",
      "tallyTargetId": "TALLY-TGT-001",
      "achievedAmount": 80000,
      "achievedQuantity": 800,
      "tallySyncStatus": "synced"
    }
  ]
}
```

### 3️⃣ **Company Information**

#### GET Company Info
**Endpoint:** `GET /company/info`

**Description:** Fetch company and user information

**Query Parameters:**
- `companyId` (required): Company ID

**Response:**
```json
{
  "success": true,
  "data": {
    "company": {
      "id": "68f4d554e863e90829877a60",
      "companyName": "ABC Company",
      "companyCode": "ABC001",
      "companyEmail": "info@abccompany.com",
      "gstin": "29ABCDE1234F1Z5"
    },
    "users": [
      {
        "id": "68f4d5dfe863e90829877a71",
        "name": "Dealer Name",
        "email": "dealer@example.com",
        "role": "dealers",
        "hierarchyLevel": 6
      }
    ]
  }
}
```

### 4️⃣ **Statistics**

#### GET Sales Report
**Endpoint:** `GET /company/{companyId}/sales-report`

**Description:** Aggregated sales summary for a company. Supports multiple grouping options for Tally reports.

**Path Parameters:**
- `companyId` (required): Company ID

**Query Parameters:**
- `fromDate` (optional): Filter by order date start
- `toDate` (optional): Filter by order date end
- `groupBy` (optional, default `daily`): `daily`, `monthly`, or `yearly`
- `dealerId` (optional): Limit report to a specific dealer

**Example Request:**
```bash
GET /api/v1/tally/company/68f4d554e863e90829877a60/sales-report?groupBy=monthly&fromDate=2024-04-01&toDate=2024-09-30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "grouping": "monthly",
    "sales": [
      {
        "period": {
          "year": 2024,
          "month": 4
        },
        "totals": {
          "orderCount": 120,
          "grossAmount": 1200000,
          "discount": 60000,
          "tax": 216000,
          "netSales": 1356000
        }
      },
      {
        "period": {
          "year": 2024,
          "month": 5
        },
        "totals": {
          "orderCount": 135,
          "grossAmount": 1380000,
          "discount": 69000,
          "tax": 248400,
          "netSales": 1565400
        }
      }
    ],
    "topDealers": [
      {
        "dealerId": "6700ab79c0a9273c5c3d81ac",
        "dealerName": "Royal Traders",
        "dealerMobile": "9999912345",
        "dealerEmail": "dealer@royal.com",
        "orderCount": 45,
        "totalSales": 530000
      }
    ]
  },
  "message": "Sales report generated successfully"
}
```

#### GET Order Statistics
**Endpoint:** `GET /orders/stats`

**Description:** Fetch order statistics for reporting

**Query Parameters:**
- `companyId` (required): Company ID
- `fromDate` (optional): Start date
- `toDate` (optional): End date

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOrders": 150,
    "totalAmount": 1500000,
    "byStatus": {
      "approved": {
        "count": 100,
        "totalAmount": 1000000
      },
      "sent_to_tally": {
        "count": 50,
        "totalAmount": 500000
      }
    }
  }
}
```

### 5️⃣ **Ledger & Outstanding**

#### POST Sync Ledger Data
**Endpoint:** `POST /ledger/sync`

**Description:** Sync ledger/outstanding data from Tally

**Request Body:**
```json
{
  "companyId": "68f4d554e863e90829877a60",
  "ledgerData": [
    {
      "partyName": "Customer A",
      "outstandingAmount": 50000,
      "lastPaymentDate": "2024-01-10T00:00:00Z"
    }
  ]
}
```

---

## 🔧 **Integration Workflow**

### For Tally Owners:

1. **Fetch Approved Orders:**
   ```bash
   GET /api/v1/tally/orders/approved?companyId=YOUR_COMPANY_ID
   ```

2. **Create Vouchers in Tally:**
   - Use the order data to create sales vouchers
   - Generate Tally GUID for each voucher

3. **Update Order Status:**
   ```bash
   POST /api/v1/tally/orders/update-tally-info
   {
     "appOrderId": "ORDER_ID",
     "tallyGUID": "TALLY_GUID",
     "tallyVoucherNumber": "VOUCHER_NUMBER"
   }
   ```

4. **Sync Target Data (Optional):**
   ```bash
   GET /api/v1/tally/targets?companyId=YOUR_COMPANY_ID
   POST /api/v1/tally/targets/update-from-tally
   ```

5. **Pull Master Data Updates:**
   ```bash
   GET /api/v1/tally/company/{companyId}/dealers
   GET /api/v1/tally/company/{companyId}/admins
   GET /api/v1/tally/company/{companyId}/sales-report
   ```

---

## 🚨 **Error Handling**

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

**Common HTTP Status Codes:**
- `200`: Success
- `400`: Bad Request (missing required parameters)
- `404`: Not Found (resource doesn't exist)
- `500`: Internal Server Error

---

## 🔐 **Security Notes**

- These endpoints are designed for Tally integration and don't require authentication
- Consider implementing API key authentication for production use
- All data exchange is in JSON format
- Use HTTPS in production environment

---

## 📞 **Support**

For integration support or questions, contact the development team.
