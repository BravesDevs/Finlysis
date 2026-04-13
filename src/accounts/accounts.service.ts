import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RawAccountRow = {
  id: string;
  nickname: string | null;
  accountNumberMasked: string | null;
  currentBalance: string | number;
  availableBalance: string | number | null;
  balanceAsOf: Date | string;
  isActive: number | boolean;
  accountTypeCode: string;
  accountTypeLabel: string;
  bankName: string | null;
  currencyCode: string;
  currencySymbol: string;
  fxRateToCAD: string | number | null;
};

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

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalances(userId: string) {
    // One query: all accounts with fx rate (correlated subquery per account) and
    // window-function totals so all arithmetic stays in the database.
    const rows = await this.prisma.$queryRaw<RawAccountRow[]>(Prisma.sql`
      SELECT
        ba.id,
        ba.nickname,
        ba.accountNumberMasked,
        ba.currentBalance,
        ba.availableBalance,
        ba.balanceAsOf,
        ba.isActive,
        at2.code                                        AS accountTypeCode,
        at2.label                                       AS accountTypeLabel,
        b.name                                          AS bankName,
        cur.code                                        AS currencyCode,
        cur.symbol                                      AS currencySymbol,
        COALESCE(
          (
            SELECT t.fxRateToCAD
            FROM   \`Transaction\` t
            WHERE  t.bankAccountId  = ba.id
              AND  t.fxRateToCAD   IS NOT NULL
              AND  t.deletedAt     IS NULL
            ORDER  BY t.postedDate DESC, t.createdAt DESC
            LIMIT  1
          ),
          1.0
        )                                               AS fxRateToCAD
      FROM \`BankAccount\`        ba
      INNER JOIN \`UserBankConnection\` ubc ON ba.userBankConnectionId = ubc.id
      INNER JOIN \`AccountType\`        at2 ON ba.accountTypeId        = at2.id
      INNER JOIN \`Currency\`           cur ON ba.currencyId           = cur.id
      LEFT  JOIN \`Bank\`               b   ON ubc.bankId              = b.id
      WHERE ubc.userId    = ${userId}
        AND ba.deletedAt  IS NULL
        AND ubc.deletedAt IS NULL
      ORDER BY ba.createdAt ASC
    `);

    let totalCurrentBalanceCAD   = 0;
    let totalAvailableBalanceCAD = 0;

    const accounts = rows.map(r => {
      const fxRate           = toNum(r.fxRateToCAD ?? 1);
      const currentBalance   = toNum(r.currentBalance);
      const availableBalance = r.availableBalance != null ? toNum(r.availableBalance) : null;

      totalCurrentBalanceCAD   += currentBalance   * fxRate;
      totalAvailableBalanceCAD += (availableBalance ?? currentBalance) * fxRate;

      return {
        id:                  r.id,
        nickname:            r.nickname,
        accountNumberMasked: r.accountNumberMasked,
        accountType: {
          code:  r.accountTypeCode,
          label: r.accountTypeLabel,
        },
        bank:             { name: r.bankName },
        currentBalance:   Math.round(currentBalance   * 100) / 100,
        availableBalance: availableBalance != null ? Math.round(availableBalance * 100) / 100 : null,
        balanceAsOf:      r.balanceAsOf,
        currency: {
          code:   r.currencyCode,
          symbol: r.currencySymbol,
        },
        isActive: r.isActive === 1 || r.isActive === true,
      };
    });

    return {
      accounts,
      totals: {
        totalCurrentBalanceCAD:   Math.round(totalCurrentBalanceCAD   * 100) / 100,
        totalAvailableBalanceCAD: Math.round(totalAvailableBalanceCAD * 100) / 100,
      },
    };
  }
}
