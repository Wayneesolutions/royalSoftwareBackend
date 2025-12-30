# ✅ Ledger Entries API - Complete Guide

## 📋 Overview

The Ledger Entries API creates the connection between **Vouchers**, **Ledgers**, and **Companies**. This is essential for accounting as it tracks which ledgers are affected by each voucher transaction.

---

## 🔗 Relationships

```
Company ←→ Voucher ←→ Ledger Entry ←→ Ledger
```

**Example:**
- A Sales Voucher (INV-001) for ₹10,000
- Has 2 Ledger Entries:
  1. Customer Account (Debit) = ₹10,000
  2. Sales Account (Credit) = -₹10,000

---

## 📊 Database Schema

```javascript
LedgerEntries {
  // Company (REQUIRED)
  cmpcode: String (indexed)
  companyId: ObjectId → Company
  
  // Voucher (REQUIRED)
  vchguid: String (indexed)
  voucherId: ObjectId → VoucherMaster
  
  // Ledger (REQUIRED)
  ledgerguid: String (indexed)
  ledgerId: ObjectId → Ledger
  
  // Amount (REQUIRED)
  ledgeramount: Number
  
  // Custom Fields
  other1-5: String
  
  // Status
  isActive: Boolean
  
  // Audit
  createdAt, updatedAt, syncedAt: Date
}
```

**Unique Constraint:** One entry per `(vchguid + ledgerguid + cmpcode)` combination

---

## 🚀 API Endpoints

### 1. Sync Ledger Entries (POST)

**Endpoint:** `POST /api/v1/ledger-entries/sync`

**Authentication:** ❌ Not Required (Tally integration)

**Request Body:**
```json
{
  "entries": [
    {
      "cmpcode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
      "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
      "ledgerguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1",
      "ledgeramount": 10000.00,
      "other1": "Debit",
      "other2": "Customer Account",
      "other3": "Invoice Payment",
      "other4": "Q4 2024"
    },
    {
      "cmpcode": "732081942-901A1BD7-AB66-4F91-92B0-B6F9EDD9FDDC",
      "vchguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234",
      "ledgerguid": "901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a2",
      "ledgeramount": -10000.00,
      "other1": "Credit",
      "other2": "Sales Account",
      "other3": "Invoice Payment",
      "other4": "Q4 2024"
    }
  ]
}
```

**Required Fields:**
- `cmpcode` - Company code (must exist)
- `vchguid` - Voucher GUID (must exist)
- `ledgerguid` - Ledger GUID (must exist)
- `ledgeramount` - Amount (positive or negative)

**Response (Success):**
```json
{
  "success": true,
  "message": "Ledger entries sync completed. Success: 2, Failed: 0",
  "data": {
    "success": [
      {
        "index": 0,
        "vchguid": "...",
        "ledgerguid": "...",
        "action": "Created",
        "voucherNumber": "INV-001",
        "ledgerName": "Customer Account",
        "amount": 10000.00
      },
      {
        "index": 1,
        "vchguid": "...",
        "ledgerguid": "...",
        "action": "Created",
        "voucherNumber": "INV-001",
        "ledgerName": "Sales Account",
        "amount": -10000.00
      }
    ],
    "failed": [],
    "totalProcessed": 2,
    "totalSuccess": 2,
    "totalFailed": 0
  }
}
```

**Response (Partial Failure):**
```json
{
  "success": true,
  "message": "Ledger entries sync completed. Success: 1, Failed: 1",
  "data": {
    "success": [...],
    "failed": [
      {
        "index": 1,
        "vchguid": "...",
        "ledgerguid": "...",
        "error": "Voucher not found or inactive for vchguid: ... in company: ..."
      }
    ],
    "totalProcessed": 2,
    "totalSuccess": 1,
    "totalFailed": 1
  }
}
```

---

### 2. Get Ledger Entries List (GET)

**Endpoint:** `GET /api/v1/ledger-entries/list`

**Authentication:** ❌ Not Required

**Query Parameters:**
- `cmpcode` (required) - Company code
- `vchguid` (optional) - Filter by voucher
- `ledgerguid` (optional) - Filter by ledger
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 50) - Items per page

**Example Request:**
```
GET /api/v1/ledger-entries/list?cmpcode=645645&page=1&limit=10
```

**Response:**
```json
{
  "success": true,
  "message": "Ledger entries fetched successfully",
  "data": {
    "entries": [
      {
        "_id": "...",
        "cmpcode": "645645",
        "vchguid": "...",
        "ledgerguid": "...",
        "ledgeramount": 10000.00,
        "other1": "Debit",
        "ledgerId": {
          "LedgerName": "Customer Account",
          "LedgerMobile": "9876543210",
          "Email": "customer@example.com"
        },
        "voucherId": {
          "vchnumber": "INV-001",
          "vchtype": "Sales",
          "vchdate": "2024-12-30",
          "vchamount": 10000.00
        },
        "companyId": {
          "companyName": "Royal Enterprises",
          "companyCode": "645645"
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

### 3. Get Ledger Entries by Voucher (GET)

**Endpoint:** `GET /api/v1/ledger-entries/by-voucher/:vchguid`

**Authentication:** ❌ Not Required

**Query Parameters:**
- `cmpcode` (required) - Company code

**Example Request:**
```
GET /api/v1/ledger-entries/by-voucher/901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-00001234?cmpcode=645645
```

**Response:**
```json
{
  "success": true,
  "message": "Ledger entries fetched successfully",
  "data": {
    "entries": [
      {
        "_id": "...",
        "ledgerguid": "...",
        "ledgeramount": 10000.00,
        "other1": "Debit",
        "ledgerId": {
          "LedgerName": "Customer Account",
          "LedgerMobile": "9876543210",
          "Email": "customer@example.com",
          "LedgerGSTIN": "03AABCU9603R1ZM"
        }
      },
      {
        "_id": "...",
        "ledgerguid": "...",
        "ledgeramount": -10000.00,
        "other1": "Credit",
        "ledgerId": {
          "LedgerName": "Sales Account"
        }
      }
    ],
    "summary": {
      "totalEntries": 2,
      "totalAmount": 0
    }
  }
}
```

**Note:** `totalAmount` should be 0 for balanced vouchers (debits = credits)

---

### 4. Get Ledger Entries by Ledger (GET)

**Endpoint:** `GET /api/v1/ledger-entries/by-ledger/:ledgerguid`

**Authentication:** ❌ Not Required

**Query Parameters:**
- `cmpcode` (required) - Company code

**Example Request:**
```
GET /api/v1/ledger-entries/by-ledger/901a1bd7-ab66-4f91-92b0-b6f9edd9fddc-000000a1?cmpcode=645645
```

**Response:**
```json
{
  "success": true,
  "message": "Ledger entries fetched successfully",
  "data": {
    "entries": [
      {
        "_id": "...",
        "vchguid": "...",
        "ledgeramount": 10000.00,
        "voucherId": {
          "vchnumber": "INV-001",
          "vchtype": "Sales",
          "vchdate": "2024-12-30",
          "vchamount": 10000.00,
          "vchpartyname": "ABC Traders"
        }
      },
      {
        "_id": "...",
        "vchguid": "...",
        "ledgeramount": -5000.00,
        "voucherId": {
          "vchnumber": "PMT-001",
          "vchtype": "Payment",
          "vchdate": "2024-12-29",
          "vchamount": 5000.00
        }
      }
    ],
    "summary": {
      "totalEntries": 2,
      "totalAmount": 5000.00
    }
  }
}
```

**Note:** `totalAmount` shows net balance for this ledger

---

### 5. Delete Ledger Entry (DELETE)

**Endpoint:** `DELETE /api/v1/ledger-entries/:id`

**Authentication:** ✅ Required (Admin/Super Admin)

**Query Parameters:**
- `cmpcode` (required) - Company code

**Example Request:**
```
DELETE /api/v1/ledger-entries/67730a1101705973ec495123?cmpcode=645645
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Ledger entry deleted successfully"
}
```

---

## 🔍 Validation Flow

```
1. Receive ledger entry data
    ↓
2. Validate required fields (cmpcode, vchguid, ledgerguid, ledgeramount)
    ↓
3. Check if company exists (by cmpcode)
    ↓
4. Check if voucher exists (by vchguid in that company)
    ↓
5. Check if ledger exists (by ledgerguid in that company)
    ↓
6. Check if entry already exists (by vchguid + ledgerguid + cmpcode)
    ↓
7. If exists → UPDATE | If not → CREATE
    ↓
8. Link: companyId, voucherId, ledgerId
    ↓
9. Return success/failure result
```

---

## 🧪 Testing Guide

### **Test 1: Sync Single Entry**

**cURL:**
```bash
curl -X POST http://localhost:5000/api/v1/ledger-entries/sync \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "cmpcode": "645645",
        "vchguid": "YOUR_VOUCHER_GUID",
        "ledgerguid": "YOUR_LEDGER_GUID",
        "ledgeramount": 10000.00,
        "other1": "Debit"
      }
    ]
  }'
```

### **Test 2: Sync Balanced Entry (Debit + Credit)**

```bash
curl -X POST http://localhost:5000/api/v1/ledger-entries/sync \
  -H "Content-Type: application/json" \
  -d '{
    "entries": [
      {
        "cmpcode": "645645",
        "vchguid": "VOUCHER_001",
        "ledgerguid": "LEDGER_CUSTOMER",
        "ledgeramount": 10000.00,
        "other1": "Debit"
      },
      {
        "cmpcode": "645645",
        "vchguid": "VOUCHER_001",
        "ledgerguid": "LEDGER_SALES",
        "ledgeramount": -10000.00,
        "other1": "Credit"
      }
    ]
  }'
```

### **Test 3: Get All Entries for a Voucher**

```bash
curl -X GET "http://localhost:5000/api/v1/ledger-entries/by-voucher/VOUCHER_001?cmpcode=645645"
```

### **Test 4: Get All Entries for a Ledger**

```bash
curl -X GET "http://localhost:5000/api/v1/ledger-entries/by-ledger/LEDGER_CUSTOMER?cmpcode=645645"
```

---

## 📋 Common Use Cases

### **Use Case 1: Sales Invoice**
```json
{
  "entries": [
    {
      "cmpcode": "645645",
      "vchguid": "SALES-001",
      "ledgerguid": "CUSTOMER-A",
      "ledgeramount": 11800.00,
      "other1": "Debit",
      "other2": "Customer Account",
      "other3": "Sales Invoice",
      "other4": "Q4 2024"
    },
    {
      "cmpcode": "645645",
      "vchguid": "SALES-001",
      "ledgerguid": "SALES-ACCOUNT",
      "ledgeramount": -10000.00,
      "other1": "Credit",
      "other2": "Sales",
      "other3": "Revenue",
      "other4": "Q4 2024"
    },
    {
      "cmpcode": "645645",
      "vchguid": "SALES-001",
      "ledgerguid": "GST-OUTPUT",
      "ledgeramount": -1800.00,
      "other1": "Credit",
      "other2": "GST 18%",
      "other3": "Tax Liability",
      "other4": "Q4 2024"
    }
  ]
}
```

### **Use Case 2: Payment Receipt**
```json
{
  "entries": [
    {
      "cmpcode": "645645",
      "vchguid": "RCPT-001",
      "ledgerguid": "BANK-ACCOUNT",
      "ledgeramount": 5000.00,
      "other1": "Debit",
      "other2": "Cash/Bank"
    },
    {
      "cmpcode": "645645",
      "vchguid": "RCPT-001",
      "ledgerguid": "CUSTOMER-A",
      "ledgeramount": -5000.00,
      "other1": "Credit",
      "other2": "Customer Payment"
    }
  ]
}
```

---

## ⚠️ Important Notes

1. **Balanced Entries:** For proper accounting, total debits should equal total credits
2. **Positive/Negative Amounts:** Use positive for debits, negative for credits
3. **Idempotent:** Same entry sent twice will update, not create duplicate
4. **Bulk Processing:** Can send up to 1000 entries in one request
5. **No Authentication:** Designed for Tally to send data automatically
6. **Relationships:** All three (company, voucher, ledger) must exist before creating entry

---

## 🔗 Integration with Other APIs

### **Step 1: Create/Sync Voucher**
```
POST /api/v1/voucher/sync
```

### **Step 2: Create/Sync Ledger Entries**
```
POST /api/v1/ledger-entries/sync
```

### **Step 3: View Entries**
```
GET /api/v1/ledger-entries/by-voucher/:vchguid
```

---

## 🚨 Error Handling

### **Error 1: Company Not Found**
```json
{
  "success": true,
  "data": {
    "failed": [
      {
        "error": "Company not found or inactive for cmpcode: INVALID_CODE"
      }
    ]
  }
}
```

### **Error 2: Voucher Not Found**
```json
{
  "success": true,
  "data": {
    "failed": [
      {
        "error": "Voucher not found or inactive for vchguid: ... in company: ..."
      }
    ]
  }
}
```

### **Error 3: Ledger Not Found**
```json
{
  "success": true,
  "data": {
    "failed": [
      {
        "error": "Ledger not found or inactive for ledgerguid: ... in company: ..."
      }
    ]
  }
}
```

---

## 📊 Swagger Documentation

Access interactive API documentation at:
```
http://localhost:5000/api-docs
```

Search for **"LedgerEntries"** tag.

---

## ✅ Testing Checklist

- [ ] POST /api/v1/ledger-entries/sync works without authentication
- [ ] Company validation works (rejects invalid cmpcode)
- [ ] Voucher validation works (rejects invalid vchguid)
- [ ] Ledger validation works (rejects invalid ledgerguid)
- [ ] Bulk sync works (multiple entries)
- [ ] Update works (duplicate entry updates instead of error)
- [ ] GET /api/v1/ledger-entries/list returns entries
- [ ] GET /api/v1/ledger-entries/by-voucher/:vchguid returns entries
- [ ] GET /api/v1/ledger-entries/by-ledger/:ledgerguid returns entries
- [ ] DELETE requires authentication
- [ ] Swagger documentation accessible

---

**All endpoints are ready for Tally integration! 🎉**

