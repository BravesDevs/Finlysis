import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('Profile')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user\'s profile' })
  @ApiResponse({ status: 200, description: 'Profile object' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.profileService.getProfile(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update the authenticated user\'s profile' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Updated profile object' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.userId, dto);
  }
}
