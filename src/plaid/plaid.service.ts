import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from 'plaid';
import { PlaidItemStatus } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  encryptToken,
  decryptToken,
  validateEncryptionKey,
} from '../common/crypto/token-cipher';
import type { ExchangeTokenDto } from './dto/exchange-token.dto';

// ── Selects ──────────────────────────────────────────────────────────────────
// Never return encrypted token fields to controllers or logs.
const PLAID_ITEM_SAFE_SELECT = {
  id: true,
  userId: true,
  userBankConnectionId: true,
  plaidItemId: true,
  institutionId: true,
  institutionName: true,
  consentExpiresAt: true,
  status: true,
  lastSyncedAt: true,
  errorCode: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} as const;

export interface SyncResult {
  accountsSynced: number;
  plaidItemId: string;
  userBankConnectionId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive a stable 5-char hex transit number from a Plaid account_id */
function toTransitNumber(plaidAccountId: string): string {
  return crypto.createHash('sha256').update(plaidAccountId).digest('hex').slice(0, 5);
}

/** Derive a stable 7-char hex account number from a Plaid account_id */
function toAccountNumber(plaidAccountId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${plaidAccountId}:acct`)
    .digest('hex')
    .slice(0, 7);
}

/** Map a Plaid account type/subtype to our AccountType.code */
function mapPlaidType(type: string, subtype: string | null): string {
  if (type === 'credit') return 'CREDIT_CARD';
  if (type === 'loan') return 'LOC';
  if (subtype === 'savings') return 'SAVINGS';
  if (subtype === 'tfsa') return 'TFSA';
  if (subtype === 'rrsp') return 'RRSP';
  if (subtype === 'fhsa') return 'FHSA';
  return 'CHEQUING';
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PlaidService implements OnModuleInit {
  private readonly logger = new Logger(PlaidService.name);
  private readonly plaidClient: PlaidApi;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const env = this.configService.getOrThrow<string>('PLAID_ENV');
    const basePath = PlaidEnvironments[env as keyof typeof PlaidEnvironments];
    if (!basePath) {
      throw new Error(`Invalid PLAID_ENV value "${env}". Expected: sandbox | production`);
    }

    const configuration = new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': this.configService.getOrThrow<string>('PLAID_CLIENT_ID'),
          'PLAID-SECRET': this.configService.getOrThrow<string>('PLAID_SECRET'),
        },
      },
    });

    this.plaidClient = new PlaidApi(configuration);
  }

  /** Validate encryption key at startup — throws before any API traffic if misconfigured */
  onModuleInit(): void {
    validateEncryptionKey();
  }

  // ── Link token ─────────────────────────────────────────────────────────────

  async createLinkToken(userId: string): Promise<{ link_token: string }> {
    const products = this.configService
      .getOrThrow<string>('PLAID_PRODUCTS')
      .split(',')
      .map((p) => p.trim() as Products);

    const countryCodes = this.configService
      .getOrThrow<string>('PLAID_COUNTRY_CODES')
      .split(',')
      .map((c) => c.trim() as CountryCode);

    const response = await this.plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Finlysis',
      products,
      country_codes: countryCodes,
      language: 'en',
    });

    return { link_token: response.data.link_token };
  }

  // ── Exchange public token ──────────────────────────────────────────────────

  async exchangePublicToken(
    userId: string,
    dto: ExchangeTokenDto,
  ): Promise<SyncResult> {
    // Step 1: Return cached token for an already-connected institution
    if (dto.institutionId) {
      const existing = await this.prisma.plaidItem.findFirst({
        where: {
          userId,
          institutionId: dto.institutionId,
          status: PlaidItemStatus.ACTIVE,
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.log(`Reusing cached PlaidItem ${existing.id} for user ${userId}`);
        return this.syncAccounts(userId, existing.id);
      }
    }

    // Step 2: Exchange the one-time public token with Plaid
    const exchangeResponse = await this.plaidClient.itemPublicTokenExchange({
      public_token: dto.publicToken,
    });
    const { access_token, item_id } = exchangeResponse.data;

    // Step 3: Encrypt before any persistence
    const { ciphertext, iv, tag } = encryptToken(access_token);

    // Step 4: Upsert PlaidItem keyed on Plaid item_id
    const plaidItem = await this.prisma.plaidItem.upsert({
      where: { plaidItemId: item_id },
      create: {
        userId,
        plaidItemId: item_id,
        accessTokenEncrypted: ciphertext,
        accessTokenIv: iv,
        accessTokenTag: tag,
        institutionId: dto.institutionId ?? null,
        institutionName: dto.institutionName ?? null,
        status: PlaidItemStatus.ACTIVE,
        lastSyncedAt: new Date(),
      },
      update: {
        accessTokenEncrypted: ciphertext,
        accessTokenIv: iv,
        accessTokenTag: tag,
        institutionId: dto.institutionId ?? undefined,
        institutionName: dto.institutionName ?? undefined,
        status: PlaidItemStatus.ACTIVE,
        lastSyncedAt: new Date(),
        deletedAt: null,
        errorCode: null,
      },
    });

    // Step 5: Verify identity (best-effort), then sync accounts
    await this.verifyIdentity(userId, access_token);
    const syncResult = await this.syncAccounts(userId, plaidItem.id);

    // Step 6: Ensure PlaidItem.userBankConnectionId is set (syncAccounts writes it)
    return syncResult;
  }

  // ── Sync accounts ─────────────────────────────────────────────────────────

  async syncAccounts(userId: string, plaidItemDbId: string): Promise<SyncResult> {
    // Load the PlaidItem record separately from the access token
    const plaidItemRecord = await this.prisma.plaidItem.findFirst({
      where: { id: plaidItemDbId, userId, deletedAt: null },
    });
    if (!plaidItemRecord) {
      throw new NotFoundException('Plaid connection not found');
    }

    const accessToken = await this.resolveAccessToken(userId, plaidItemDbId);

    try {
      // Pull current accounts from Plaid
      const accountsResponse = await this.plaidClient.accountsGet({
        access_token: accessToken,
      });
      const plaidAccounts = accountsResponse.data.accounts;

      // Find matching Bank and preload lookup tables
      const bank = await this.findBankByInstitution(plaidItemRecord.institutionName);
      const [accountTypes, cad] = await Promise.all([
        this.prisma.accountType.findMany({ where: { deletedAt: null } }),
        this.prisma.currency.findFirst({ where: { code: 'CAD', deletedAt: null } }),
      ]);
      if (!cad) throw new InternalServerErrorException('CAD currency not seeded');

      // Upsert UserBankConnection (one per PlaidItem / bank pair)
      const connection = await this.prisma.userBankConnection.upsert({
        where: { externalConnectionId: plaidItemRecord.plaidItemId },
        create: {
          userId,
          bankId: bank.id,
          nickname: plaidItemRecord.institutionName ?? bank.name,
          isActive: true,
          externalConnectionId: plaidItemRecord.plaidItemId,
          consentGrantedAt: new Date(),
          consentExpiresAt: plaidItemRecord.consentExpiresAt,
        },
        update: {
          isActive: true,
          consentExpiresAt: plaidItemRecord.consentExpiresAt,
        },
      });

      // Upsert each BankAccount
      let accountsSynced = 0;
      for (const account of plaidAccounts) {
        const typeCode = mapPlaidType(
          account.type as string,
          (account.subtype as string | null) ?? null,
        );
        const accountType =
          accountTypes.find((at) => at.code === typeCode) ??
          accountTypes.find((at) => at.code === 'CHEQUING')!;

        const transitNumber = toTransitNumber(account.account_id);
        const accountNumber = toAccountNumber(account.account_id);

        await this.prisma.bankAccount.upsert({
          where: {
            transitNumber_institutionNumber_accountNumber: {
              transitNumber,
              institutionNumber: bank.institutionNumber,
              accountNumber,
            },
          },
          create: {
            userBankConnectionId: connection.id,
            accountTypeId: accountType.id,
            currencyId: cad.id,
            transitNumber,
            institutionNumber: bank.institutionNumber,
            accountNumber,
            accountNumberMasked: account.mask ? `****${account.mask}` : null,
            nickname: account.name,
            currentBalance: (account.balances.current ?? 0).toFixed(2),
            availableBalance:
              account.balances.available != null
                ? account.balances.available.toFixed(2)
                : undefined,
            balanceAsOf: new Date(),
            isActive: true,
          },
          update: {
            currentBalance: (account.balances.current ?? 0).toFixed(2),
            availableBalance:
              account.balances.available != null
                ? account.balances.available.toFixed(2)
                : undefined,
            balanceAsOf: new Date(),
            accountNumberMasked: account.mask ? `****${account.mask}` : undefined,
            nickname: account.name,
          },
        });
        accountsSynced++;
      }

      // Mark sync time and link PlaidItem → UserBankConnection
      await this.prisma.plaidItem.update({
        where: { id: plaidItemDbId },
        data: { lastSyncedAt: new Date(), userBankConnectionId: connection.id },
      });

      return {
        accountsSynced,
        plaidItemId: plaidItemRecord.plaidItemId,
        userBankConnectionId: connection.id,
      };
    } catch (error: unknown) {
      const plaidErrorCode = (error as any)?.response?.data?.error_code as
        | string
        | undefined;

      if (plaidErrorCode === 'ITEM_LOGIN_REQUIRED') {
        await this.prisma.plaidItem.update({
          where: { id: plaidItemDbId },
          data: { status: PlaidItemStatus.EXPIRED, errorCode: plaidErrorCode },
        });
        throw new UnauthorizedException('Bank re-authentication required');
      }

      // Re-throw without exposing the access token or raw Plaid error to callers
      if (error instanceof UnauthorizedException) throw error;
      throw new InternalServerErrorException('Failed to sync bank accounts');
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async disconnectItem(
    userId: string,
    plaidItemDbId: string,
  ): Promise<{ success: boolean }> {
    const plaidItem = await this.prisma.plaidItem.findFirst({
      where: { id: plaidItemDbId, userId, deletedAt: null },
    });
    if (!plaidItem) {
      throw new NotFoundException('Plaid connection not found');
    }

    const accessToken = decryptToken(
      plaidItem.accessTokenEncrypted,
      plaidItem.accessTokenIv,
      plaidItem.accessTokenTag,
    );

    // Tell Plaid to revoke the item — best-effort (local revocation always proceeds)
    try {
      await this.plaidClient.itemRemove({ access_token: accessToken });
    } catch {
      this.logger.warn(`itemRemove failed for PlaidItem ${plaidItemDbId}; revoking locally`);
    }

    await this.prisma.plaidItem.update({
      where: { id: plaidItemDbId },
      data: { status: PlaidItemStatus.REVOKED, deletedAt: new Date() },
    });

    if (plaidItem.userBankConnectionId) {
      await this.prisma.userBankConnection.update({
        where: { id: plaidItem.userBankConnectionId },
        data: { isActive: false },
      });
    }

    return { success: true };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Loads the PlaidItem, asserts it is ACTIVE and owned by userId, then decrypts the access token.
   * The returned string is a secret — callers must never log or surface it.
   */
  private async resolveAccessToken(
    userId: string,
    plaidItemDbId: string,
  ): Promise<string> {
    const plaidItem = await this.prisma.plaidItem.findFirst({
      where: { id: plaidItemDbId, userId, deletedAt: null },
    });

    if (!plaidItem) {
      throw new NotFoundException('Plaid connection not found');
    }

    if (plaidItem.status !== PlaidItemStatus.ACTIVE) {
      throw new ForbiddenException('Plaid connection is not active; re-authentication required');
    }

    return decryptToken(
      plaidItem.accessTokenEncrypted,
      plaidItem.accessTokenIv,
      plaidItem.accessTokenTag,
    );
  }

  /**
   * Calls Plaid's identity endpoint and performs a best-effort name check.
   * Never throws — identity mismatch is logged as a warning only.
   * The raw access token is never included in any log message.
   */
  private async verifyIdentity(userId: string, accessToken: string): Promise<void> {
    try {
      const response = await this.plaidClient.identityGet({ access_token: accessToken });
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) return;

      const ownerNames = response.data.accounts
        .flatMap((a) => a.owners ?? [])
        .flatMap((o) => o.names ?? [])
        .map((n) => n.toLowerCase());

      const lastNameMatch = ownerNames.some((n) =>
        n.includes(user.lastName.toLowerCase()),
      );

      if (!lastNameMatch) {
        this.logger.warn(`Identity check: last name not matched for user ${userId}`);
      }
    } catch {
      // Identity endpoint is unavailable in some Plaid products/tiers — never block on this
      this.logger.warn(`Identity verification skipped for user ${userId}`);
    }
  }

  /**
   * Finds a Bank row by matching institution name (case-insensitive LIKE).
   * Falls back to the first active bank if no name match is found.
   * Never creates new Bank rows.
   */
  private async findBankByInstitution(
    institutionName: string | null,
  ): Promise<{ id: string; name: string; institutionNumber: string }> {
    if (institutionName) {
      const bank = await this.prisma.bank.findFirst({
        where: {
          OR: [
            { name: { contains: institutionName } },
            { legalName: { contains: institutionName } },
          ],
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, name: true, institutionNumber: true },
      });
      if (bank) return bank;
    }

    const fallback = await this.prisma.bank.findFirst({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, institutionNumber: true },
    });
    if (!fallback) {
      throw new InternalServerErrorException('No active banks configured');
    }
    return fallback;
  }

  // ── Controller-safe accessors ─────────────────────────────────────────────

  /** Returns all PlaidItems for a user with token fields excluded. */
  async listItems(userId: string) {
    return this.prisma.plaidItem.findMany({
      where: { userId, deletedAt: null },
      select: PLAID_ITEM_SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}
