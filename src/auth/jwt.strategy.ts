import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
  StrategyOptionsWithoutRequest,
} from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const options: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') as string,
    };
    super(options);
  }

  async validate(payload: JwtPayload & { iat: number; exp: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            type: true,
            isActive: true,
          },
        },
      },
    });

    // User deleted after token was issued
    if (!user)
      throw new UnauthorizedException('User not found. Please login again.');

    // User deactivated by admin
    if (!user.isActive)
      throw new UnauthorizedException('Account deactivated. Contact admin.');

    // Company deactivated
    if (!user.company.isActive)
      throw new UnauthorizedException('Company account deactivated.');

    // Return value → becomes req.user → @CurrentUser() reads this
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
