import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ─── REGISTER ─────────────────────────────────────────────────────────────
  // Creates company + ADMIN user in one atomic transaction
  async register(dto: RegisterDto) {
    // Duplicate email check
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new ConflictException(`${dto.email} already registered`);

    // Duplicate GST check (findFirst — gstNumber not @unique in schema)
    if (dto.company.gstNumber) {
      const gstExists = await this.prisma.company.findFirst({
        where: { gstNumber: dto.company.gstNumber },
      });
      if (gstExists)
        throw new ConflictException(
          `GST ${dto.company.gstNumber} already registered`,
        );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    try {
      // Both company + user created together — if one fails, both rollback
      const result = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.company.name,
            type: dto.company.type,
            phone: dto.company.phone,
            city: dto.company.city,
            state: dto.company.state,
            gstNumber: dto.company.gstNumber,
          },
        });

        const user = await tx.user.create({
          data: {
            email: dto.email,
            password: hashedPassword,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            role: Role.ADMIN,
            companyId: company.id,
          },
        });

        return { company, user };
      });

      this.logger.log(`✅ Registered: ${result.company.name}`);

      const tokens = await this.generateTokens({
        sub: result.user.id,
        email: result.user.email,
        role: result.user.role,
        companyId: result.company.id,
        companyType: result.company.type,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      });

      await this.storeRefreshToken(result.user.id, tokens.refreshToken);

      return {
        message: 'Company registered successfully',
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          role: result.user.role,
        },
        company: {
          id: result.company.id,
          name: result.company.name,
          type: result.company.type,
        },
        ...tokens,
      };
    } catch (error) {
      // Re-throw known exceptions — only wrap unknown errors
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Registration failed: ${error.message}`);
      throw new InternalServerErrorException('Registration failed. Try again.');
    }
  }

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  // Verify credentials → return access + refresh tokens
  async login(dto: LoginDto) {
    this.logger.log(`Login attempt: ${dto.email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        company: {
          select: { id: true, name: true, type: true, isActive: true },
        },
      },
    });

    // Same error for wrong email + wrong password — no info leak
    if (!user) throw new UnauthorizedException('Invalid email or password');

    if (!user.isActive)
      throw new UnauthorizedException('Account deactivated. Contact admin.');

    if (!user.company.isActive)
      throw new UnauthorizedException('Company inactive. Contact support.');

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid)
      throw new UnauthorizedException('Invalid email or password');

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      companyType: user.company.type,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    await this.storeRefreshToken(user.id, tokens.refreshToken);
    this.logger.log(`✅ Logged in: ${user.email}`);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        companyName: user.company.name,
        companyType: user.company.type,
      },
      ...tokens,
    };
  }

  // ─── REFRESH ──────────────────────────────────────────────────────────────
  // Issue new accessToken using refreshToken
  // React calls this silently when it gets a 401
  async refresh(userId: string, payload: JwtPayload) {
    this.logger.log(`Token refresh: ${userId}`);

    const accessToken = this.jwtService.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        companyId: payload.companyId,
        companyType: payload.companyType,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET') as string,
        expiresIn: '15m',
      },
    );

    return { message: 'Token refreshed', accessToken };
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  // Delete refreshToken from DB — next refresh attempt fails → forces re-login
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.logger.log(`✅ Logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  // ─── ME ───────────────────────────────────────────────────────────────────
  // Fresh profile from DB — call on React app startup
  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        company: {
          select: {
            id: true,
            name: true,
            type: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  // Generate access + refresh tokens in parallel (faster than sequential)
  private async generateTokens(payload: JwtPayload) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET') as string,
          expiresIn: this.configService.get('JWT_ACCESS_EXPIRY') || '15m',
        },
      ),
      this.jwtService.signAsync(
        { ...payload },
        {
          secret: this.configService.get<string>(
            'JWT_REFRESH_SECRET',
          ) as string,
          expiresIn: '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  // Store bcrypt hash of refreshToken — never plain text in DB
  private async storeRefreshToken(userId: string, refreshToken: string) {
    const hashed = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: hashed },
    });
  }
}
