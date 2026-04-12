import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExchangeTokenDto {
  @ApiProperty({ example: 'public-sandbox-xxxxxxxx', description: 'One-time public token returned by Plaid Link onSuccess' })
  @IsString()
  @IsNotEmpty()
  publicToken: string;

  @ApiPropertyOptional({ example: 'ins_1', description: 'Plaid institution_id from Link onSuccess metadata' })
  @IsOptional()
  @IsString()
  institutionId?: string;

  @ApiPropertyOptional({ example: 'TD Canada Trust' })
  @IsOptional()
  @IsString()
  institutionName?: string;
}
