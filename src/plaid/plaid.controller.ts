import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PlaidService } from './plaid.service';
import { ExchangeTokenDto, DisconnectDto } from './dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@Controller('plaid')
@UseGuards(AccessTokenGuard)
export class PlaidController {
  constructor(private readonly plaidService: PlaidService) {}

  /** Create a Plaid Link token to initialise the Link flow in the client */
  @Post('link-token')
  createLinkToken(@CurrentUser() user: JwtPayload) {
    return this.plaidService.createLinkToken(user.userId);
  }

  /** Exchange the one-time public token returned by Plaid Link */
  @Post('exchange-token')
  @HttpCode(HttpStatus.OK)
  exchangePublicToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ExchangeTokenDto,
  ) {
    return this.plaidService.exchangePublicToken(user.userId, dto);
  }

  /** Revoke a connected Plaid Item and deactivate its linked bank connection */
  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  disconnect(@CurrentUser() user: JwtPayload, @Body() dto: DisconnectDto) {
    return this.plaidService.disconnectItem(user.userId, dto.plaidItemId);
  }

  /** List all connected Plaid Items for the authenticated user (no token fields) */
  @Get('items')
  listItems(@CurrentUser() user: JwtPayload) {
    return this.plaidService.listItems(user.userId);
  }
}
