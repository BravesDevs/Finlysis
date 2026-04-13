import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardQueryDto {
  @ApiPropertyOptional({ description: 'Filter to a single bank account (UUID)' })
  @IsOptional()
  @IsUUID()
  bankAccountId?: string;

  @ApiPropertyOptional({ description: 'Start of date range (ISO 8601 date). Defaults to 90 days ago.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'End of date range (ISO 8601 date). Defaults to today.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: ['weekly', 'monthly'], description: 'Time-series grouping granularity. Defaults to monthly.' })
  @IsOptional()
  @IsIn(['weekly', 'monthly'])
  granularity?: 'weekly' | 'monthly';
}
