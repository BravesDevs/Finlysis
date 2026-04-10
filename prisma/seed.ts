import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import bcrypt from 'bcryptjs'

// Prisma 7 requires a driver adapter — PrismaMariaDb creates the pool internally.
// Parse the DATABASE_URL manually so Railway's non-standard port is respected.
function parseDatabaseUrl(url: string) {
  const u = new URL(url)
  return {
    host:            u.hostname,
    port:            parseInt(u.port, 10) || 3306,
    user:            decodeURIComponent(u.username),
    password:        decodeURIComponent(u.password),
    database:        u.pathname.slice(1),
    connectionLimit: 5,
  }
}

const adapter = new PrismaMariaDb(parseDatabaseUrl(process.env.DATABASE_URL!))
const prisma  = new PrismaClient({ adapter })

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min
const pad = (n: number, len: number) => String(n).padStart(len, '0')
const dec = (n: number) => n.toFixed(2) // format number as Prisma Decimal-compatible string

function daysAgo(days: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d
}

function randomPastDate(maxDaysBack = 90): Date {
  return daysAgo(randomInt(1, maxDaysBack))
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER / LOOKUP DATA
// ─────────────────────────────────────────────────────────────────────────────

const BANKS = [
  { name: 'TD Canada Trust',         legalName: 'The Toronto-Dominion Bank',              institutionNumber: '004', swiftCode: 'TDOMCATTTOR', logoUrl: 'https://www.td.com/favicon.ico',        isActive: true },
  { name: 'RBC Royal Bank',          legalName: 'Royal Bank of Canada',                   institutionNumber: '003', swiftCode: 'ROYCCAT2',    logoUrl: 'https://www.rbc.com/favicon.ico',       isActive: true },
  { name: 'BMO Bank of Montreal',    legalName: 'Bank of Montreal',                       institutionNumber: '001', swiftCode: 'BOFMCAM2',    logoUrl: 'https://www.bmo.com/favicon.ico',       isActive: true },
  { name: 'Scotiabank',              legalName: 'The Bank of Nova Scotia',                institutionNumber: '002', swiftCode: 'NOSCCATT',    logoUrl: 'https://www.scotiabank.com/favicon.ico', isActive: true },
  { name: 'CIBC',                    legalName: 'Canadian Imperial Bank of Commerce',     institutionNumber: '010', swiftCode: 'CIBCCATT',    logoUrl: 'https://www.cibc.com/favicon.ico',      isActive: true },
  { name: 'National Bank',           legalName: 'National Bank of Canada',                institutionNumber: '006', swiftCode: 'BNDCCAMMINT', logoUrl: 'https://www.nbc.ca/favicon.ico',        isActive: true },
  { name: 'HSBC Canada',             legalName: 'HSBC Bank Canada',                       institutionNumber: '016', swiftCode: 'HKBCCATT',    logoUrl: 'https://www.hsbc.ca/favicon.ico',       isActive: true },
  { name: 'Tangerine',               legalName: 'Tangerine Bank',                         institutionNumber: '614', swiftCode: null,          logoUrl: 'https://www.tangerine.ca/favicon.ico',  isActive: true },
  { name: 'EQ Bank',                 legalName: 'Equitable Bank',                         institutionNumber: '623', swiftCode: null,          logoUrl: 'https://www.eqbank.ca/favicon.ico',     isActive: true },
  { name: 'PC Financial',            legalName: "President's Choice Bank",                institutionNumber: '361', swiftCode: null,          logoUrl: null,                                    isActive: true },
]

const ACCOUNT_TYPES = [
  { code: 'CHEQUING',    label: 'Chequing Account',                   description: 'Everyday banking account for deposits and withdrawals' },
  { code: 'SAVINGS',     label: 'Savings Account',                    description: 'Interest-bearing account for saving money' },
  { code: 'TFSA',        label: 'Tax-Free Savings Account',           description: 'Canadian tax-advantaged savings vehicle' },
  { code: 'RRSP',        label: 'Registered Retirement Savings Plan', description: 'Tax-deferred retirement savings account' },
  { code: 'FHSA',        label: 'First Home Savings Account',         description: 'Tax-free savings for first-time home buyers' },
  { code: 'LOC',         label: 'Line of Credit',                     description: 'Revolving credit facility' },
  { code: 'CREDIT_CARD', label: 'Credit Card',                        description: 'Revolving credit card account' },
]

const TRANSACTION_TYPES = [
  { code: 'DEBIT',    label: 'Debit',    description: 'Money leaving the account' },
  { code: 'CREDIT',   label: 'Credit',   description: 'Money entering the account' },
  { code: 'TRANSFER', label: 'Transfer', description: 'Movement of funds between accounts' },
  { code: 'FEE',      label: 'Fee',      description: 'Bank or service charge' },
  { code: 'INTEREST', label: 'Interest', description: 'Interest earned or charged' },
  { code: 'REVERSAL', label: 'Reversal', description: 'Reversal of a prior transaction' },
]

const CURRENCIES = [
  { code: 'CAD', symbol: '$',   name: 'Canadian Dollar' },
  { code: 'USD', symbol: 'US$', name: 'United States Dollar' },
  { code: 'EUR', symbol: '€',   name: 'Euro' },
  { code: 'GBP', symbol: '£',   name: 'British Pound Sterling' },
  { code: 'CHF', symbol: 'Fr',  name: 'Swiss Franc' },
]

const IMPORT_SOURCES = [
  { code: 'CSV', label: 'CSV File Upload' },
  { code: 'OFX', label: 'OFX / QFX File Upload' },
  { code: 'PDF', label: 'PDF Statement Upload' },
  { code: 'API', label: 'Open Banking API' },
]

// ─────────────────────────────────────────────────────────────────────────────
// USER DATA  (10 realistic Canadian names)
// ─────────────────────────────────────────────────────────────────────────────

const USERS = [
  { firstName: 'Liam',      lastName: 'Tremblay',  email: 'liam.tremblay@example.ca' },
  { firstName: 'Emma',      lastName: 'Bouchard',  email: 'emma.bouchard@example.ca' },
  { firstName: 'Noah',      lastName: 'Gagnon',    email: 'noah.gagnon@example.ca' },
  { firstName: 'Olivia',    lastName: 'Roy',       email: 'olivia.roy@example.ca' },
  { firstName: 'William',   lastName: 'Cote',      email: 'william.cote@example.ca' },
  { firstName: 'Sophia',    lastName: 'Leblanc',   email: 'sophia.leblanc@example.ca' },
  { firstName: 'James',     lastName: 'Martin',    email: 'james.martin@example.ca' },
  { firstName: 'Charlotte', lastName: 'Wilson',    email: 'charlotte.wilson@example.ca' },
  { firstName: 'Benjamin',  lastName: 'MacDonald', email: 'ben.macdonald@example.ca' },
  { firstName: 'Amelia',    lastName: 'Taylor',    email: 'amelia.taylor@example.ca' },
]

// ─────────────────────────────────────────────────────────────────────────────
// MERCHANT / TRANSACTION TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────

type MerchantTemplate = {
  name: string
  category: string | null       // ISO 18245 MCC code
  txTypeCode: 'DEBIT' | 'CREDIT' | 'FEE' | 'INTEREST' | 'TRANSFER'
  minCents: number
  maxCents: number
  isRecurring: boolean
}

// Weighted list: more DEBIT entries so the random mix resembles a real statement
const MERCHANTS: MerchantTemplate[] = [
  // ── Grocery ──────────────────────────────────────────────────────────────
  { name: 'Loblaws',              category: '5411', txTypeCode: 'DEBIT',    minCents:  2500, maxCents: 18000, isRecurring: false },
  { name: 'Metro',                category: '5411', txTypeCode: 'DEBIT',    minCents:  1500, maxCents: 12000, isRecurring: false },
  { name: 'Sobeys',               category: '5411', txTypeCode: 'DEBIT',    minCents:  2000, maxCents: 15000, isRecurring: false },
  // ── Food & Drink ─────────────────────────────────────────────────────────
  { name: 'Tim Hortons',          category: '5812', txTypeCode: 'DEBIT',    minCents:   200, maxCents:  1800, isRecurring: false },
  { name: 'Starbucks',            category: '5812', txTypeCode: 'DEBIT',    minCents:   500, maxCents:  2500, isRecurring: false },
  { name: 'McDonald\'s',          category: '5814', txTypeCode: 'DEBIT',    minCents:   600, maxCents:  2200, isRecurring: false },
  { name: 'LCBO',                 category: '5921', txTypeCode: 'DEBIT',    minCents:  2000, maxCents:  8000, isRecurring: false },
  // ── Gas ──────────────────────────────────────────────────────────────────
  { name: 'Petro-Canada',         category: '5541', txTypeCode: 'DEBIT',    minCents:  4000, maxCents: 12000, isRecurring: false },
  { name: 'Shell',                category: '5541', txTypeCode: 'DEBIT',    minCents:  3500, maxCents: 11000, isRecurring: false },
  // ── Subscriptions ────────────────────────────────────────────────────────
  { name: 'Netflix',              category: '7841', txTypeCode: 'DEBIT',    minCents:  1699, maxCents:  2299, isRecurring: true  },
  { name: 'Spotify',              category: '7929', txTypeCode: 'DEBIT',    minCents:   999, maxCents:  1599, isRecurring: true  },
  { name: 'Rogers',               category: '4813', txTypeCode: 'DEBIT',    minCents:  6500, maxCents: 12000, isRecurring: true  },
  // ── Retail ───────────────────────────────────────────────────────────────
  { name: 'Amazon.ca',            category: '5999', txTypeCode: 'DEBIT',    minCents:  1500, maxCents: 20000, isRecurring: false },
  { name: 'Canadian Tire',        category: '5251', txTypeCode: 'DEBIT',    minCents:  1200, maxCents: 15000, isRecurring: false },
  { name: 'Shoppers Drug Mart',   category: '5912', txTypeCode: 'DEBIT',    minCents:  1000, maxCents:  9000, isRecurring: false },
  { name: 'Cineplex',             category: '7832', txTypeCode: 'DEBIT',    minCents:  1400, maxCents:  5000, isRecurring: false },
  // ── Transport ────────────────────────────────────────────────────────────
  { name: 'Uber',                 category: '4121', txTypeCode: 'DEBIT',    minCents:   800, maxCents:  4500, isRecurring: false },
  { name: 'Presto Card',          category: '4111', txTypeCode: 'DEBIT',    minCents:  2000, maxCents:  5000, isRecurring: false },
  // ── Credits / Income ─────────────────────────────────────────────────────
  { name: 'Direct Deposit - Payroll', category: null, txTypeCode: 'CREDIT', minCents: 180000, maxCents: 350000, isRecurring: true  },
  { name: 'e-Transfer Received',      category: null, txTypeCode: 'CREDIT', minCents:   5000, maxCents:  50000, isRecurring: false },
  { name: 'CRA Tax Refund',           category: null, txTypeCode: 'CREDIT', minCents:  20000, maxCents: 120000, isRecurring: false },
  // ── Fees ─────────────────────────────────────────────────────────────────
  { name: 'Monthly Account Fee',  category: null, txTypeCode: 'FEE',      minCents:   400, maxCents:  1695, isRecurring: true  },
  // ── Interest ─────────────────────────────────────────────────────────────
  { name: 'Interest Earned',      category: null, txTypeCode: 'INTEREST', minCents:    10, maxCents:  3000, isRecurring: false },
  // ── Transfers ────────────────────────────────────────────────────────────
  { name: 'Interac e-Transfer Sent', category: null, txTypeCode: 'TRANSFER', minCents: 5000, maxCents: 100000, isRecurring: false },
]

const OUTFLOW_TYPES = new Set(['DEBIT', 'FEE', 'TRANSFER'])

// ─────────────────────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱  Seeding Finlysis database…\n')

  // ── 0. CLEAR ALL DATA (reverse FK order) ────────────────────────────────
  console.log('  Clearing existing data…')
  await prisma.transactionTag.deleteMany()
  await prisma.analyticsSnapshot.deleteMany()
  await prisma.auditLog.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.importBatch.deleteMany()
  await prisma.bankAccount.deleteMany()
  await prisma.userBankConnection.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
  await prisma.bank.deleteMany()
  await prisma.accountType.deleteMany()
  await prisma.transactionType.deleteMany()
  await prisma.currency.deleteMany()
  await prisma.importSource.deleteMany()
  console.log('  Done.\n')

  // ── 1. LOOKUP TABLES ────────────────────────────────────────────────────
  console.log('  Seeding lookup tables…')

  await prisma.bank.createMany({ data: BANKS })
  await prisma.accountType.createMany({ data: ACCOUNT_TYPES })
  await prisma.transactionType.createMany({ data: TRANSACTION_TYPES })
  await prisma.currency.createMany({ data: CURRENCIES })
  await prisma.importSource.createMany({ data: IMPORT_SOURCES })

  const banks            = await prisma.bank.findMany()
  const accountTypes     = await prisma.accountType.findMany()
  const transactionTypes = await prisma.transactionType.findMany()
  const currencies       = await prisma.currency.findMany()

  console.log(`  ✓ ${banks.length} banks | ${accountTypes.length} account types | ${transactionTypes.length} tx types | ${currencies.length} currencies | ${IMPORT_SOURCES.length} import sources\n`)

  // Convenience index maps
  const cad       = currencies.find(c  => c.code === 'CAD')!
  const chequing  = accountTypes.find(at => at.code === 'CHEQUING')!
  const savings   = accountTypes.find(at => at.code === 'SAVINGS')!
  const txTypeMap = Object.fromEntries(transactionTypes.map(tt => [tt.code, tt]))

  // Pre-hash once — all seed users share the same demo password
  const PASSWORD_HASH = await bcrypt.hash('Password@123', 12)

  // ── 2. USERS  (10) ──────────────────────────────────────────────────────
  console.log('  Seeding users, accounts, and transactions…')

  let transitCounter = 10001  // unique incrementing transit number per account

  for (const [idx, u] of USERS.entries()) {

    // ── User ──────────────────────────────────────────────────────────────
    const user = await prisma.user.create({
      data: {
        email:               u.email,
        passwordHash:        PASSWORD_HASH,
        firstName:           u.firstName,
        lastName:            u.lastName,
        phone:               `+1416${pad(randomInt(1000000, 9999999), 7)}`,
        dateOfBirth:         daysAgo(randomInt(25 * 365, 45 * 365)),
        preferredCurrencyId: cad.id,
        isEmailVerified:     true,
        role:                'USER',
      },
    })

    // ── 2 accounts at 2 distinct random banks ─────────────────────────────
    const [bank1, bank2] = [...banks].sort(() => Math.random() - 0.5).slice(0, 2)
    const bankAccountPairs = [
      { bank: bank1, accountType: chequing },
      { bank: bank2, accountType: savings  },
    ]

    for (const { bank, accountType } of bankAccountPairs) {

      // UserBankConnection — consent record for this bank
      const connection = await prisma.userBankConnection.create({
        data: {
          userId:           user.id,
          bankId:           bank.id,
          nickname:         `${u.firstName}'s ${bank.name}`,
          isActive:         true,
          consentGrantedAt: daysAgo(180),
          consentExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      })

      // BankAccount
      const transitNumber = pad(transitCounter++, 5)
      const accountNumber = pad(randomInt(1000000, 9999999), 7)
      const startBalance  = randomInt(50000, 1000000) / 100  // $500–$10 000

      const account = await prisma.bankAccount.create({
        data: {
          userBankConnectionId: connection.id,
          accountTypeId:        accountType.id,
          currencyId:           cad.id,
          transitNumber,
          institutionNumber:    bank.institutionNumber,
          accountNumber,
          accountNumberMasked:  `****${accountNumber.slice(-4)}`,
          nickname:             accountType.label,
          currentBalance:       dec(startBalance),
          availableBalance:     dec(startBalance),
          balanceAsOf:          new Date(),
          isActive:             true,
        },
      })

      // ── 10 transactions per account ─────────────────────────────────────
      let runningBalance = startBalance

      for (let t = 0; t < 10; t++) {
        const merchant = pick(MERCHANTS)
        const txType   = txTypeMap[merchant.txTypeCode]
        const amount   = randomInt(merchant.minCents, merchant.maxCents) / 100

        runningBalance = OUTFLOW_TYPES.has(merchant.txTypeCode)
          ? runningBalance - amount
          : runningBalance + amount

        await prisma.transaction.create({
          data: {
            bankAccountId:     account.id,
            transactionTypeId: txType.id,
            currencyId:        cad.id,
            amount:            dec(amount),
            postedDate:        randomPastDate(90),
            description:       merchant.name,
            merchantName:      merchant.txTypeCode === 'DEBIT' ? merchant.name : null,
            merchantCategory:  merchant.category ?? undefined,
            balance:           dec(runningBalance),
            isRecurring:       merchant.isRecurring,
            isDuplicate:       false,
          },
        })
      }

      // Write the final running balance back to the account
      await prisma.bankAccount.update({
        where: { id: account.id },
        data: {
          currentBalance:   dec(runningBalance),
          availableBalance: dec(Math.max(0, runningBalance)),
          balanceAsOf:      new Date(),
        },
      })
    }

    console.log(`  ✓ [${idx + 1}/10] ${u.firstName} ${u.lastName} <${u.email}>`)
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────
  const [userCount, accountCount, txCount] = await Promise.all([
    prisma.user.count(),
    prisma.bankAccount.count(),
    prisma.transaction.count(),
  ])

  console.log(`
✅  Seed complete!

   Lookup tables
   ├─ ${banks.length} banks
   ├─ ${accountTypes.length} account types
   ├─ ${transactionTypes.length} transaction types
   ├─ ${currencies.length} currencies
   └─ ${IMPORT_SOURCES.length} import sources

   Application data
   ├─ ${userCount} users
   ├─ ${accountCount} bank accounts  (2 per user, at different banks)
   └─ ${txCount} transactions   (10 per account)

   Default password for all seed users: Password@123
`)
}

main()
  .catch(e => {
    console.error('\n❌  Seed failed:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
