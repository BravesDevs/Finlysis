import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PlaidService } from './plaid.service';
import { ExchangeTokenDto, DisconnectDto } from './dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('Plaid')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('plaid')
export class PlaidController {
  constructor(private readonly plaidService: PlaidService) {}

  @Post('link-token')
  @ApiOperation({ summary: 'Create a Plaid Link token to initialise the Link flow in the client' })
  @ApiResponse({ status: 201, description: 'Returns { link_token, expiration, request_id }' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  createLinkToken(@CurrentUser() user: JwtPayload) {
    return this.plaidService.createLinkToken(user.userId);
  }

  @Post('exchange-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange the one-time public token returned by Plaid Link for a stored access token' })
  @ApiBody({ type: ExchangeTokenDto })
  @ApiResponse({ status: 200, description: 'PlaidItem row created and access token stored encrypted' })
  @ApiResponse({ status: 400, description: 'Invalid or already-used public token' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  exchangePublicToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ExchangeTokenDto,
  ) {
    return this.plaidService.exchangePublicToken(user.userId, dto);
  }

  @Post('disconnect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a connected Plaid Item and deactivate its linked bank connection' })
  @ApiBody({ type: DisconnectDto })
  @ApiResponse({ status: 200, description: 'Plaid item revoked and UserBankConnection deactivated' })
  @ApiResponse({ status: 404, description: 'PlaidItem not found or not owned by user' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  disconnect(@CurrentUser() user: JwtPayload, @Body() dto: DisconnectDto) {
    return this.plaidService.disconnectItem(user.userId, dto.plaidItemId);
  }

  @Get('items')
  @ApiOperation({ summary: 'List all connected Plaid Items for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Array of PlaidItem records (no token fields)' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  listItems(@CurrentUser() user: JwtPayload) {
    return this.plaidService.listItems(user.userId);
  }
}
