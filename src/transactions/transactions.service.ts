import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListTransactionsDto } from './dto';

// Fields never returned to callers
const EXCLUDED_FIELDS = {
  importBatchId: false,
  fingerprint:   false,
  deletedAt:     false,
} as const;

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, dto: ListTransactionsDto) {
    const page  = dto.page  ?? 1;
    const limit = Math.min(dto.limit ?? 50, 50); // hard cap

    const fromDate = dto.from ? new Date(dto.from) : undefined;
    const toDate   = dto.to   ? new Date(dto.to)   : undefined;
    if (toDate) toDate.setHours(23, 59, 59, 999);

    const where = {
      deletedAt: null,
      bankAccount: {
        deletedAt: null,
        userBankConnection: {
          userId,
          deletedAt: null,
        },
        ...(dto.bankAccountId ? { id: dto.bankAccountId } : {}),
      },
      ...(fromDate || toDate
        ? { postedDate: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } }
        : {}),
      ...(dto.type
        ? { transactionType: { code: dto.type } }
        : {}),
    };

    const [total, data] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ postedDate: 'desc' }, { createdAt: 'desc' }],
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id:               true,
          bankAccountId:    true,
          amount:           true,
          fxRateToCAD:      true,
          postedDate:       true,
          valueDate:        true,
          description:      true,
          merchantName:     true,
          merchantCategory: true,
          referenceNumber:  true,
          balance:          true,
          isRecurring:      true,
          isDuplicate:      true,
          categoryId:       true,
          createdAt:        true,
          updatedAt:        true,
          transactionType: {
            select: { code: true, label: true },
          },
          category: {
            select: { name: true },
          },
          currency: {
            select: { code: true, symbol: true },
          },
          bankAccount: {
            select: { accountNumberMasked: true, nickname: true },
          },
          // Excluded: importBatchId, fingerprint, deletedAt
          ...EXCLUDED_FIELDS,
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
      },
    };
  }
}
