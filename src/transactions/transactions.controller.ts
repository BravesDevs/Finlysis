import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { ListTransactionsDto } from './dto';

@ApiTags('Transactions')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions for the authenticated user',
    description:
      'Paginated transaction list scoped to the authenticated user. ' +
      'Ordered by postedDate DESC then createdAt DESC. Limit is hard-capped at 50.',
  })
  @ApiResponse({
    status: 200,
    description: '{ data: Transaction[], meta: { page, limit, total, totalPages, hasNextPage } }',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  list(
    @CurrentUser() user: JwtPayload,
    @Query() dto: ListTransactionsDto,
  ) {
    return this.transactionsService.list(user.userId, dto);
  }
}
