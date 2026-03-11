# Tally ERP Integration — API Documentation (Simplified)

This document is a **clean, easy-to-scan** reference for **only Tally APIs** in Royal Software Backend.

## Base URL

`/api/v1/tally`

---

## Conventions (Read this once)

### Content-Type
- **JSON**: `Content-Type: application/json`
- **XML (optional)**: Some Tally integrations may send XML (`text/xml`). If your deployment supports XML-to-JSON conversion, payload fields should map to the JSON shapes below.

### Single vs Batch
Most “sync/upsert/update/delete” APIs accept:
- **Single payload**: `{ ... }`
- **Batch payload**: `[ { ... }, { ... } ]`

### Standard “batch results” response shape
Many endpoints respond like:

```json
{
  "success": true,
  "results": [
    {
      "success": true,
      "message": "optional",
      "error": "optional",
      "data": {}
    }
  ]
}
```

### Status codes
- **200**: all operations successful
- **207**: partial success (some records failed)
- **400**: validation error / all failed
- **404**: required resource not found (company, voucher, ledger, etc.)
- **500**: server error

---

## Quick Index (Tally Endpoints)

### Outstanding
- `POST /outstanding/sync`
- `GET  /outstanding/group-user?cmpcode=&userId=`
- `GET  /outstanding/{outstandingId}/details?cmpcode=` (or use `vchguid` query param)

### Sales
- `POST /sales/sync`
- `GET  /sales/group-user?cmpcode=&userId=`

### Stock
- `POST /stock/sync`
- `GET  /stock/group-user?cmpcode=`

### Combined Voucher APIs
- `GET  /vouchers/{vchguid}/details?cmpcode=`
- `POST /vouchers/sync-complete`

### Master Data (Tally → Royal Software)
- **Companies**: `POST /companies`, `PATCH /companies`, `GET /companies`, `GET /companies/search`, `DELETE /companies/delete`
- **Products**: `POST /products`, `PATCH /products`, `GET /companies/:guid/products`, `GET /companies/:guid/products/search`, `DELETE /companies/:guid/products`
- **Users**: `POST /users`, `PATCH|PUT /users/update`, `GET /companies/:guid/users`, `DELETE /users/delete` (and some path variants)
- **Groups**: `POST /groups`, `PATCH /groups`, `GET /groups/search`, `GET /companies/:guid/groups`, `GET /groups/:groupGuid/users`, `DELETE /groups/delete`
- **Dealers (Ledgers)**: `POST /dealers`, `GET /dealers/:guid`, `PUT /dealers/update`, `DELETE /dealers/delete`
- **SubDealers**: `POST /subdealers`, `GET /subdealers/:guid`, `PUT /subdealers/update`, `DELETE /subdealers/delete`
- **Orders (Royal → Tally)**: `GET /companies/:guid/orders/approved`, `GET /companies/:guid/orders/unapproved`

> Note: Paths above are shown **without** the base prefix. Example: `POST /outstanding/sync` means `POST /api/v1/tally/outstanding/sync`.

---

## Outstanding APIs

### 1) Sync Outstanding Entries
**POST** `/outstanding/sync`

Creates or updates outstanding entries received from Tally.

#### Required fields
- `cmpcode` (string)
- `ledgerguid` (string)
- `vchguid` (string)
- `outstandingAmount` (number)

#### Request (single)
```json
{
  "cmpcode": "ROYAL01",
  "ledgerguid": "LEDGER-GUID-001",
  "vchguid": "VCH-GUID-001",
  "vchnumber": "INV-001",
  "vchdate": "2026-01-02",
  "totalAmount": 59000,
  "paidAmount": 10000,
  "outstandingAmount": 49000,
  "dueDate": "2026-02-01",
  "paymentTerms": "30_days",
  "paymentDays": 30,
  "status": "pending",
  "riskLevel": "low",
  "currency": "INR"
}
```

#### Request (batch)
```json
[
  {
    "cmpcode": "ROYAL01",
    "ledgerguid": "LEDGER-GUID-001",
    "vchguid": "VCH-GUID-001",
    "outstandingAmount": 49000
  },
  {
    "cmpcode": "ROYAL01",
    "ledgerguid": "LEDGER-GUID-002",
    "vchguid": "VCH-GUID-002",
    "outstandingAmount": 25000
  }
]
```

#### Response (example)
```json
{
  "success": true,
  "message": "Outstanding sync completed: 2 succeeded, 0 failed",
  "results": [
    {
      "success": true,
      "message": "Outstanding entry created/updated successfully",
      "outstandingId": "OUT-2026-001",
      "outstandingAmount": 49000,
      "status": "pending"
    }
  ]
}
```

---

### 2) Get Outstanding for Group User
**GET** `/outstanding/group-user?cmpcode={cmpcode}&userId={userId}`

Returns outstanding data for a **group user**, including:
- own dealers/ledgers
- child group dealers/ledgers
- admin-assigned dealers (if configured)
- user-created dealers (if configured)

#### Query params
- `cmpcode` (required, string)
- `userId` (required, string)

#### Response (example)
```json
{
  "success": true,
  "message": "Outstanding data fetched successfully for group user",
  "data": {
    "LEDGER_GROUPS": [
      {
        "id": "1",
        "name": "ABC Traders",
        "outstanding": 330400,
        "invoiceCount": 2,
        "overdueDays": 214,
        "lastActivity": "30 May 25"
      }
    ],
    "BILLS_DATA": {
      "1": [
        {
          "id": "1",
          "date": "26 May 25",
          "voucherNo": "INV-001",
          "amount": 118000,
          "dueDate": "05 Jun 25",
          "overdueDays": 214,
          "items": "Samsung 12 laptop (10 PC)"
        }
      ]
    },
    "summary": {
      "totalLedgers": 1,
      "totalOutstanding": 330400,
      "totalInvoices": 2
    }
  }
}
```

---

### 3) Get Outstanding Details (with Voucher + Ledger + Inventory Entries)
**GET** `/outstanding/{outstandingId}/details?cmpcode={cmpcode}`

Alternative lookup:
**GET** `/outstanding/{outstandingId}/details?cmpcode={cmpcode}&vchguid={vchguid}`

#### Query params
- `cmpcode` (required, string)
- `vchguid` (optional, string)

#### Response (example)
```json
{
  "success": true,
  "message": "Outstanding details with invoice information fetched successfully",
  "data": {
    "outstanding": { "_id": "507f...", "outstandingId": "OUT-2026-001", "vchguid": "VCH-GUID-001" },
    "voucher": { "_id": "507f...", "vchguid": "VCH-GUID-001", "vchnumber": "INV-001" },
    "ledgerEntries": { "entries": [], "summary": { "totalEntries": 2, "totalAmount": 0 } },
    "inventoryEntries": { "entries": [], "summary": { "totalEntries": 2, "totalQuantity": 15, "totalAmount": 2000 } }
  }
}
```

---

## Sales APIs

### 1) Sync Sales Data
**POST** `/sales/sync`

Creates or updates sales entries from Tally. Supports single or batch.

#### Required fields
- `cmpcode` (string)
- `vchguid` (string)
- `ledgerguid` (string)
- `itemguid` (string)
- `quantity` (number)
- `rate` (number)
- `amount` (number)

#### Request (single)
```json
{
  "cmpcode": "ROYAL01",
  "vchguid": "VCH-GUID-001",
  "vchnumber": "INV-001",
  "vchdate": "2026-01-02",
  "vchtype": "Sales",
  "ledgerguid": "LEDGER-GUID-001",
  "ledgername": "ABC Traders",
  "itemguid": "ITEM-001",
  "itemname": "Samsung 12 Laptop",
  "itemsku": "SAM-LP-12",
  "itemcategory": "Laptops",
  "quantity": 10,
  "unit": "PCS",
  "rate": 55000,
  "amount": 550000,
  "paymentMode": "Credit",
  "status": "Completed",
  "remarks": "Payment pending"
}
```

#### Response (example)
```json
{
  "success": true,
  "message": "Sales sync completed: 2 succeeded, 0 failed",
  "data": { "total": 2, "success": 2, "failed": 0, "errors": [] }
}
```

---

### 2) Get Sales Summary for Group User
**GET** `/sales/group-user?cmpcode={cmpcode}&userId={userId}`

#### Query params
- `cmpcode` (required, string)
- `userId` (required, string)

#### Response (example)
```json
{
  "success": true,
  "data": {
    "SALES_SUMMARY": [
      {
        "id": "ITEM-001",
        "stockName": "Samsung 12 Laptop",
        "sku": "SAM-LP-12",
        "category": "Laptops",
        "totalQuantitySold": 40,
        "totalAmount": 2200000,
        "averageRate": 55000,
        "transactionCount": 2,
        "lastSaleDate": "02 Jan 26",
        "trend": "up",
        "status": "Top Seller"
      }
    ],
    "TRANSACTION_REGISTER": {
      "ITEM-001": [
        {
          "id": "TXN-001",
          "date": "02 Jan 26",
          "subDealer": "Sharma Electronics",
          "location": "Delhi NCR",
          "quantity": 15,
          "rate": 55000,
          "amount": 825000,
          "status": "Completed",
          "invoiceNo": "INV-2026-001",
          "paymentMode": "Credit"
        }
      ]
    },
    "summary": { "totalSales": 400, "totalRevenue": 22000000, "totalTransactions": 10 }
  }
}
```

---

## Stock APIs

### 1) Sync Stock Data
**POST** `/stock/sync`

Creates or updates product stock using `itemguid`. Supports single or batch.

#### Required fields
- `cmpcode` (string)
- `itemguid` (string)

#### Request (single)
```json
{
  "cmpcode": "ROYAL01",
  "itemguid": "ITEM-001",
  "itemname": "Samsung 12 Laptop",
  "itemsku": "SAM-LP-12",
  "itemcategory": "Laptops",
  "currentStock": 45,
  "openingBalance": 50,
  "stdSaleRate": 55000,
  "stdPurcRate": 50000
}
```

#### Response (example)
```json
{
  "success": true,
  "message": "Stock synchronization complete",
  "results": [
    { "success": true, "message": "Stock synced successfully", "productId": "507f...", "itemguid": "ITEM-001" }
  ]
}
```

---

### 2) Get Stock Summary for Group User
**GET** `/stock/group-user?cmpcode={cmpcode}`

Returns stock summary for all products in the company (not ledger-filtered).

#### Query params
- `cmpcode` (required, string)

#### Response (example)
```json
{
  "success": true,
  "data": {
    "STOCK_SUMMARY": [
      {
        "id": "ITEM-001",
        "productName": "Samsung 12 Laptop",
        "sku": "SAM-LP-12",
        "category": "Laptops",
        "inHand": 45,
        "subDealerSold": 120,
        "lastSaleDate": "02 Jan 26",
        "trend": "up",
        "status": "Healthy"
      }
    ],
    "SALES_REGISTER": {
      "ITEM-001": [
        {
          "id": "SR-001",
          "date": "02 Jan 26",
          "subDealer": "Sharma Electronics",
          "location": "Delhi NCR",
          "quantity": 15,
          "amount": "₹ 8,25,000",
          "status": "Delivered",
          "invoiceNo": "INV-2026-001"
        }
      ]
    },
    "summary": { "totalSales": 500, "totalStock": 282, "lowStockCount": 2 }
  }
}
```

---

## Combined Voucher APIs (Voucher + Ledger Entries + Inventory Entries)

### 1) Get Voucher with Entries (Combined)
**GET** `/vouchers/{vchguid}/details?cmpcode={cmpcode}`

#### Path params
- `vchguid` (required, string)

#### Query params
- `cmpcode` (required, string)

#### Response (example)
```json
{
  "success": true,
  "message": "Voucher details with entries fetched successfully",
  "data": {
    "voucher": { "_id": "507f...", "vchguid": "VCH-GUID-001", "vchnumber": "INV-001" },
    "ledgerEntries": { "entries": [], "summary": { "totalEntries": 2, "totalAmount": 0 } },
    "inventoryEntries": { "entries": [], "summary": { "totalEntries": 2, "totalQuantity": 15, "totalAmount": 2000 } }
  }
}
```

---

### 2) Sync Complete Voucher (Single Call)
**POST** `/vouchers/sync-complete`

Syncs:
- `voucher` (voucher master)
- `ledgerEntries[]`
- `inventoryEntries[]`

#### Request (example)
```json
{
  "voucher": {
    "cmpcode": "ROYAL01",
    "vchguid": "VCH-GUID-001",
    "vchnumber": "INV-001",
    "vchdate": "2026-01-02",
    "vchtype": "Sales",
    "vchpartyguid": "LEDGER-GUID-001",
    "vchpartyname": "ABC Traders",
    "vchamount": 59000
  },
  "ledgerEntries": [
    { "cmpcode": "ROYAL01", "vchguid": "VCH-GUID-001", "ledgerguid": "LEDGER-GUID-001", "ledgeramount": 10000, "other1": "Debit" },
    { "cmpcode": "ROYAL01", "vchguid": "VCH-GUID-001", "ledgerguid": "LEDGER-GUID-002", "ledgeramount": -10000, "other1": "Credit" }
  ],
  "inventoryEntries": [
    { "cmpcode": "ROYAL01", "vchguid": "VCH-GUID-001", "itemguid": "ITEM-001", "itemmainqty": 10, "itemmainunit": "PCS", "itemrate": 100, "itemamount": 1000 }
  ]
}
```

#### Response (example)
```json
{
  "success": true,
  "message": "Voucher sync completed. Voucher: Created, Ledger Entries: 2/2, Inventory Entries: 1/1",
  "data": {
    "voucher": { "success": true, "action": "Created", "error": null, "data": { "_id": "507f...", "vchguid": "VCH-GUID-001" } },
    "ledgerEntries": { "success": [], "failed": [], "totalProcessed": 2, "totalSuccess": 2, "totalFailed": 0 },
    "inventoryEntries": { "success": [], "failed": [], "totalProcessed": 1, "totalSuccess": 1, "totalFailed": 0 }
  }
}
```

---

## Master Data APIs (Tally → Royal Software)

These endpoints are typically used to **sync master data** from Tally into Royal Software.

### Companies
#### Create Company
**POST** `/companies`

```json
{
  "guid": "ABC12345",
  "companyCode": "ROYAL01",
  "companyName": "Royal Paints Pvt Ltd",
  "companyEmail": "info@royalpaints.com",
  "companyMobile": "+919876543210",
  "companyState": "Karnataka",
  "companyCountry": "India",
  "maxUser": 100
}
```

#### Update Company (single or batch)
**PATCH** `/companies`

```json
{ "guid": "ABC12345", "companyName": "Updated Company Name" }
```

#### List Companies
**GET** `/companies`

#### Search Companies
**GET** `/companies/search?query=Royal&limit=10`

#### Delete Company (single or batch)
**DELETE** `/companies/delete`

```json
{ "guid": "ABC12345" }
```

---

### Products
#### Create/Update Product (Upsert)
**POST** `/products`

```json
{
  "companyGuid": "ABC12345",
  "productCode": "PROD001",
  "productName": "Premium Paint 5L",
  "stock": 100,
  "stdSaleRate": 1500.5,
  "stdPurcRate": 1200
}
```

#### Update Product
**PATCH** `/products`

```json
{ "companyGuid": "ABC12345", "productCode": "PROD001", "stock": 150 }
```

#### List Products by Company
**GET** `/companies/:guid/products`

#### Search Products by Company
**GET** `/companies/:guid/products/search?query=Paint&limit=20`

#### Delete Product(s) by Company
**DELETE** `/companies/:guid/products`

```json
{ "productCode": "PROD001" }
```

---

### Users
#### Create/Update User (Upsert)
**POST** `/users`

```json
{
  "companyGuid": "ABC12345",
  "name": "John Doe",
  "email": "john.doe@example.com",
  "userName": "johndoe",
  "password": "SecurePassword123",
  "mobile": "+919876543210",
  "isActive": true
}
```

> Note: Role is set by the system (commonly `groupuser`) for Tally-synced users.

#### Update User (existing only)
**PATCH** `/users/update` (also `PUT` supported in some routes)

```json
{ "companyGuid": "ABC12345", "email": "john.doe@example.com", "mobile": "+919876543211" }
```

#### List Users by Company
**GET** `/companies/:guid/users`

#### Delete User(s)
**DELETE** `/users/delete`

```json
{ "companyGuid": "ABC12345", "email": "john.doe@example.com" }
```

---

### Groups
#### Create/Update Group (Upsert)
**POST** `/groups`

```json
{ "GroupGUID": "GRP001", "GroupName": "Sales Team", "companyGuid": "ABC12345", "GroupParent": null }
```

#### Update Group
**PATCH** `/groups`

```json
{ "GroupGUID": "GRP001", "companyGuid": "ABC12345", "GroupName": "Updated Sales Team" }
```

#### Search Groups
**GET** `/groups/search?query=Sales&limit=20`

#### List Groups by Company
**GET** `/companies/:guid/groups`

#### List Users by Group
**GET** `/groups/:groupGuid/users`

#### Delete Group(s)
**DELETE** `/groups/delete`

```json
{ "GroupGUID": "GRP001" }
```

---

### Dealers (Ledgers)
#### Create/Update Dealer (Upsert)
**POST** `/dealers`

```json
{
  "companyGuid": "ABC12345",
  "LedgerGUID": "LED-001",
  "LedgerName": "ABC Distributors",
  "LedgerMobile": "+919876543210",
  "Email": "abc@distributors.com",
  "groupGUID": "GRP001",
  "isActive": true
}
```

#### List Dealers by Company
**GET** `/dealers/:guid`

#### Update Dealer
**PUT** `/dealers/update`

```json
{ "companyGuid": "ABC12345", "LedgerGUID": "LED-001", "isActive": true }
```

#### Delete Dealer(s)
**DELETE** `/dealers/delete`

```json
{ "companyGuid": "ABC12345", "LedgerGUID": "LED-001" }
```

---

### SubDealers
#### Create/Update SubDealer (Upsert)
**POST** `/subdealers`

```json
{
  "companyGuid": "ABC12345",
  "SDName": "XYZ Sub Distributors",
  "SDType": "Sub Dealer",
  "ledgerGUID": "LED-001",
  "groupGUID": "GRP001",
  "isActive": true
}
```

#### List SubDealers by Company
**GET** `/subdealers/:guid`

#### Update SubDealer
**PUT** `/subdealers/update`

```json
{ "companyGuid": "ABC12345", "SDName": "XYZ Sub Distributors", "isActive": true }
```

#### Delete SubDealer(s)
**DELETE** `/subdealers/delete`

```json
{ "companyGuid": "ABC12345", "SDName": "XYZ Sub Distributors" }
```

---

### Orders (Royal Software → Tally Export)
#### List Approved Orders
**GET** `/companies/:guid/orders/approved`

#### List Unapproved Orders
**GET** `/companies/:guid/orders/unapproved`

---

## Standard Error Responses

### 400 (Validation)
```json
{ "success": false, "message": "Validation error", "error": "Missing required field: cmpcode" }
```

### 404 (Not found)
```json
{ "success": false, "message": "Resource not found", "error": "Company not found for cmpcode: ROYAL01" }
```

### 500 (Server)
```json
{ "success": false, "message": "Server error", "error": "Internal server error occurred" }
```


