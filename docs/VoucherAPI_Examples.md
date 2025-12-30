# Voucher API - Testing Guide

## Overview
This API allows you to sync voucher data from Tally ERP to the Royal Software system. The API validates company and ledger (dealer) existence before creating/updating vouchers.

---

## Authentication

**⚠️ IMPORTANT: Most endpoints do NOT require authentication (designed for Tally integration)**

| Endpoint | Authentication Required |
|----------|------------------------|
| POST `/api/v1/voucher/sync` | ❌ No (Tally integration) |
| GET `/api/v1/voucher/list` | ❌ No (Tally integration) |
| GET `/api/v1/voucher/stats` | ❌ No (Tally integration) |
| GET `/api/v1/voucher/:vchguid` | ❌ No (Tally integration) |
| DELETE `/api/v1/voucher/:vchguid` | ✅ Yes (Destructive operation) |

**For DELETE endpoint only:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## API Endpoints

### 1. Sync Vouchers from Tally (Single or Bulk)

**Endpoint:** `POST /api/v1/voucher/sync`

**Description:** Sync single or multiple vouchers from Tally. Automatically validates company and ledger existence.

**Request Body:**

```json
{
  "vouchers": [
    {
      "cmpcode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
      "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
      "vchnumber": "INV-2024-001",
      "vchdate": "2024-12-30",
      "vchtype": "Sales",
      "vchtypeparent": "Invoice",
      "vchpartyguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1",
      "vchpartyname": "ABC Traders",
      "vchpartyadd1": "123 Main Street",
      "vchpartyadd2": "Near City Mall",
      "vchpartyadd3": "Ludhiana, Punjab",
      "vchpartygstin": "03AABCU9603R1ZM",
      "vchsubdealername": "Sub Dealer Name",
      "vchsubdealeradd1": "Sub Dealer Address Line 1",
      "vchsubdealeradd2": "Sub Dealer Address Line 2",
      "vchsubdealeradd3": "Sub Dealer Address Line 3",
      "isinvoice": "Yes",
      "vchgrno": "GR-12345",
      "vchtransport": "Royal Transport",
      "vchtruckno": "PB-05-1234",
      "vchdrivername": "Rajesh Kumar",
      "vchdrivermobile": "9876543210",
      "vchdestination": "Delhi",
      "vchpymtterms": "Net 30 Days",
      "vchotherref": "PO-2024-001",
      "vchqtunit": "PCS",
      "vchqtunit2": "KG",
      "vchgoodsamt": 50000.00,
      "vchamount": 59000.00,
      "vchnarration": "Sale of goods as per order",
      "remarks": "Payment received",
      "other1": "Custom field 1",
      "other2": "Custom field 2",
      "other3": "Custom field 3",
      "other4": "Custom field 4",
      "other5": "Custom field 5",
      "other6": "Custom field 6",
      "other7": "Custom field 7",
      "other8": "Custom field 8",
      "other9": "Custom field 9",
      "other10": "Custom field 10"
    },
    {
      "cmpcode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
      "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001235",
      "vchnumber": "INV-2024-002",
      "vchdate": "2024-12-30",
      "vchtype": "Purchase",
      "vchpartyguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2",
      "vchamount": 25000.00,
      "vchgoodsamt": 21186.44
    }
  ]
}
```

**Required Fields:**
- `cmpcode` - Company code
- `vchguid` - Voucher unique GUID
- `vchnumber` - Voucher number
- `vchdate` - Voucher date
- `vchtype` - Voucher type (Sales, Purchase, etc.)
- `vchpartyguid` - Ledger/Dealer GUID (must exist in system)
- `vchamount` - Voucher total amount

**Response (Success):**

```json
{
  "success": true,
  "message": "Voucher sync completed. Success: 2, Failed: 0",
  "data": {
    "success": [
      {
        "index": 0,
        "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
        "vchnumber": "INV-2024-001",
        "action": "Created",
        "ledgerName": "ABC Traders"
      },
      {
        "index": 1,
        "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001235",
        "vchnumber": "INV-2024-002",
        "action": "Updated",
        "ledgerName": "XYZ Suppliers"
      }
    ],
    "failed": [],
    "totalProcessed": 2,
    "totalSuccess": 2,
    "totalFailed": 0
  }
}
```

**Response (Partial Success):**

```json
{
  "success": true,
  "message": "Voucher sync completed. Success: 1, Failed: 1",
  "data": {
    "success": [
      {
        "index": 0,
        "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
        "vchnumber": "INV-2024-001",
        "action": "Created",
        "ledgerName": "ABC Traders"
      }
    ],
    "failed": [
      {
        "index": 1,
        "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001235",
        "vchnumber": "INV-2024-002",
        "error": "Ledger/Dealer not found or inactive for LedgerGUID: 901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2 in company: 732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
      }
    ],
    "totalProcessed": 2,
    "totalSuccess": 1,
    "totalFailed": 1
  }
}
```

---

### 2. Get Vouchers by Company

**Endpoint:** `GET /api/v1/voucher/list`

**Query Parameters:**
- `cmpcode` (required) - Company code
- `startDate` (optional) - Start date (YYYY-MM-DD)
- `endDate` (optional) - End date (YYYY-MM-DD)
- `vchtype` (optional) - Voucher type filter
- `ledgerguid` (optional) - Filter by ledger GUID
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 50) - Items per page

**Example Request:**

```
GET /api/v1/voucher/list?cmpcode=732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC&startDate=2024-01-01&endDate=2024-12-31&page=1&limit=10
```

**Response:**

```json
{
  "success": true,
  "message": "Vouchers fetched successfully",
  "data": {
    "vouchers": [
      {
        "_id": "67730a1101705973ec495123",
        "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
        "vchnumber": "INV-2024-001",
        "vchdate": "2024-12-30T00:00:00.000Z",
        "vchtype": "Sales",
        "vchamount": 59000,
        "vchpartyname": "ABC Traders",
        "ledgerId": {
          "_id": "67730a1101705973ec495111",
          "LedgerName": "ABC Traders",
          "LedgerMobile": "9876543210"
        },
        "companyId": {
          "_id": "67730a1101705973ec495100",
          "companyName": "Royal Enterprises",
          "companyCode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
        }
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalCount": 45,
      "limit": 10
    }
  }
}
```

---

### 3. Get Voucher by GUID

**Endpoint:** `GET /api/v1/voucher/:vchguid`

**Query Parameters:**
- `cmpcode` (required) - Company code

**Example Request:**

```
GET /api/v1/voucher/901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234?cmpcode=732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC
```

**Response:**

```json
{
  "success": true,
  "message": "Voucher fetched successfully",
  "data": {
    "_id": "67730a1101705973ec495123",
    "companyguid": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
    "cmpcode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
    "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
    "vchnumber": "INV-2024-001",
    "vchdate": "2024-12-30T00:00:00.000Z",
    "vchtype": "Sales",
    "vchtypeparent": "Invoice",
    "vchpartyguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1",
    "vchpartyname": "ABC Traders",
    "vchpartyadd1": "123 Main Street",
    "vchpartyadd2": "Near City Mall",
    "vchpartyadd3": "Ludhiana, Punjab",
    "vchpartygstin": "03AABCU9603R1ZM",
    "vchamount": 59000,
    "vchgoodsamt": 50000,
    "vchnarration": "Sale of goods as per order",
    "ledgerId": {
      "_id": "67730a1101705973ec495111",
      "LedgerName": "ABC Traders",
      "LedgerMobile": "9876543210",
      "LedgerAddress1": "123 Main Street",
      "LedgerGSTIN": "03AABCU9603R1ZM"
    },
    "companyId": {
      "_id": "67730a1101705973ec495100",
      "companyName": "Royal Enterprises",
      "companyCode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC"
    },
    "createdAt": "2024-12-30T12:00:00.000Z",
    "updatedAt": "2024-12-30T12:00:00.000Z"
  }
}
```

---

### 4. Get Voucher Statistics

**Endpoint:** `GET /api/v1/voucher/stats`

**Query Parameters:**
- `cmpcode` (required) - Company code
- `startDate` (optional) - Start date
- `endDate` (optional) - End date

**Example Request:**

```
GET /api/v1/voucher/stats?cmpcode=732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC&startDate=2024-01-01&endDate=2024-12-31
```

**Response:**

```json
{
  "success": true,
  "message": "Voucher statistics fetched successfully",
  "data": {
    "totalVouchers": 150,
    "amountStats": {
      "totalAmount": 2500000,
      "totalGoodsAmount": 2118644,
      "avgAmount": 16666.67
    },
    "voucherTypeStats": [
      {
        "_id": "Sales",
        "count": 100,
        "totalAmount": 2000000
      },
      {
        "_id": "Purchase",
        "count": 50,
        "totalAmount": 500000
      }
    ]
  }
}
```

---

### 5. Delete Voucher (Soft Delete)

**Endpoint:** `DELETE /api/v1/voucher/:vchguid`

**Query Parameters:**
- `cmpcode` (required) - Company code

**Example Request:**

```
DELETE /api/v1/voucher/901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234?cmpcode=732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC
```

**Response:**

```json
{
  "success": true,
  "message": "Voucher deleted successfully"
}
```

---

## Validation Rules

### 1. Company Validation
- System checks if company exists using `cmpcode`
- Company must be active (`isActive: true`)
- If company not found, voucher sync will fail for that record

### 2. Ledger (Dealer) Validation
- System validates `vchpartyguid` against `Ledger.LedgerGUID`
- Ledger must belong to the specified company
- Ledger must be active
- If ledger not found, voucher sync will fail for that record

### 3. Duplicate Handling
- If a voucher with the same `vchguid` and `cmpcode` exists, it will be **updated**
- If it doesn't exist, a new voucher will be **created**

---

## Error Responses

### 400 Bad Request - Missing Fields

```json
{
  "success": false,
  "message": "Please provide vouchers array with at least one voucher"
}
```

### 401 Unauthorized

```json
{
  "success": false,
  "message": "Not authorized, token failed"
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Voucher not found"
}
```

### 500 Server Error

```json
{
  "success": false,
  "message": "Failed to sync vouchers from Tally",
  "error": "Detailed error message"
}
```

---

## Testing with cURL

### Sync Vouchers Example

```bash
curl -X POST http://localhost:5000/api/v1/voucher/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "vouchers": [
      {
        "cmpcode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
        "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
        "vchnumber": "INV-2024-001",
        "vchdate": "2024-12-30",
        "vchtype": "Sales",
        "vchpartyguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1",
        "vchamount": 59000.00,
        "vchgoodsamt": 50000.00
      }
    ]
  }'
```

### Get Vouchers Example

```bash
curl -X GET "http://localhost:5000/api/v1/voucher/list?cmpcode=732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Testing with Postman

1. **Import Collection**: Create a new Postman collection named "Voucher API"
2. **Set Environment Variables**:
   - `base_url`: `http://localhost:5000/api/v1`
   - `token`: Your JWT token
3. **Add Requests**: Create requests for each endpoint
4. **Set Authorization**: Bearer Token → `{{token}}`

---

## Swagger Documentation

Access the interactive API documentation at:

```
http://localhost:5000/api/v1/api-docs
```

Search for "Voucher" tag to find all voucher-related endpoints.

---

## Notes

1. **Bulk Processing**: You can send up to 1000 vouchers in a single request
2. **Performance**: The API processes vouchers sequentially with validation
3. **Partial Success**: Even if some vouchers fail, successful ones will be saved
4. **Idempotent**: Safe to retry - duplicate vouchers will be updated, not duplicated
5. **Ledger Linking**: Each voucher is automatically linked to its ledger via `ledgerId` field
6. **Company Linking**: Each voucher is automatically linked to its company via `companyId` field

---

## Common Issues

### Issue 1: "Company not found or inactive"
- **Cause**: The `cmpcode` doesn't exist in the system or company is inactive
- **Solution**: Verify company exists and is active in the system

### Issue 2: "Ledger/Dealer not found or inactive"
- **Cause**: The `vchpartyguid` doesn't exist or doesn't belong to the specified company
- **Solution**: Ensure ledger is synced from Tally and belongs to the correct company

### Issue 3: "Missing required fields"
- **Cause**: One or more required fields are missing
- **Solution**: Verify all required fields are present: `cmpcode`, `vchguid`, `vchnumber`, `vchdate`, `vchtype`, `vchpartyguid`, `vchamount`

---

## Support

For additional support, contact the development team or check the Swagger documentation.

