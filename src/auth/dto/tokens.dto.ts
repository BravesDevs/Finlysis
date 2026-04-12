import { ApiProperty } from '@nestjs/swagger';

export class TokensDto {
  @ApiProperty({ description: 'Short-lived JWT for API access (Bearer token)' })
  access_token: string;

  @ApiProperty({ description: 'Long-lived JWT for refreshing the access token' })
  refresh_token: string;
}
