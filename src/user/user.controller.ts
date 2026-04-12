import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user\'s own record' })
  @ApiResponse({ status: 200, description: 'User object' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  getMe(@CurrentUser() user: JwtPayload) {
    return this.userService.findById(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the user', example: 'uuid-of-user' })
  @ApiResponse({ status: 200, description: 'User object' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findById(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user record' })
  @ApiParam({ name: 'id', description: 'UUID of the user', example: 'uuid-of-user' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Updated user object' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.userService.updateUser(id, dto);
  }
}
