import { Injectable } from '@nestjs/common';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class RefreshTokenStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string }): JwtPayload {
    const authHeader = req.get('authorization') ?? '';
    const refreshToken = authHeader.replace('Bearer', '').trim();
    return { userId: payload.sub, refreshToken };
  }
}

@Injectable()
export class RefreshTokenGuard extends AuthGuard('jwt-refresh') {}
