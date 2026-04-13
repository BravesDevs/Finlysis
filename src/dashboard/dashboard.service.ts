import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardQueryDto } from './dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise raw-query numeric values from MariaDB (Decimal | BigInt | string | number). */
function toNum(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'bigint') return Number(val);
  if (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as { toNumber?: () => number }).toNumber === 'function'
  ) {
    return (val as { toNumber: () => number }).toNumber();
  }
  return parseFloat(String(val)) || 0;
}

/** Resolve default from/to dates and return as plain Date objects. */
function resolveDateRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);
  const fromDate = from ? new Date(from) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

// ---------------------------------------------------------------------------
// MCC → Category label mapping (static, not a DB table)
// ---------------------------------------------------------------------------
// The mapping is intentionally kept here so it can be reflected in SQL via
// a CASE expression — all grouping/summing stays in the database.
// ---------------------------------------------------------------------------

type RawCategoryRow = {
  label: string;
  total: string | number;
};

type RawCashFlowRow = {
  period: string;
  totalInflow: string | number;
  totalOutflow: string | number;
  netFlow: string | number;
};

type RawBalanceRow = {
  date: string;
  balance: string | number;
};

type RawMerchantRow = {
  merchantName: string;
  total: string | number;
  transactionCount: string | number | bigint;
};

type RawRecurringRow = {
  isRecurring: number | boolean;
  total: string | number;
  count: string | number | bigint;
};

type RawBurnRow = {
  currentMonthSpend: string | number;
};

type RawPrevMonthRow = {
  monthlySpend: string | number;
};

type RawCurrencyRow = {
  currencyCode: string;
  symbol: string;
  totalCAD: string | number;
};

type RawTagSummaryRow = {
  tag: string;
  totalSpend: string | number;
  transactionCount: string | number | bigint;
};

type RawTagCashFlowRow = RawCashFlowRow;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Part B: Cash Flow ──────────────────────────────────────────────────────

  async getCashFlow(userId: string, query: DashboardQueryDto) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);
    const granularity = query.granularity ?? 'monthly';
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    const periodExpr =
      granularity === 'weekly'
        ? Prisma.sql`DATE_FORMAT(DATE_SUB(t.postedDate, INTERVAL WEEKDAY(t.postedDate) DAY), '%Y-%m-%d')`
        : Prisma.sql`DATE_FORMAT(t.postedDate, '%Y-%m')`;

    const rows = await this.prisma.$queryRaw<RawCashFlowRow[]>(Prisma.sql`
      SELECT
        ${periodExpr} AS period,
        SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS totalInflow,
        SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END) AS totalOutflow,
        SUM(t.amount)                                          AS netFlow
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      WHERE ubc.userId   = ${userId}
        AND t.deletedAt  IS NULL
        AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
        ${accountClause}
      GROUP BY period
      ORDER BY period ASC
    `);

    return rows.map(r => ({
      period:        r.period,
      totalInflow:   toNum(r.totalInflow),
      totalOutflow:  toNum(r.totalOutflow),
      netFlow:       toNum(r.netFlow),
    }));
  }

  // ── Part B: Cumulative Balance ─────────────────────────────────────────────

  async getCumulativeBalance(userId: string, query: DashboardQueryDto) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);

    if (query.bankAccountId) {
      // Single account: last balance per day
      const rows = await this.prisma.$queryRaw<RawBalanceRow[]>(Prisma.sql`
        SELECT
          DATE_FORMAT(t.postedDate, '%Y-%m-%d') AS date,
          t.balance
        FROM (
          SELECT
            t.postedDate,
            t.balance,
            ROW_NUMBER() OVER (
              PARTITION BY t.postedDate
              ORDER BY t.createdAt DESC
            ) AS rn
          FROM \`Transaction\` t
          WHERE t.bankAccountId = ${query.bankAccountId}
            AND t.deletedAt    IS NULL
            AND t.postedDate   BETWEEN ${fromDate} AND ${toDate}
            AND t.balance      IS NOT NULL
        ) t
        WHERE t.rn = 1
        ORDER BY date ASC
      `);

      return rows.map(r => ({ date: r.date, balance: toNum(r.balance) }));
    }

    // All accounts: sum of last-known balance per account per day
    const rows = await this.prisma.$queryRaw<RawBalanceRow[]>(Prisma.sql`
      SELECT
        date,
        SUM(lastBalance) AS balance
      FROM (
        SELECT
          DATE_FORMAT(t.postedDate, '%Y-%m-%d') AS date,
          t.bankAccountId,
          t.balance                              AS lastBalance,
          ROW_NUMBER() OVER (
            PARTITION BY t.bankAccountId, t.postedDate
            ORDER BY t.createdAt DESC
          )                                      AS rn
        FROM \`Transaction\` t
        INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
        INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
        WHERE ubc.userId   = ${userId}
          AND t.deletedAt  IS NULL
          AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
          AND t.balance    IS NOT NULL
      ) sub
      WHERE sub.rn = 1
      GROUP BY date
      ORDER BY date ASC
    `);

    return rows.map(r => ({ date: r.date, balance: toNum(r.balance) }));
  }

  // ── Part C: Spending by Category ──────────────────────────────────────────

  async getSpendingByCategory(userId: string, query: DashboardQueryDto) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawCategoryRow[]>(Prisma.sql`
      SELECT
        CASE
          WHEN t.categoryId IS NOT NULL                                                      THEN cat.name
          WHEN t.merchantCategory IN ('5411','5422','5441','5451','5462','5499')              THEN 'Grocery'
          WHEN (t.merchantCategory >= '4111' AND t.merchantCategory <= '4131')
            OR (t.merchantCategory >= '4411' AND t.merchantCategory <= '4582')
            OR (t.merchantCategory >= '5511' AND t.merchantCategory <= '5599')               THEN 'Transport'
          WHEN t.merchantCategory IN ('5812','5813','5814')                                  THEN 'Dining'
          WHEN t.merchantCategory IN ('4722','4723','7011','7012')                           THEN 'Travel'
          WHEN (t.merchantCategory >= '5047' AND t.merchantCategory <= '5122')
            OR t.merchantCategory = '5912'                                                   THEN 'Health'
          WHEN (t.merchantCategory >= '5940' AND t.merchantCategory <= '5999')
            OR (t.merchantCategory >= '7011' AND t.merchantCategory <= '7999')               THEN 'Services'
          ELSE 'Other'
        END                    AS label,
        SUM(ABS(t.amount))     AS total
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      LEFT  JOIN \`Category\`           cat ON t.categoryId           = cat.id
      WHERE ubc.userId   = ${userId}
        AND t.deletedAt  IS NULL
        AND t.amount     < 0
        AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
        ${accountClause}
      GROUP BY label
      ORDER BY total DESC
    `);

    const grandTotal = rows.reduce((s, r) => s + toNum(r.total), 0);

    return rows.map(r => ({
      label:      r.label,
      total:      toNum(r.total),
      percentage: grandTotal > 0 ? Math.round((toNum(r.total) / grandTotal) * 10000) / 100 : 0,
    }));
  }

  // ── Part C: Merchant Concentration ────────────────────────────────────────

  async getMerchantConcentration(userId: string, query: DashboardQueryDto) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawMerchantRow[]>(Prisma.sql`
      SELECT
        t.merchantName,
        SUM(ABS(t.amount)) AS total,
        COUNT(*)           AS transactionCount
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      WHERE ubc.userId       = ${userId}
        AND t.deletedAt      IS NULL
        AND t.amount         < 0
        AND t.merchantName   IS NOT NULL
        AND t.postedDate     BETWEEN ${fromDate} AND ${toDate}
        ${accountClause}
      GROUP BY t.merchantName
      ORDER BY total DESC
      LIMIT 20
    `);

    return rows.map(r => ({
      merchantName:     r.merchantName,
      total:            toNum(r.total),
      transactionCount: toNum(r.transactionCount),
    }));
  }

  // ── Part D: Recurring vs One-Off ──────────────────────────────────────────

  async getRecurringVsOneOff(userId: string, query: DashboardQueryDto) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawRecurringRow[]>(Prisma.sql`
      SELECT
        t.isRecurring,
        SUM(ABS(t.amount)) AS total,
        COUNT(*)           AS count
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      WHERE ubc.userId   = ${userId}
        AND t.deletedAt  IS NULL
        AND t.amount     < 0
        AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
        ${accountClause}
      GROUP BY t.isRecurring
    `);

    let recurringTotal = 0, recurringCount = 0;
    let oneOffTotal = 0, oneOffCount = 0;

    for (const r of rows) {
      const isRec = r.isRecurring === 1 || r.isRecurring === true;
      if (isRec) {
        recurringTotal = toNum(r.total);
        recurringCount = toNum(r.count);
      } else {
        oneOffTotal = toNum(r.total);
        oneOffCount = toNum(r.count);
      }
    }

    const grandTotal = recurringTotal + oneOffTotal;
    const pct = (n: number) =>
      grandTotal > 0 ? Math.round((n / grandTotal) * 10000) / 100 : 0;

    return {
      recurring: { total: recurringTotal, count: recurringCount, percentage: pct(recurringTotal) },
      oneOff:    { total: oneOffTotal,    count: oneOffCount,    percentage: pct(oneOffTotal) },
    };
  }

  // ── Part D: Burn Rate ──────────────────────────────────────────────────────

  async getBurnRate(userId: string, query: DashboardQueryDto) {
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    // Current calendar month spend
    const [currentRow] = await this.prisma.$queryRaw<RawBurnRow[]>(Prisma.sql`
      SELECT COALESCE(SUM(ABS(t.amount)), 0) AS currentMonthSpend
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      WHERE ubc.userId  = ${userId}
        AND t.deletedAt IS NULL
        AND t.amount    < 0
        AND t.postedDate >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND t.postedDate <  DATE_FORMAT(DATE_ADD(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 1 MONTH), '%Y-%m-01')
        ${accountClause}
    `);

    // Previous 3 calendar months — one row per month
    const prevRows = await this.prisma.$queryRaw<RawPrevMonthRow[]>(Prisma.sql`
      SELECT
        DATE_FORMAT(t.postedDate, '%Y-%m')  AS month,
        SUM(ABS(t.amount))                  AS monthlySpend
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      WHERE ubc.userId  = ${userId}
        AND t.deletedAt IS NULL
        AND t.amount    < 0
        AND t.postedDate >= DATE_FORMAT(DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 3 MONTH), '%Y-%m-01')
        AND t.postedDate <  DATE_FORMAT(CURDATE(), '%Y-%m-01')
        ${accountClause}
      GROUP BY month
    `);

    const currentMonthSpend = toNum(currentRow?.currentMonthSpend ?? 0);
    const prevSpends = prevRows.map(r => toNum(r.monthlySpend));
    const avgPrevThreeMonths =
      prevSpends.length > 0
        ? prevSpends.reduce((s, v) => s + v, 0) / prevSpends.length
        : 0;

    let burnRateRatio: number | null = null;
    let trend: 'OVER' | 'UNDER' | 'ON_TRACK' = 'ON_TRACK';

    if (avgPrevThreeMonths > 0) {
      burnRateRatio = Math.round((currentMonthSpend / avgPrevThreeMonths) * 10000) / 10000;
      trend =
        burnRateRatio > 1.1 ? 'OVER' :
        burnRateRatio < 0.9 ? 'UNDER' :
        'ON_TRACK';
    }

    return {
      currentMonthSpend:  Math.round(currentMonthSpend * 100) / 100,
      avgPrevThreeMonths: Math.round(avgPrevThreeMonths * 100) / 100,
      burnRateRatio,
      trend,
    };
  }

  // ── Part E: Currency Exposure ──────────────────────────────────────────────

  async getCurrencyExposure(userId: string, query: DashboardQueryDto) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<RawCurrencyRow[]>(Prisma.sql`
      SELECT
        cur.code                                           AS currencyCode,
        cur.symbol,
        SUM(ABS(t.amount) * COALESCE(t.fxRateToCAD, 1.0)) AS totalCAD
      FROM \`Transaction\` t
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId        = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      INNER JOIN \`Currency\`           cur ON t.currencyId           = cur.id
      WHERE ubc.userId   = ${userId}
        AND t.deletedAt  IS NULL
        AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
        ${accountClause}
      GROUP BY cur.code, cur.symbol
      ORDER BY totalCAD DESC
    `);

    const grandTotal = rows.reduce((s, r) => s + toNum(r.totalCAD), 0);

    return rows.map(r => ({
      currencyCode: r.currencyCode,
      symbol:       r.symbol,
      totalCAD:     Math.round(toNum(r.totalCAD) * 100) / 100,
      percentage:   grandTotal > 0 ? Math.round((toNum(r.totalCAD) / grandTotal) * 10000) / 100 : 0,
    }));
  }

  // ── Part E: Tags ───────────────────────────────────────────────────────────

  async getTags(userId: string, query: DashboardQueryDto, tag?: string) {
    const { fromDate, toDate } = resolveDateRange(query.from, query.to);
    const accountClause = query.bankAccountId
      ? Prisma.sql`AND t.bankAccountId = ${query.bankAccountId}`
      : Prisma.empty;

    if (!tag) {
      // All tags with total spend and transaction count
      const rows = await this.prisma.$queryRaw<RawTagSummaryRow[]>(Prisma.sql`
        SELECT
          tt.tag,
          SUM(ABS(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)) AS totalSpend,
          COUNT(DISTINCT t.id)                                        AS transactionCount
        FROM \`TransactionTag\` tt
        INNER JOIN \`Transaction\`       t   ON tt.transactionId       = t.id
        INNER JOIN \`BankAccount\`       ba  ON t.bankAccountId        = ba.id
        INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
        WHERE ubc.userId   = ${userId}
          AND t.deletedAt  IS NULL
          AND tt.deletedAt IS NULL
          AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
          ${accountClause}
        GROUP BY tt.tag
        ORDER BY totalSpend DESC
      `);

      return rows.map(r => ({
        tag:              r.tag,
        totalSpend:       toNum(r.totalSpend),
        transactionCount: toNum(r.transactionCount),
      }));
    }

    // Cash-flow summary for a specific tag, grouped by period
    const granularity = query.granularity ?? 'monthly';
    const periodExpr =
      granularity === 'weekly'
        ? Prisma.sql`DATE_FORMAT(DATE_SUB(t.postedDate, INTERVAL WEEKDAY(t.postedDate) DAY), '%Y-%m-%d')`
        : Prisma.sql`DATE_FORMAT(t.postedDate, '%Y-%m')`;

    const rows = await this.prisma.$queryRaw<RawTagCashFlowRow[]>(Prisma.sql`
      SELECT
        ${periodExpr}                                                    AS period,
        SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END)            AS totalInflow,
        SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END)            AS totalOutflow,
        SUM(t.amount)                                                    AS netFlow
      FROM \`Transaction\` t
      INNER JOIN \`TransactionTag\`     tt  ON tt.transactionId         = t.id
      INNER JOIN \`BankAccount\`        ba  ON t.bankAccountId          = ba.id
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId  = ubc.id
      WHERE ubc.userId   = ${userId}
        AND t.deletedAt  IS NULL
        AND tt.deletedAt IS NULL
        AND tt.tag       = ${tag}
        AND t.postedDate BETWEEN ${fromDate} AND ${toDate}
        ${accountClause}
      GROUP BY period
      ORDER BY period ASC
    `);

    return rows.map(r => ({
      period:       r.period,
      totalInflow:  toNum(r.totalInflow),
      totalOutflow: toNum(r.totalOutflow),
      netFlow:      toNum(r.netFlow),
    }));
  }
}
