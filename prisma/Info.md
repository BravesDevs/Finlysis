## Lookup Tables

Reference data seeded once during setup (e.g., dropdown options).

| Table | Purpose |
|-------|---------|
| **Bank** | Canadian banks directory. Stores name, 3-digit institution number, SWIFT code, and logo. |
| **AccountType** | Account classifications: CHEQUING, SAVINGS, TFSA, RRSP, FHSA, LOC, CREDIT_CARD. |
| **TransactionType** | Transaction classifications: DEBIT, CREDIT, TRANSFER, FEE, INTEREST, REVERSAL. |
| **Currency** | ISO 4217 currencies (CAD, USD, EUR, etc.). Stores code, symbol, and name. |
| **ImportSource** | Import methods: CSV, OFX, PDF, or API. |

---

## Core Entity Tables

Primary application data for users and finances.

| Table | Purpose |
|-------|---------|
| **User** | System users. Stores name, email, phone, DOB, hashed password, verification status, role (USER/ADMIN/ANALYST), and preferred currency. |
| **UserBankConnection** | User permission to access a bank account. Tracks consent date, expiry, and external service ID. |
| **BankAccount** | Individual bank account. Uses CPA routing: transit (5 digits) + institution (3 digits) + account (7 digits). Stores current/available balances. |
| **Transaction** | Bank statement line item. Stores amount, date, merchant, MCC code, account balance snapshot, and flags (recurring/duplicate). |

---

## Import & Audit Tables

Bank statement uploads and system-wide change tracking.

| Table | Purpose |
|-------|---------|
| **ImportBatch** | Upload job metadata. Tracks file name, size, row count, success/failure counts, status (PENDING → PROCESSING → COMPLETED/FAILED), and JSON error logs. |
| **Category** | Spending categories (e.g., Food, Transport, Utilities). Supports nesting and user-specific or system-wide scoping. |
| **TransactionTag** | Free-text labels on transactions (e.g., tax-deductible, vacation). Unique per transaction. |
| **AnalyticsSnapshot** | Pre-calculated financial summaries by period (DAILY, WEEKLY, MONTHLY, YEARLY). Stores inflows, outflows, net flow, and opening/closing balances. |
| **AuditLog** | Write-only change log. Records all creates, updates, deletes, logins, and imports with before/after JSON state, user, IP, and browser info. |
