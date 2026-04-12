import { IsNotEmpty, IsUUID } from 'class-validator';

export class ImportTransactionsDto {
  @IsUUID()
  @IsNotEmpty()
  bankAccountId: string;
}
