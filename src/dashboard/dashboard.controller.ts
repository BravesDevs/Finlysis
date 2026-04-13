import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto';

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  // ── Part B ─────────────────────────────────────────────────────────────────

  @Get('cash-flow')
  @ApiOperation({
    summary: 'Cash-flow stacked bar data — inflows, outflows, net per period',
  })
  @ApiResponse({ status: 200, description: 'Array of period cash-flow summaries ordered ASC' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getCashFlow(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getCashFlow(user.userId, query);
  }

  @Get('cumulative-balance')
  @ApiOperation({
    summary: 'Cumulative balance area-chart data — running balance over time',
  })
  @ApiResponse({ status: 200, description: 'Array of { date, balance } ordered ASC' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getCumulativeBalance(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getCumulativeBalance(user.userId, query);
  }

  // ── Part C ─────────────────────────────────────────────────────────────────

  @Get('spending-by-category')
  @ApiOperation({
    summary: 'Spending donut chart — total and percentage per category',
  })
  @ApiResponse({ status: 200, description: 'Array of { label, total, percentage } ordered by total DESC' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getSpendingByCategory(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getSpendingByCategory(user.userId, query);
  }

  @Get('merchant-concentration')
  @ApiOperation({
    summary: 'Merchant treemap — top 20 merchants by spend volume',
  })
  @ApiResponse({ status: 200, description: 'Array of { merchantName, total, transactionCount }' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getMerchantConcentration(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getMerchantConcentration(user.userId, query);
  }

  // ── Part D ─────────────────────────────────────────────────────────────────

  @Get('recurring-vs-oneoff')
  @ApiOperation({
    summary: 'Recurring vs discretionary spending pie chart',
  })
  @ApiResponse({ status: 200, description: '{ recurring, oneOff } each with total, count, percentage' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getRecurringVsOneOff(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getRecurringVsOneOff(user.userId, query);
  }

  @Get('burn-rate')
  @ApiOperation({
    summary: 'Burn-rate gauge — current month spend vs rolling 3-month average',
  })
  @ApiResponse({
    status: 200,
    description: '{ currentMonthSpend, avgPrevThreeMonths, burnRateRatio, trend }',
  })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getBurnRate(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getBurnRate(user.userId, query);
  }

  // ── Part E ─────────────────────────────────────────────────────────────────

  @Get('currency-exposure')
  @ApiOperation({
    summary: 'Currency exposure horizontal bar — spend and balance normalised to CAD',
  })
  @ApiResponse({ status: 200, description: 'Array of { currencyCode, symbol, totalCAD, percentage }' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getCurrencyExposure(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
  ) {
    return this.dashboardService.getCurrencyExposure(user.userId, query);
  }

  @Get('tags')
  @ApiOperation({
    summary:
      'Tag cloud — all tags with spend summary, or cash-flow for a specific tag',
  })
  @ApiQuery({ name: 'tag', required: false, description: 'If provided, returns cash-flow grouped by period for that tag' })
  @ApiResponse({ status: 200, description: 'Tag summary list or period cash-flow array' })
  @ApiResponse({ status: 401, description: 'Unauthenticated' })
  getTags(
    @CurrentUser() user: JwtPayload,
    @Query() query: DashboardQueryDto,
    @Query('tag') tag?: string,
  ) {
    return this.dashboardService.getTags(user.userId, query, tag);
  }
}
