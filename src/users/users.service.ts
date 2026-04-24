import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from '../common/decorators/current-user.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

// WHY as const + satisfies: Fixes TypeScript strict comparison with Role enum
const ADMIN_ALLOWED_ROLES: Role[] = [
  Role.MANAGER,
  Role.STAFF,
  Role.DELIVERY_BOY,
];
const MANAGER_ALLOWED_ROLES: Role[] = [Role.STAFF, Role.DELIVERY_BOY];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────
  async create(dto: CreateUserDto, currentUser: JwtPayload) {
    const userRole = currentUser.role as Role;

    // Step 1: Determine target company
    let targetCompanyId: string;

    if (userRole === Role.SUPER_ADMIN) {
      if (!dto.companyId) {
        throw new BadRequestException('SUPER_ADMIN must provide companyId');
      }
      targetCompanyId = dto.companyId;
    } else {
      targetCompanyId = currentUser.companyId;
    }

    // Step 2: Role permission check
    const dtoRole = dto.role as Role;

    if (userRole === Role.ADMIN && !ADMIN_ALLOWED_ROLES.includes(dtoRole)) {
      throw new ForbiddenException(
        `ADMIN can only create: ${ADMIN_ALLOWED_ROLES.join(', ')}`,
      );
    }

    if (userRole === Role.MANAGER && !MANAGER_ALLOWED_ROLES.includes(dtoRole)) {
      throw new ForbiddenException(
        `MANAGER can only create: ${MANAGER_ALLOWED_ROLES.join(', ')}`,
      );
    }

    // Step 3: Check duplicate email
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) {
      throw new ConflictException(`Email ${dto.email} already registered`);
    }

    // Step 4: Verify company exists
    const company = await this.prisma.company.findUnique({
      where: { id: targetCompanyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Step 5: Hash password + create user
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dtoRole,
        companyId: targetCompanyId,
      },
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
          select: { id: true, name: true, type: true },
        },
      },
    });

    this.logger.log(`✅ User created: ${user.email} (${user.role})`);
    return user;
  }

  // ─── FIND ALL ─────────────────────────────────────────────────────────────
  async findAll(currentUser: JwtPayload) {
    const userRole = currentUser.role as Role;

    // SUPER_ADMIN → all companies | others → own company only
    const where =
      userRole === Role.SUPER_ADMIN ? {} : { companyId: currentUser.companyId };

    return this.prisma.user.findMany({
      where,
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
          select: { id: true, name: true, type: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── FIND ONE ─────────────────────────────────────────────────────────────
  async findOne(id: string, currentUser: JwtPayload) {
    const userRole = currentUser.role as Role;

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        company: {
          select: { id: true, name: true, type: true },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Non-SUPER_ADMIN can only see users in their own company
    if (
      userRole !== Role.SUPER_ADMIN &&
      user.company.id !== currentUser.companyId
    ) {
      throw new ForbiddenException('Access denied');
    }

    return user;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateUserDto, currentUser: JwtPayload) {
    const userRole = currentUser.role as Role;

    await this.findOne(id, currentUser); // 404 if not found, 403 if wrong company

    // Prevent role escalation
    if (dto.role === Role.SUPER_ADMIN && userRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role as Role | undefined,
        isActive: dto.isActive,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    this.logger.log(`✅ User updated: ${updated.email}`);
    return updated;
  }

  // ─── CHANGE PASSWORD ──────────────────────────────────────────────────────
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    currentUser: JwtPayload,
  ) {
    const userRole = currentUser.role as Role;

    // Only own password OR SUPER_ADMIN can change anyone's
    if (id !== currentUser.sub && userRole !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You can only change your own password');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Verify current password
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Current password is incorrect');

    // Hash new password + invalidate all sessions
    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed, refreshToken: null },
    });

    this.logger.log(`✅ Password changed: ${user.email}`);
    return { message: 'Password changed successfully. Please login again.' };
  }

  // ─── DEACTIVATE ───────────────────────────────────────────────────────────
  async deactivate(id: string, currentUser: JwtPayload) {
    const user = await this.findOne(id, currentUser);

    // Cannot deactivate yourself
    if (id === currentUser.sub) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    // Cannot deactivate SUPER_ADMIN
    if ((user.role as Role) === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot deactivate SUPER_ADMIN');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false, refreshToken: null },
    });

    this.logger.log(`⚠️ User deactivated: ${user.email}`);
    return { message: `User ${user.email} deactivated successfully` };
  }
}
