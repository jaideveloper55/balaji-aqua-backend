import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const options: StrategyOptionsWithRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') as string,
      passReqToCallback: true as true, // ← literal true for strict TS
    };
    super(options);
  }

  async validate(req: Request, payload: any) {
    // Extract raw token — "Bearer <token>" → "<token>"
    const authHeader = req.get('Authorization');
    const refreshToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim() // slice(7) removes "Bearer " cleanly
      : null;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        company: {
          select: { id: true, type: true, isActive: true },
        },
      },
    });

    // User must exist, be active, and have a stored refresh token
    if (!user || !user.refreshToken) {
      throw new UnauthorizedException('Access denied. Please login again.');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account deactivated. Contact admin.');
    }

    // Compare raw token with bcrypt hash stored in DB
    const isValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token. Login again.');
    }

    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyType: user.company.type,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
