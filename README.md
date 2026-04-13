# Finlysis

A NestJS backend for personal finance management. Supports multi-bank account connections, transaction imports (CSV / OFX / PDF / API), spending categorization, analytics snapshots, and a full audit trail.

---

## Tech Stack

- **Framework:** NestJS (TypeScript)
- **ORM:** Prisma 7
- **Database:** MySQL / MariaDB
- **Auth:** JWT (access + refresh tokens), bcryptjs password hashing
- **Runtime:** Node.js

---

## Prerequisites

- Node.js >= 20
- npm >= 10
- A running MySQL or MariaDB instance

---

## Installation

```bash
npm install
```

---

## Environment Setup

Create a `.env` file in the project root:

```env
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
PORT=3000
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
PLAID_CLIENT_ID=your_plaid_client_id
PLAID_SECRET=your_plaid_secret
PLAID_ENV=sandbox
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=your_region
AWS_S3_BUCKET=your_bucket_name
```

---

## Database Setup (Prisma)

```bash
# Run all pending migrations
npx prisma migrate deploy

# Generate the Prisma client (required after schema changes)
npx prisma generate

# Seed lookup tables (Banks, AccountTypes, TransactionTypes, Currencies, ImportSources)
npm run seed
```

### Common Prisma commands during development

```bash
# Create and apply a new migration after editing schema.prisma
npx prisma migrate dev --name <migration_name>

# Open Prisma Studio (browser-based DB viewer)
npx prisma studio

# Reset the database and re-run all migrations + seed
npx prisma migrate reset
```

---

## Running the App

```bash
# Development (watch mode)
npm run start:dev

# Standard start
npm run start

# Production
npm run build
npm run start:prod
```

The server starts on `http://localhost:3000` by default (override via `PORT` in `.env`).

**Swagger / OpenAPI UI:** `http://localhost:3000/api/docs`

---

## Testing

```bash
# Unit tests
npm run test

# Unit tests in watch mode
npm run test:watch

# Coverage report
npm run test:cov

# E2E tests
npm run test:e2e
```

---

## Code Quality

```bash
# Lint and auto-fix
npm run lint

# Format with Prettier
npm run format
```

---

## Authentication

All protected endpoints require a short-lived **access token** passed as a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

The token refresh endpoint (`POST /auth/refresh`) requires a **refresh token** instead:

```
Authorization: Bearer <refresh_token>
```

Both tokens are returned on register and login. Store them securely on the client (e.g. `access_token` in memory, `refresh_token` in an HTTP-only cookie).

---

## API Reference

Base URL: `http://localhost:3000`

---

### Auth

#### Register

```
POST /auth/register
```

Creates a new user account and returns token pair.

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Unique email address |
| `password` | string | Yes | Min 8 characters |
| `confirmPassword` | string | Yes | Must match `password` |
| `firstName` | string | Yes | |
| `lastName` | string | Yes | |
| `phone` | string | No | e.g. `+14161234567` |
| `dateOfBirth` | string (ISO 8601) | No | e.g. `1990-06-15` |
| `preferredCurrencyId` | UUID | No | UUID of a Currency row |

**Responses**

| Status | Description |
|---|---|
| 201 | `{ access_token, refresh_token }` |
| 400 | Validation error or email already registered |

---

#### Login

```
POST /auth/login
```

Authenticates an existing user and returns a fresh token pair.

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | |
| `password` | string | Yes | Min 8 characters |

**Responses**

| Status | Description |
|---|---|
| 200 | `{ access_token, refresh_token }` |
| 401 | Invalid credentials |

---

#### Refresh Tokens

```
POST /auth/refresh
```

Exchanges a valid refresh token for a new token pair. Send the **refresh token** in the `Authorization` header (not the access token).

**Responses**

| Status | Description |
|---|---|
| 200 | `{ access_token, refresh_token }` |
| 401 | Refresh token invalid or expired |

---

### Users

> All endpoints require `Authorization: Bearer <access_token>`

#### Get Current User

```
GET /users/me
```

Returns the authenticated user's record.

**Responses**

| Status | Description |
|---|---|
| 200 | User object |
| 401 | Missing or invalid access token |

---

#### Get User by ID

```
GET /users/:id
```

**Path Parameters**

| Parameter | Type | Notes |
|---|---|---|
| `id` | UUID | UUID of the user |

**Responses**

| Status | Description |
|---|---|
| 200 | User object |
| 401 | Unauthenticated |
| 404 | User not found |

---

#### Update User

```
PATCH /users/:id
```

**Path Parameters**

| Parameter | Type | Notes |
|---|---|---|
| `id` | UUID | UUID of the user |

**Request Body** *(all fields optional)*

| Field | Type | Notes |
|---|---|---|
| `firstName` | string | |
| `lastName` | string | |
| `phone` | string | e.g. `+14161234567` |
| `dateOfBirth` | string (ISO 8601) | e.g. `1990-06-15` |
| `preferredCurrencyId` | UUID | UUID of a Currency row |

**Responses**

| Status | Description |
|---|---|
| 200 | Updated user object |
| 401 | Unauthenticated |
| 404 | User not found |

---

### Profile

> All endpoints require `Authorization: Bearer <access_token>`

#### Get Profile

```
GET /profile
```

Returns the profile for the authenticated user.

**Responses**

| Status | Description |
|---|---|
| 200 | Profile object |
| 401 | Missing or invalid access token |

---

#### Update Profile

```
PATCH /profile
```

**Request Body** *(all fields optional)*

| Field | Type | Notes |
|---|---|---|
| `firstName` | string | |
| `lastName` | string | |
| `phone` | string | e.g. `+14161234567` |
| `dateOfBirth` | string (ISO 8601) | e.g. `1990-06-15` |
| `preferredCurrencyId` | UUID | UUID of a Currency row |

**Responses**

| Status | Description |
|---|---|
| 200 | Updated profile object |
| 401 | Missing or invalid access token |

---

### Plaid

> All endpoints require `Authorization: Bearer <access_token>`

#### Create Link Token

```
POST /plaid/link-token
```

Generates a Plaid Link token to initialise the Plaid Link flow on the client. Pass the returned `link_token` to the Plaid Link SDK.

**Responses**

| Status | Description |
|---|---|
| 201 | `{ link_token, expiration, request_id }` |
| 401 | Unauthenticated |

---

#### Exchange Public Token

```
POST /plaid/exchange-token
```

Call this after Plaid Link's `onSuccess` callback to persist the bank connection. The `publicToken` is one-time-use.

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `publicToken` | string | Yes | One-time public token from Plaid Link `onSuccess` |
| `institutionId` | string | No | Plaid `institution_id` from Link metadata, e.g. `ins_1` |
| `institutionName` | string | No | e.g. `TD Canada Trust` |

**Responses**

| Status | Description |
|---|---|
| 200 | PlaidItem row created; access token stored encrypted |
| 400 | Invalid or already-used public token |
| 401 | Unauthenticated |

---

#### Disconnect Plaid Item

```
POST /plaid/disconnect
```

Revokes a Plaid item and deactivates the associated `UserBankConnection`.

**Request Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `plaidItemId` | UUID | Yes | UUID of the PlaidItem row to revoke |

**Responses**

| Status | Description |
|---|---|
| 200 | Item revoked and connection deactivated |
| 401 | Unauthenticated |
| 404 | PlaidItem not found or not owned by user |

---

#### List Connected Items

```
GET /plaid/items
```

Returns all Plaid items linked to the authenticated user. Token fields are excluded from the response.

**Responses**

| Status | Description |
|---|---|
| 200 | Array of PlaidItem records |
| 401 | Unauthenticated |

---

### Import

> All endpoints require `Authorization: Bearer <access_token>`

#### Upload CSV

```
POST /import/transactions
Content-Type: multipart/form-data
```

Uploads a CSV file and queues an import job. The batch record is created immediately; processing is asynchronous. Poll `GET /import/batches/:id` to track progress.

**Form Fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | binary | Yes | CSV file; max 10 MB; MIME: `text/csv` or `application/vnd.ms-excel` |
| `bankAccountId` | UUID | Yes | UUID of the target BankAccount |

**Responses**

| Status | Description |
|---|---|
| 201 | `{ importBatchId: string }` |
| 400 | Validation error or invalid file |
| 401 | Unauthenticated |
| 403 | `bankAccountId` does not belong to the authenticated user |

---

#### List Import Batches

```
GET /import/batches
```

Returns all import batches for the authenticated user, ordered by `startedAt` DESC. `errorLog` is excluded from the list view.

**Response** — Array of ImportBatch summaries:

| Field | Type |
|---|---|
| `id` | UUID |
| `fileName` | string |
| `status` | `PENDING` \| `PROCESSING` \| `COMPLETED` \| `FAILED` |
| `rowCount` | number |
| `successCount` | number |
| `skippedCount` | number |
| `errorCount` | number |
| `startedAt` | ISO 8601 datetime |
| `completedAt` | ISO 8601 datetime \| null |
| `bankAccountId` | UUID |

**Responses**

| Status | Description |
|---|---|
| 200 | Array of ImportBatch summaries |
| 401 | Unauthenticated |

---

#### Get Import Batch

```
GET /import/batches/:id
```

Returns a single import batch including the full `errorLog`.

**Path Parameters**

| Parameter | Type | Notes |
|---|---|---|
| `id` | UUID | UUID of the ImportBatch |

**Responses**

| Status | Description |
|---|---|
| 200 | Full ImportBatch record including `errorLog` |
| 401 | Unauthenticated |
| 404 | Batch not found or not owned by user |

---

### Transactions

> All endpoints require `Authorization: Bearer <access_token>`

#### List Transactions

```
GET /transactions
```

Paginated transaction list scoped to the authenticated user. Ordered by `postedDate` DESC, then `createdAt` DESC.

**Query Parameters**

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `page` | number | `1` | Min 1 |
| `limit` | number | `50` | Min 1, max 50 |
| `bankAccountId` | UUID | — | Filter to a single bank account |
| `from` | string (ISO 8601 date) | — | Start of date range |
| `to` | string (ISO 8601 date) | — | End of date range |
| `type` | `CREDIT` \| `DEBIT` | — | Filter by transaction direction |

**Response**

```json
{
  "data": [ /* Transaction objects */ ],
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 240,
    "totalPages": 5,
    "hasNextPage": true
  }
}
```

**Responses**

| Status | Description |
|---|---|
| 200 | Paginated transaction list |
| 401 | Unauthenticated |

---

### Dashboard

> All endpoints require `Authorization: Bearer <access_token>`

All dashboard endpoints accept the following optional query parameters:

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `bankAccountId` | UUID | — | Filter to a single bank account |
| `from` | string (ISO 8601 date) | 90 days ago | Start of date range |
| `to` | string (ISO 8601 date) | today | End of date range |
| `granularity` | `weekly` \| `monthly` | `monthly` | Time-series grouping granularity |

---

#### Cash Flow

```
GET /dashboard/cash-flow
```

Inflows, outflows, and net per period. Useful for bar/line charts.

**Response** — Array ordered ASC by period:

```json
[
  { "period": "2025-01", "inflows": 4200.00, "outflows": 3100.50, "net": 1099.50 }
]
```

**Responses:** `200` success | `401` unauthenticated

---

#### Cumulative Balance

```
GET /dashboard/cumulative-balance
```

Running balance over time. Useful for area/line charts.

**Response** — Array ordered ASC:

```json
[
  { "date": "2025-01-01", "balance": 12500.00 }
]
```

**Responses:** `200` success | `401` unauthenticated

---

#### Spending by Category

```
GET /dashboard/spending-by-category
```

Spending totals by category. Useful for donut/pie charts.

**Response** — Array ordered by `total` DESC:

```json
[
  { "label": "Groceries", "total": 820.45, "percentage": 18.5 }
]
```

**Responses:** `200` success | `401` unauthenticated

---

#### Merchant Concentration

```
GET /dashboard/merchant-concentration
```

Top 20 merchants by total spend. Useful for horizontal bar charts.

**Response**:

```json
[
  { "merchantName": "Loblaws", "total": 650.00, "transactionCount": 12 }
]
```

**Responses:** `200` success | `401` unauthenticated

---

#### Recurring vs One-Off Spending

```
GET /dashboard/recurring-vs-oneoff
```

Breakdown of recurring vs one-time transactions. Useful for donut/gauge charts.

**Response**:

```json
{
  "recurring":  { "total": 1850.00, "count": 8,  "percentage": 40.2 },
  "oneOff":     { "total": 2750.50, "count": 63, "percentage": 59.8 }
}
```

**Responses:** `200` success | `401` unauthenticated

---

#### Burn Rate Gauge

```
GET /dashboard/burn-rate
```

Current month spend vs. average of previous 3 months. Useful for a gauge or KPI card.

**Response**:

```json
{
  "currentMonthSpend": 3200.00,
  "avgPrevThreeMonths": 2800.00,
  "burnRateRatio": 1.14,
  "trend": "up"
}
```

**Responses:** `200` success | `401` unauthenticated

---

#### Currency Exposure

```
GET /dashboard/currency-exposure
```

Spending broken down by currency, normalised to CAD. Useful for horizontal bar charts.

**Response** — Array:

```json
[
  { "currencyCode": "USD", "symbol": "$", "totalCAD": 980.00, "percentage": 22.1 }
]
```

**Responses:** `200` success | `401` unauthenticated

---

#### Tags

```
GET /dashboard/tags
```

When called without `tag`: returns a summary list of all tags used.

When called with `?tag=<tagName>`: returns period cash-flow filtered to transactions with that tag.

**Additional Query Parameter**

| Parameter | Type | Notes |
|---|---|---|
| `tag` | string | If provided, returns cash-flow grouped by period for this tag |

**Responses:** `200` success | `401` unauthenticated

---

### Accounts

> All endpoints require `Authorization: Bearer <access_token>`

#### Get Account Balances

```
GET /accounts/balances
```

Returns all active bank accounts for the authenticated user, plus CAD-normalised aggregate totals.

**Response**:

```json
{
  "accounts": [
    {
      "id": "uuid",
      "accountName": "TD Chequing",
      "accountType": "CHEQUING",
      "currentBalance": 5400.00,
      "availableBalance": 5400.00,
      "currencyCode": "CAD"
    }
  ],
  "totals": {
    "totalCurrentBalanceCAD": 12300.00,
    "totalAvailableBalanceCAD": 11800.00
  }
}
```

**Responses**

| Status | Description |
|---|---|
| 200 | Account balances with aggregate totals |
| 401 | Unauthenticated |

---

### Health Check

```
GET /
```

No auth required. Returns a plain-text health message.

**Responses:** `200` OK

---

## Data Model Overview

### Lookup Tables *(seeded once)*

| Table | Purpose |
|---|---|
| `Bank` | Canadian banks — name, institution number, SWIFT code |
| `AccountType` | CHEQUING, SAVINGS, TFSA, RRSP, FHSA, LOC, CREDIT_CARD |
| `TransactionType` | DEBIT, CREDIT, TRANSFER, FEE, INTEREST, REVERSAL |
| `Currency` | ISO 4217 currencies (CAD, USD, EUR, …) |
| `ImportSource` | CSV, OFX, PDF, API |

### Core Entities

| Table | Purpose |
|---|---|
| `User` | Platform users — roles: USER, ADMIN, ANALYST |
| `UserBankConnection` | Open Banking consent grant linking a user to a bank |
| `BankAccount` | Individual account identified by CPA routing triple (transit + institution + account number) |
| `Transaction` | Statement line items — amount, merchant, MCC code, recurring/duplicate flags |

### Import & Analytics

| Table | Purpose |
|---|---|
| `ImportBatch` | File upload job — tracks status (PENDING → PROCESSING → COMPLETED / FAILED), row counts, and structured error logs |
| `Category` | Hierarchical spending categories — system-global or user-defined |
| `TransactionTag` | Free-text labels per transaction (e.g. `tax-deductible`, `vacation`) |
| `AnalyticsSnapshot` | Pre-aggregated inflows, outflows, and net flow by period (DAILY / WEEKLY / MONTHLY / YEARLY) |
| `AuditLog` | Immutable write-only change log for all mutations, logins, and imports |

---

## Project Structure

```
src/
  main.ts                    # Bootstrap entry point (Swagger configured here)
  app.module.ts              # Root module
  app.controller.ts          # Root controller (health check)
  app.service.ts             # Root service
  auth/                      # JWT auth, guards, decorators, strategies
  user/                      # User CRUD
  profile/                   # User profile
  plaid/                     # Plaid Link integration
  import/                    # CSV file import & batch tracking
  transactions/              # Transaction list & filtering
  dashboard/                 # Analytics & chart data endpoints
  accounts/                  # Bank account balances

prisma/
  schema.prisma              # Data model
  seed.ts                    # Lookup table seed script
  migrations/                # Migration history

test/
  app.e2e-spec.ts            # E2E tests
```

---

## License

This project is licensed under the [MIT License](LICENSE).
