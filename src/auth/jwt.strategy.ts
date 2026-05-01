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
    // CHANGED: include userCompanies (join table) instead of single company
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        userCompanies: {
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
        },
      },
    });

    // User deleted after token was issued
    if (!user)
      throw new UnauthorizedException('User not found. Please login again.');

    // User deactivated by admin
    if (!user.isActive)
      throw new UnauthorizedException('Account deactivated. Contact admin.');

    // CHANGED: collect all active companies the user has access to
    const companyIds = user.userCompanies
      .filter((uc) => uc.company.isActive)
      .map((uc) => uc.company.id);

    // Block if user has no active companies (e.g. all his companies got deactivated)
    if (companyIds.length === 0)
      throw new UnauthorizedException(
        'No active company access. Contact admin.',
      );

    // Return value → becomes req.user → @CurrentUser() reads this
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyIds,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
