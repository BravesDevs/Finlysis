import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { AccountsService } from './accounts.service';

@ApiTags('Accounts')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get('balances')
  @ApiOperation({
    summary: 'Account balances for the authenticated user',
    description:
      'Returns all active bank accounts with their current and available balances, ' +
      'plus a CAD-normalised aggregate total across all accounts.',
  })
  @ApiResponse({
    status: 200,
    description: '{ accounts: BankAccountSummary[], totals: { totalCurrentBalanceCAD, totalAvailableBalanceCAD } }',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getBalances(@CurrentUser() user: JwtPayload) {
    return this.accountsService.getBalances(user.userId);
  }
}
