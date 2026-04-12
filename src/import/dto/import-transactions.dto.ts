import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImportTransactionsDto {
  @ApiProperty({ example: 'uuid-of-bank-account', description: 'UUID of the BankAccount this CSV belongs to' })
  @IsUUID()
  @IsNotEmpty()
  bankAccountId: string;
}
