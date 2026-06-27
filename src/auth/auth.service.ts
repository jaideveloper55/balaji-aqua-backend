import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import type { LoginDto } from './dto/login.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  // ─── LOGIN ────────────────────────────────────────────────────────────────
  // Anyone with credentials can log in.
  // Returns ALL companies the user has access to so the frontend can render
  // the TenantSelector (super admin sees 2, staff usually 1).
  async login(dto: LoginDto) {
    this.logger.log(`Login attempt: ${dto.email}`);

    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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

    // Generic message — no info leak about which field is wrong
    if (!user) throw new UnauthorizedException('Invalid email or password');

    if (!user.isActive)
      throw new UnauthorizedException('Account deactivated. Contact admin.');

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid)
      throw new UnauthorizedException('Invalid email or password');

    // Filter to only ACTIVE companies the user has access to
    const companies = user.userCompanies
      .map((uc) => uc.company)
      .filter((c) => c.isActive)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (companies.length === 0)
      throw new UnauthorizedException(
        'No active company access. Contact admin.',
      );

    // Default active = first company.
    // Frontend overrides from localStorage if user previously selected one.
    const activeCompany =
      companies.find((c) => c.type === 'WATER_PLANT') ?? companies[0];

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      companyIds: companies.map((c) => c.id),
      firstName: user.firstName,
      lastName: user.lastName,
    });

    await this.storeRefreshToken(user.id, tokens.refreshToken);
    this.logger.log(
      `✅ Logged in: ${user.email} — ${companies.length} company access`,
    );

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      companies, // for TenantSelector
      activeCompanyId: activeCompany.id,
      ...tokens,
    };
  }

  // ─── REFRESH ──────────────────────────────────────────────────────────────
  // React calls this silently on 401 → re-issues access token.
  async refresh(userId: string, payload: JwtPayload) {
    this.logger.log(`Token refresh: ${userId}`);

    const accessToken = this.jwtService.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        companyIds: payload.companyIds,
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET') as string,
        expiresIn: this.configService.get('JWT_ACCESS_EXPIRY') || '15m',
      },
    );

    return { message: 'Token refreshed', accessToken };
  }

  // ─── LOGOUT ───────────────────────────────────────────────────────────────
  // Wipe refreshToken from DB → next refresh attempt fails → forces re-login.
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    this.logger.log(`✅ Logged out: ${userId}`);
    return { message: 'Logged out successfully' };
  }

  // ─── ME ───────────────────────────────────────────────────────────────────
  // Fresh profile from DB — call on React app startup to rehydrate user state.
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
        userCompanies: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                type: true,
                city: true,
                state: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const companies = user.userCompanies
      .map((uc) => uc.company)
      .filter((c) => c.isActive);

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      companies,
    };
  }

  // ─── CREATE USER (Super Admin only) ───────────────────────────────────────
  // Super admin (your friend) creates ADMIN / STAFF / DELIVERY_BOY users
  // from /settings/users in the dashboard.

  async createUser(creatorId: string, dto: CreateUserDto) {
    // Verify caller is SUPER_ADMIN
    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      include: { userCompanies: true },
    });

    if (!creator || creator.role !== Role.SUPER_ADMIN)
      throw new ForbiddenException('Only super admin can create users');

    // Block creating another SUPER_ADMIN through the API — prevents
    // accidental privilege escalation. Super admin is seeded only.
    if (dto.role === Role.SUPER_ADMIN)
      throw new ForbiddenException('Cannot create another super admin');

    // Email uniqueness
    const emailExists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailExists)
      throw new ConflictException(`${dto.email} already registered`);

    // Phone uniqueness (if provided)
    if (dto.phone) {
      const phoneExists = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (phoneExists)
        throw new ConflictException(`Phone ${dto.phone} already registered`);
    }

    // Caller can only assign users to companies they themselves have access to.
    // (Defensive — for your 2-company setup the super admin has both, but
    // this scales safely if you ever add more companies.)
    const creatorCompanyIds = new Set(
      creator.userCompanies.map((uc) => uc.companyId),
    );
    const invalid = dto.companyIds.filter((id) => !creatorCompanyIds.has(id));
    if (invalid.length > 0)
      throw new ForbiddenException(
        `You don't have access to company: ${invalid.join(', ')}`,
      );

    // Verify all companies exist and are active
    const companies = await this.prisma.company.findMany({
      where: { id: { in: dto.companyIds }, isActive: true },
    });
    if (companies.length !== dto.companyIds.length)
      throw new NotFoundException(
        'One or more companies not found or inactive',
      );

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // User + company assignments in one transaction
    const newUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: dto.role,
          gender: dto.gender,
          address: dto.address,
          city: dto.city,
        },
      });

      await tx.userCompany.createMany({
        data: dto.companyIds.map((companyId) => ({
          userId: user.id,
          companyId,
        })),
      });

      return user;
    });

    this.logger.log(
      `✅ User created: ${newUser.email} (${dto.role}) by ${creator.email}`,
    );

    return {
      message: 'User created successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        companyIds: dto.companyIds,
      },
    };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  // Generate access + refresh tokens in parallel
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
