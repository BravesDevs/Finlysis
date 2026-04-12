import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { parse } from 'csv-parse';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { ImportTransactionsDto } from './dto';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedRow {
  postedDate: Date;
  description: string;
  amount: number; // signed decimal
  balance: number | null;
  referenceNumber: string | null;
}

interface RowError {
  row: number;
  reason: string;
  raw?: Record<string, string>;
}

// ─── Date parsing ────────────────────────────────────────────────────────────

function parseDate(raw: string): Date | null {
  if (!raw) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(raw + 'T00:00:00.000Z');
    return isNaN(d.getTime()) ? null : d;
  }

  // MM/DD/YYYY
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const d = new Date(`${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    // ambiguous — also tried as MM/DD above; attempt DD/MM by swapping
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00.000Z`);
    if (!isNaN(d.getTime()) && parseInt(dmy[1]) > 12) return d;
  }

  // DD-Mon-YYYY e.g. 15-Jan-2024
  const dMonY = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dMonY) {
    const d = new Date(`${dMonY[1]} ${dMonY[2]} ${dMonY[3]}`);
    return isNaN(d.getTime()) ? null : d;
  }

  // Fallback — let JS try
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  if (!raw && raw !== '0') return null;
  const cleaned = raw.replace(/[$,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ─── Column name normalisation ────────────────────────────────────────────────

function findColumn(row: Record<string, string>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const found = keys.find(k => k.toLowerCase().trim() === candidate.toLowerCase());
    if (found) return found;
  }
  return undefined;
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

function buildFingerprint(
  bankAccountId: string,
  postedDate: Date,
  amount: number,
  description: string,
): string {
  const raw = [
    bankAccountId,
    postedDate.toISOString().slice(0, 10),
    amount.toFixed(2),
    description.toLowerCase().trim(),
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

// ─── CSV row parser ───────────────────────────────────────────────────────────

function parseRow(
  row: Record<string, string>,
  rowIndex: number,
): { parsed: ParsedRow; error: null } | { parsed: null; error: RowError } {
  // ── Date ──
  const dateKey = findColumn(row, ['date', 'transaction date', 'posted date', 'posting date']);
  const rawDate = dateKey ? row[dateKey] : '';
  const postedDate = parseDate(rawDate);
  if (!postedDate) {
    return { parsed: null, error: { row: rowIndex, reason: `unparseable date: "${rawDate}"`, raw: row } };
  }

  // ── Description ──
  const descKey = findColumn(row, ['description', 'memo', 'narration', 'details', 'particulars']);
  const description = descKey ? (row[descKey] || '').trim() : '';
  if (!description) {
    return { parsed: null, error: { row: rowIndex, reason: 'missing description', raw: row } };
  }

  // ── Amount ──
  // Check for split Debit / Credit columns first
  const debitKey  = findColumn(row, ['debit',  'withdrawal', 'withdrawals']);
  const creditKey = findColumn(row, ['credit', 'deposit',    'deposits']);
  const amountKey = findColumn(row, ['amount', 'transaction amount', 'value']);

  let amount: number | null = null;

  if (debitKey !== undefined || creditKey !== undefined) {
    const debitVal  = debitKey  ? parseAmount(row[debitKey])  : null;
    const creditVal = creditKey ? parseAmount(row[creditKey]) : null;

    if (creditVal !== null && creditVal !== 0) {
      amount = Math.abs(creditVal);
    } else if (debitVal !== null && debitVal !== 0) {
      amount = -Math.abs(debitVal);
    } else {
      amount = 0;
    }
  } else if (amountKey !== undefined) {
    amount = parseAmount(row[amountKey]);
  }

  if (amount === null) {
    return { parsed: null, error: { row: rowIndex, reason: 'missing or unparseable amount', raw: row } };
  }

  if (amount === 0) {
    return { parsed: null, error: { row: rowIndex, reason: 'zero-value amount skipped', raw: row } };
  }

  // ── Balance (optional) ──
  const balanceKey = findColumn(row, ['balance', 'running balance', 'closing balance']);
  const balance = balanceKey ? parseAmount(row[balanceKey]) : null;

  // ── Reference (optional) ──
  const refKey = findColumn(row, ['reference', 'ref no', 'reference number', 'ref number', 'ref#']);
  const referenceNumber = refKey ? (row[refKey] || '').trim() || null : null;

  return {
    parsed: { postedDate, description, amount, balance, referenceNumber },
    error: null,
  };
}

// ─── CSV streaming parser ─────────────────────────────────────────────────────

async function parseCsvBuffer(buffer: Buffer): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, string>[] = [];
    const stream = Readable.from(buffer);

    stream
      .pipe(
        parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
          relax_column_count: true,
        }),
      )
      .on('data', (row: Record<string, string>) => rows.push(row))
      .on('error', reject)
      .on('end', () => resolve(rows));
  });
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Upload entry point ───────────────────────────────────────────────────

  async importTransactions(
    userId: string,
    dto: ImportTransactionsDto,
    file: Express.Multer.File,
  ): Promise<{ importBatchId: string }> {
    // Verify the BankAccount belongs to the authenticated user
    const account = await this.prisma.bankAccount.findFirst({
      where: {
        id: dto.bankAccountId,
        deletedAt: null,
        userBankConnection: { userId, deletedAt: null },
      },
    });
    if (!account) {
      throw new ForbiddenException('Bank account not found or not accessible');
    }

    // Look up ImportSource for CSV (never hard-code the ID)
    const importSource = await this.prisma.importSource.findUnique({
      where: { code: 'CSV' },
    });
    if (!importSource) {
      throw new NotFoundException('ImportSource CSV not found — run seed first');
    }

    // Create the ImportBatch record
    const batch = await this.prisma.importBatch.create({
      data: {
        userId,
        bankAccountId: dto.bankAccountId,
        importSourceId: importSource.id,
        fileName: file.originalname,
        fileSizeBytes: file.size,
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });

    // Process asynchronously — do not await
    this.processImport(batch.id, userId, dto.bankAccountId, account.currencyId, file.buffer).catch(
      async (err) => {
        await this.prisma.importBatch.update({
          where: { id: batch.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorLog: [{ row: 0, reason: String(err?.message ?? err) }],
          },
        });
      },
    );

    return { importBatchId: batch.id };
  }

  // ── Background processing ────────────────────────────────────────────────

  private async processImport(
    batchId: string,
    userId: string,
    bankAccountId: string,
    currencyId: string,
    buffer: Buffer,
  ): Promise<void> {
    const errors: RowError[] = [];
    const skipped: Array<{ row: number; reason: string }> = [];

    // Look up TransactionType codes (never hard-code IDs)
    const txTypes = await this.prisma.transactionType.findMany({
      where: { code: { in: ['DEBIT', 'CREDIT'] } },
    });
    const txTypeMap = Object.fromEntries(txTypes.map(t => [t.code, t.id]));

    // Parse all CSV rows
    let rawRows: Record<string, string>[];
    try {
      rawRows = await parseCsvBuffer(buffer);
    } catch (err) {
      await this.prisma.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorLog: [{ row: 0, reason: `CSV parse error: ${String(err?.message ?? err)}` }],
        },
      });
      return;
    }

    const totalRows = rawRows.length;
    const validRows: Array<ParsedRow & { fingerprint: string }> = [];

    // Validate every row
    for (let i = 0; i < rawRows.length; i++) {
      const rowNum = i + 1;
      const result = parseRow(rawRows[i], rowNum);
      if (result.error) {
        if (result.error.reason.startsWith('zero-value')) {
          skipped.push({ row: rowNum, reason: result.error.reason });
        } else {
          errors.push(result.error);
        }
        continue;
      }
      const fp = buildFingerprint(
        bankAccountId,
        result.parsed.postedDate,
        result.parsed.amount,
        result.parsed.description,
      );
      validRows.push({ ...result.parsed, fingerprint: fp });
    }

    // Deduplication — query existing fingerprints in one shot
    const candidateFps = validRows.map(r => r.fingerprint);
    const existingFps = new Set<string>();

    if (candidateFps.length > 0) {
      const existing = await this.prisma.transaction.findMany({
        where: { fingerprint: { in: candidateFps } },
        select: { fingerprint: true },
      });
      for (const tx of existing) {
        if (tx.fingerprint) existingFps.add(tx.fingerprint);
      }
    }

    const deduped = validRows.filter(r => {
      if (existingFps.has(r.fingerprint)) {
        skipped.push({ row: 0, reason: 'duplicate' }); // row index lost after dedup; use 0
        return false;
      }
      return true;
    });

    // Bulk insert in chunks of 500
    const CHUNK_SIZE = 500;
    let successCount = 0;

    for (let ci = 0; ci < deduped.length; ci += CHUNK_SIZE) {
      const chunk = deduped.slice(ci, ci + CHUNK_SIZE);

      const data = chunk.map(r => ({
        bankAccountId,
        transactionTypeId: r.amount > 0 ? txTypeMap['CREDIT'] : txTypeMap['DEBIT'],
        currencyId,
        amount: r.amount.toFixed(2),
        postedDate: r.postedDate,
        description: r.description,
        merchantName: r.amount < 0 ? r.description : null,
        balance: r.balance !== null ? r.balance.toFixed(2) : null,
        referenceNumber: r.referenceNumber ?? null,
        fingerprint: r.fingerprint,
        importBatchId: batchId,
        isRecurring: false,
        isDuplicate: false,
      }));

      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.transaction.createMany({ data, skipDuplicates: true });
        });
        successCount += chunk.length;
      } catch (err) {
        const chunkStartRow = ci + 1;
        for (let ri = 0; ri < chunk.length; ri++) {
          errors.push({
            row: chunkStartRow + ri,
            reason: `chunk insert failed: ${String(err?.message ?? err)}`,
          });
        }
      }
    }

    // Finalise the ImportBatch
    const errorLog: Array<{ row: number; reason: string }> = [
      ...errors.map(e => ({ row: e.row, reason: e.reason })),
      ...skipped,
    ];

    await this.prisma.importBatch.update({
      where: { id: batchId },
      data: {
        status: 'COMPLETED',
        rowCount: totalRows,
        successCount,
        skippedCount: skipped.length,
        errorCount: errors.length,
        errorLog: errorLog.length > 0 ? (errorLog as object[]) : undefined,
        completedAt: new Date(),
      },
    });
  }

  // ── List batches ─────────────────────────────────────────────────────────

  async listBatches(userId: string) {
    return this.prisma.importBatch.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        rowCount: true,
        successCount: true,
        skippedCount: true,
        errorCount: true,
        completedAt: true,
        startedAt: true,
        bankAccountId: true,
      },
    });
  }

  // ── Get single batch ─────────────────────────────────────────────────────

  async getBatch(userId: string, batchId: string) {
    const batch = await this.prisma.importBatch.findFirst({
      where: { id: batchId, userId, deletedAt: null },
    });
    if (!batch) {
      throw new NotFoundException('Import batch not found');
    }
    return batch;
  }
}
