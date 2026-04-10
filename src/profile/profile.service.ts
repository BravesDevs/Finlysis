import { Injectable } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly userService: UserService) {}

  getProfile(userId: string) {
    return this.userService.findById(userId);
  }

  updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.userService.updateUser(userId, dto);
  }
}
