# Campus Library — Shared API Contract

**Version:** 1.0  
**Status:** Based on current implementation  
**Base URL:** `http://localhost:3000` (development)

## 1. Authentication

All six operations require an authenticated Supabase session.

- Authentication: Supabase Auth session cookie.
- User identity: Retrieved using `supabase.auth.getUser()`.
- Authorization: Role is retrieved from the `users` table.
- Suspended accounts receive `403 Forbidden`.
- Requests must be made with the authenticated session.

### Supported roles

| Role | Description |
|---|---|
| `student` | Browse resources, borrow, and reserve resources |
| `staff` | Manage circulation and perform checkout |
| `admin` | Administrative access and circulation operations |

### Common error response

```json
{
  "error": "Error message."
}
```

Some validation errors may additionally contain a `details` field.

## 2. API Operations

### 2.1 Search Resources

**GET** `/api/resources`

Search resources and retrieve their availability.

Authentication: Required  
Roles: All authenticated users

Query parameters:

| Parameter | Type | Required | Description |
|---|---|---|---|
| `q` | string | No | Search title, author, category, description |
| `category` | string | No | Filter by category |

Validation:
- `q` must not exceed 200 characters.
- Maximum 50 resources returned.
- Results ordered by title.

Success response: `200 OK`

```json
{
  "resources": [
    {
      "id": "RESOURCE_UUID",
      "title": "Introduction to Database Systems",
      "category": "Computer",
      "author": "Example Author",
      "description": "Database fundamentals",
      "available_copies": 3,
      "total_copies": 5
    }
  ],
  "total": 1
}
```

Possible errors:
- `401` Not authenticated.
- `403` Account suspended.
- `400` Invalid query or database error.
- `500` Internal server error.

### 2.2 Create Loan

**POST** `/api/loans`

Create a loan for a student.

Authentication: Required  
Roles: Student, Staff, Admin

Request body:

```json
{
  "copy_id": "COPY_UUID"
}
```

Alternatively, a student may request an available copy using:

```json
{
  "resource_id": "RESOURCE_UUID"
}
```

Staff/Admin must provide both `copy_id` and `user_id`:

```json
{
  "copy_id": "COPY_UUID",
  "user_id": "STUDENT_UUID"
}
```

Business rules:
- Student can only borrow for themselves.
- Staff/Admin can perform checkout for a student.
- Borrower must be an active student.
- University email and student identity must be valid.
- Eligibility is rechecked during borrowing.
- Only one of `copy_id` or `resource_id` may be provided.
- Maximum active loans and loan period are configurable.
- Duplicate active loans for the same resource are rejected.

Success response: `201 Created`

```json
{
  "loan": {
    "id": "LOAN_UUID",
    "copy_id": "COPY_UUID",
    "user_id": "STUDENT_UUID",
    "due_at": "2026-11-24T10:00:00.000Z"
  }
}
```

The `loan` object contains the database RPC result.

Possible errors:
- `400` Invalid request or missing required fields.
- `401` Not authenticated.
- `403` Insufficient permissions, inactive student, or ineligible student.
- `409` Copy unavailable, duplicate resource loan, or maximum active loans reached.
- `500` Internal server error.

### 2.3 Get My Loans

**GET** `/api/loans/me`

Retrieve the authenticated student's current and past loans.

Authentication: Required  
Roles: All authenticated users (returns only the caller's own loans)

Success response: `200 OK`

```json
{
  "loans": [
    {
      "id": "LOAN_UUID",
      "due_at": "2026-11-24T10:00:00.000Z",
      "returned_at": null,
      "status": "active",
      "copy_id": "COPY_UUID"
    }
  ]
}
```

Results are ordered by `borrowed_at` descending.

Possible errors:
- `401` Not authenticated.
- `403` Account suspended.
- `400` Database error.
- `500` Internal server error.

### 2.4 Return Loan

**PATCH** `/api/loans/{id}/return`

Return a borrowed copy.

Authentication: Required  
Roles: Staff, Admin

Path parameters:

| Parameter | Type | Description |
|---|---|---|
| `id` | UUID | Loan ID |

Request body: None.

Business rules:
- Uses an atomic database operation.
- Prevents returning an already returned loan.
- Updates the copy status.
- Promotes the next reservation in the queue when applicable.

Success response: `200 OK`

```json
{
  "loan": {
    "id": "LOAN_UUID",
    "returned_at": "2026-11-10T10:00:00.000Z"
  },
  "reservation": {
    "id": "RESERVATION_UUID",
    "user_id": "STUDENT_UUID",
    "expires_at": "2026-11-12T10:00:00.000Z"
  }
}
```

If no reservation is promoted:

```json
{
  "loan": {
    "id": "LOAN_UUID",
    "returned_at": "2026-11-10T10:00:00.000Z"
  },
  "reservation": null
}
```

Possible errors:
- `401` Not authenticated.
- `403` Insufficient permissions.
- `404` Loan not found.
- `409` Loan already returned or copy unavailable.
- `500` Internal server error.

### 2.5 Create Reservation

**POST** `/api/reservations`

Create a reservation for an unavailable resource.

Authentication: Required  
Roles: Student

Request body:

```json
{
  "resource_id": "RESOURCE_UUID"
}
```

Business rules:
- Only students can create reservations.
- Reservation is allowed only when no copy is available.
- Duplicate active loans for the same resource are rejected.
- Duplicate active reservations are rejected.
- Reservation queue follows FIFO order.
- Eligibility is checked during checkout, not reservation creation.

Success response: `201 Created`

```json
{
  "reservation": {
    "id": "RESERVATION_UUID",
    "resource_id": "RESOURCE_UUID",
    "user_id": "STUDENT_UUID",
    "status": "pending",
    "created_at": "2026-11-10T10:00:00.000Z"
  }
}
```

The `reservation` object contains the database RPC result.

Possible errors:
- `400` Invalid input.
- `401` Not authenticated.
- `403` Insufficient permissions or suspended account.
- `404` Resource not found.
- `409` Copy available, duplicate loan, or already reserved.
- `500` Internal server error.

### 2.6 Checkout Reservation

**POST** `/api/reservations/{id}/checkout`

Complete pickup of a ready reservation and create a loan.

Authentication: Required  
Roles: Staff, Admin

Path parameters:

| Parameter | Type | Description |
|---|---|---|
| `id` | UUID | Reservation ID |

Request body:

```json
{
  "user_id": "STUDENT_UUID"
}
```

Business rules:
- Only staff/admin can complete checkout.
- Reservation must belong to the specified student.
- Reservation must be ready and not expired.
- Assigned copy must be held.
- Student account and eligibility are rechecked.
- Duplicate active loans are rejected.
- Loan creation and reservation fulfillment are atomic.

Success response: `201 Created`

```json
{
  "loan": {
    "id": "LOAN_UUID",
    "copy_id": "COPY_UUID",
    "user_id": "STUDENT_UUID",
    "due_at": "2026-11-24T10:00:00.000Z"
  }
}
```

The `loan` object contains the database RPC result.

Possible errors:
- `400` Invalid checkout information.
- `401` Not authenticated.
- `403` Insufficient permissions, wrong student, or ineligible student.
- `404` Reservation not found.
- `409` Reservation not ready, expired, copy unavailable, duplicate loan, or maximum active loans reached.
- `500` Internal server error.

## 3. Business Rules Summary

| Rule | Description |
|---|---|
| Loan period | Configurable; default 14 days |
| Maximum active loans | Configurable; default 5 |
| Reservation queue | FIFO |
| Reservation hold | 48 hours after ready |
| Eligibility verification | At borrow and reservation checkout |
| Duplicate active loan | One active loan per student per resource |
| Reservation availability | Cannot reserve when a copy is available |
| Atomic operations | Borrow, return, reservation creation, reservation checkout |

## 4. Integration Notes

- All endpoints return JSON.
- UUIDs identify resources, copies, users, loans, and reservations.
- Timestamps use ISO 8601 format.
- The server uses a Supabase service-role client internally for atomic database operations. The service-role key must never be exposed to clients.
- External integrations should not attempt to call user-session endpoints without an authenticated user session.
- The catalog integration endpoint is separate from these six user-facing operations.

## 5. Current Contract Limitations

This document describes the current implementation. It is not yet a formally generated OpenAPI specification.

Before external team integration, confirm:
1. Exact database RPC response fields for loan and reservation objects.
2. Consistent error response structures across all endpoints.
3. Production base URL and deployment environment.
4. Session-sharing or server-to-server authentication requirements for external teams.

