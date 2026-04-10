import { IsNotEmpty, IsUUID } from 'class-validator';

export class DisconnectDto {
  @IsUUID()
  @IsNotEmpty()
  plaidItemId: string;
}
