# Finlysis

A NestJS backend for personal finance management. Supports multi-bank account connections, transaction imports (CSV / OFX / PDF / API), spending categorization, analytics snapshots, and a full audit trail.

---

## Tech Stack

- **Framework:** NestJS (TypeScript)
- **ORM:** Prisma 7
- **Database:** MySQL / MariaDB
- **Auth:** bcryptjs password hashing
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
  app.module.ts        # Root module
  app.controller.ts    # Root controller
  app.service.ts       # Root service
  main.ts              # Bootstrap entry point

prisma/
  schema.prisma        # Data model
  seed.ts              # Lookup table seed script
  migrations/          # Migration history

test/
  app.e2e-spec.ts      # E2E tests
```

---

## License

This project is licensed under the [MIT License](LICENSE).
