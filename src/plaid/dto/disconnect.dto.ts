import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DisconnectDto {
  @ApiProperty({ example: 'uuid-of-plaid-item', description: 'UUID of the PlaidItem row to revoke' })
  @IsUUID()
  @IsNotEmpty()
  plaidItemId: string;
}
