import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ExchangeTokenDto {
  @IsString()
  @IsNotEmpty()
  publicToken: string;

  /** Plaid institution_id from Link onSuccess metadata — used to skip re-exchange for cached items */
  @IsOptional()
  @IsString()
  institutionId?: string;

  @IsOptional()
  @IsString()
  institutionName?: string;
}
