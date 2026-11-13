# Approval API Guide

Base URL: `https://royalapp.wayneesolutions.com/api/v1`

All endpoints require: `Authorization: Bearer <token>`

---

## 1. Submit Order for Approval

Moves a `draft` order into the approval workflow.

**POST** `/approvals/submit/{orderId}`

| Param | Type | Description |
|-------|------|-------------|
| orderId | path | `_id` of a draft order |

**No request body needed.**

**Response:**
```json
{
  "success": true,
  "message": "Order has been self-approved",
  "order": { ... },
  "isSelfApproved": true
}
```
> If the creator is `admin` or the highest role, the order self-approves instantly (status → `approved`).  
> Otherwise status → `pending_approval` and `nextApprover` is set.

---

## 2. Get Pending Approvals

Returns orders waiting for the **current logged-in user** to approve.

**GET** `/approvals/pending`

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Results per page |

**Response:**
```json
{
  "success": true,
  "orders": [ { "_id": "...", "status": "pending_approval", ... } ],
  "pagination": { "currentPage": 1, "totalPages": 1, "totalOrders": 5 }
}
```

---

## 3. Single Order Approve / Reject

Approve or reject **one** order. Current user must be set as `nextApprover`.

**POST** `/approvals/{orderId}/action`

**Request body:**
```json
{
  "action": "approved",
  "notes": "Looks good"
}
```

| Field | Required | Values |
|-------|----------|--------|
| action | Yes | `approved` or `rejected` |
| notes | No | Any string |

**Response:**
```json
{
  "success": true,
  "message": "Order approved successfully",
  "order": { "_id": "...", "status": "approved", ... }
}
```

---

## 4. Bulk Approve / Reject Orders ⭐ NEW

Approve or reject **multiple orders at once**. Admin can approve any pending order — does not require being the `nextApprover`.

**POST** `/approvals/bulk-action`

**Request body:**
```json
{
  "orderIds": ["6af5aef88f422ff6303678d3", "6af5aef88f422ff6303678d4"],
  "action": "approved",
  "notes": "Bulk approved by admin"
}
```

| Field | Required | Values |
|-------|----------|--------|
| orderIds | Yes | Array of order `_id` strings |
| action | Yes | `approved` or `rejected` |
| notes | No | Any string |

**Response (all success — HTTP 200):**
```json
{
  "success": true,
  "message": "Processed 2 orders: 2 succeeded, 0 failed",
  "total": 2,
  "succeeded": 2,
  "failed": 0,
  "results": [
    { "orderId": "...", "orderNumber": "ORD-001", "success": true, "status": "approved" },
    { "orderId": "...", "orderNumber": "ORD-002", "success": true, "status": "approved" }
  ]
}
```

**Response (partial success — HTTP 207):**
```json
{
  "success": true,
  "message": "Processed 2 orders: 1 succeeded, 1 failed",
  "total": 2,
  "succeeded": 1,
  "failed": 1,
  "results": [
    { "orderId": "...", "success": true, "status": "approved" },
    { "orderId": "...", "success": false, "error": "Order not found or not in pending_approval status" }
  ]
}
```

**Notes:**
- Only orders with status `pending_approval` can be bulk approved
- Already approved / cancelled orders will appear in `failed` results
- `rejected` action sets order status to `cancelled`

---

## 5. Unapprove an Order ⭐ NEW

Reverts an `approved` order back to `pending_approval`. Use when an order needs correction after it was approved.

**POST** `/approvals/{orderId}/unapprove`

| Param | Type | Description |
|-------|------|-------------|
| orderId | path | `_id` of an **approved** order |

**Request body (optional):**
```json
{
  "notes": "Returning for price correction"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Order successfully returned to pending approval",
  "order": { "_id": "...", "status": "pending_approval", ... }
}
```

**Error (order not in approved status):**
```json
{
  "success": false,
  "message": "Order not found or not in approved status"
}
```

---

## 6. Get Approval History

View the full approval trail for any order.

**GET** `/approvals/{orderId}/history`

**Response:**
```json
{
  "success": true,
  "currentStatus": "approved",
  "approvalHistory": [
    {
      "approverName": "Rajinder",
      "approverRole": "admin",
      "action": "approved",
      "notes": "Self-approved",
      "timestamp": "2026-11-12T12:16:00.000Z"
    },
    {
      "approverName": "Rajinder",
      "approverRole": "admin",
      "action": "unapproved",
      "notes": "Returning for correction",
      "timestamp": "2026-11-12T12:20:00.000Z"
    }
  ]
}
```

---

## 7. Get My Orders

Returns all orders **created by** the current logged-in user.

**GET** `/approvals/my-orders`

| Query | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 20 | Results per page |
| status | string | (all) | Filter: `draft`, `pending_approval`, `approved`, etc. |

---

## 8. Assign Existing User to Company ⭐ (Already Exists)

Link an existing user to an additional company.

**POST** `/admin/assign-user-to-company/{userId}`

**Request body:**
```json
{
  "companyId": "6a95406c72ce30f394d38fa9"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User assigned to company successfully",
  "user": { ... }
}
```

> If user is already assigned but inactive, it **reactivates** the assignment.

---

## Status Flow Reference

```
draft
  └─► pending_approval  (via /submit)
        └─► approved    (via /action or /bulk-action)
              └─► pending_approval  (via /unapprove)  ← NEW
        └─► cancelled   (via /action or /bulk-action with rejected)
approved
  └─► sent_to_tally     (Tally connector picks up)
        └─► dispatched  (Tally confirms)
        └─► approved    (Tally rejects — retry)
```

---

## Demo Company Details

| Field | Value |
|-------|-------|
| Company | Demo Application Data |
| companyId | `6a95406c72ce30f394d38fa9` |
| companyCode | `732081942-7F0CF89A-E6FC-4628-B87E-7E2D6447B3FC` |
| Swagger | https://royalapp.wayneesolutions.com/api/v1/api-docs |
