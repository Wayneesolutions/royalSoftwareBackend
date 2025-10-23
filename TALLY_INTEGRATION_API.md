# 🔗 Tally Integration API Documentation

## Overview
This API allows Tally ERP system to integrate with Royal App for seamless data exchange. Tally owners can use these endpoints to fetch approved orders, update order status, and sync target data.

## Base URL
```
http://localhost:5000/api/v1/tally
```

---

## 📋 **API Endpoints**

### 1️⃣ **Order Management**

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
