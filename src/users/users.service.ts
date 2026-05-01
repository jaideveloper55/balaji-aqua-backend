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

// Roles each role is allowed to create.
// SUPER_ADMIN can create anything except another SUPER_ADMIN (handled in code).
// ADMIN can create staff-tier users only — not other admins.
const ADMIN_ALLOWED_ROLES: Role[] = [Role.STAFF, Role.DELIVERY_BOY];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────
  // SUPER_ADMIN → can create ADMIN/STAFF/DELIVERY_BOY in any company
  // ADMIN       → can create STAFF/DELIVERY_BOY only in companies they belong to
  async create(dto: CreateUserDto, currentUser: JwtPayload) {
    // Step 1: Block SUPER_ADMIN role escalation
    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot create SUPER_ADMIN through API');
    }

    // Step 2: ADMIN can only create staff-tier roles
    if (
      currentUser.role === Role.ADMIN &&
      !ADMIN_ALLOWED_ROLES.includes(dto.role)
    ) {
      throw new ForbiddenException(
        `ADMIN can only create: ${ADMIN_ALLOWED_ROLES.join(', ')}`,
      );
    }

    // Step 3: Validate companyIds — caller can only assign companies they themselves have access to
    if (!dto.companyIds || dto.companyIds.length === 0) {
      throw new BadRequestException('Assign at least one company');
    }

    if (currentUser.role !== Role.SUPER_ADMIN) {
      const invalid = dto.companyIds.filter(
        (id) => !currentUser.companyIds.includes(id),
      );
      if (invalid.length > 0) {
        throw new ForbiddenException(
          `You don't have access to company: ${invalid.join(', ')}`,
        );
      }
    }

    // Step 4: Check duplicate email
    const emailExists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (emailExists) {
      throw new ConflictException(`Email ${dto.email} already registered`);
    }

    // Step 5: Check duplicate phone (optional field)
    if (dto.phone) {
      const phoneExists = await this.prisma.user.findUnique({
        where: { phone: dto.phone },
      });
      if (phoneExists) {
        throw new ConflictException(`Phone ${dto.phone} already registered`);
      }
    }

    // Step 6: Verify all companies exist and are active
    const companies = await this.prisma.company.findMany({
      where: { id: { in: dto.companyIds }, isActive: true },
    });
    if (companies.length !== dto.companyIds.length) {
      throw new NotFoundException(
        'One or more companies not found or inactive',
      );
    }

    // Step 7: Hash password and create User + UserCompany rows in one transaction
    const hashedPassword = await bcrypt.hash(dto.password, 12);

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
      `✅ User created: ${newUser.email} (${newUser.role}) by ${currentUser.email}`,
    );

    // Return user with companies attached
    return this.findOne(newUser.id, currentUser);
  }

  // ─── FIND ALL ─────────────────────────────────────────────────────────────
  // SUPER_ADMIN → all users in the system
  // ADMIN       → only users who share at least one company with the caller
  async findAll(currentUser: JwtPayload) {
    const where =
      currentUser.role === Role.SUPER_ADMIN
        ? {}
        : {
            userCompanies: {
              some: {
                companyId: { in: currentUser.companyIds },
              },
            },
          };

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
        userCompanies: {
          select: {
            company: {
              select: { id: true, name: true, type: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── FIND ONE ─────────────────────────────────────────────────────────────
  async findOne(id: string, currentUser: JwtPayload) {
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
        gender: true,
        address: true,
        city: true,
        createdAt: true,
        updatedAt: true,
        userCompanies: {
          select: {
            company: {
              select: { id: true, name: true, type: true, isActive: true },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');

    // Access check: ADMIN must share at least one company with the target user
    if (currentUser.role !== Role.SUPER_ADMIN) {
      const targetCompanyIds = user.userCompanies.map((uc) => uc.company.id);
      const hasOverlap = targetCompanyIds.some((id) =>
        currentUser.companyIds.includes(id),
      );
      if (!hasOverlap) {
        throw new ForbiddenException('Access denied');
      }
    }

    return user;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateUserDto, currentUser: JwtPayload) {
    // Existence + access check
    await this.findOne(id, currentUser);

    // ─── SELF-UPDATE GUARDRAIL ──────────────────────────────────────────
    // When a user updates their OWN profile (via /me or /:id with own ID),
    // strip privileged fields. Defense-in-depth against self-promotion,
    // self-deactivation, or granting self access to other companies.
    if (id === currentUser.sub) {
      delete dto.role;
      delete dto.isActive;
      delete dto.companyIds;
    }

    // Block role escalation
    if (dto.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    }

    // ADMIN can only assign staff-tier roles
    if (
      dto.role &&
      currentUser.role === Role.ADMIN &&
      !ADMIN_ALLOWED_ROLES.includes(dto.role)
    ) {
      throw new ForbiddenException(
        `ADMIN can only assign: ${ADMIN_ALLOWED_ROLES.join(', ')}`,
      );
    }

    // If changing companyIds, validate caller has access to all of them
    if (dto.companyIds && dto.companyIds.length > 0) {
      if (currentUser.role !== Role.SUPER_ADMIN) {
        const invalid = dto.companyIds.filter(
          (cid) => !currentUser.companyIds.includes(cid),
        );
        if (invalid.length > 0) {
          throw new ForbiddenException(
            `You don't have access to company: ${invalid.join(', ')}`,
          );
        }
      }

      // Verify companies exist and are active
      const companies = await this.prisma.company.findMany({
        where: { id: { in: dto.companyIds }, isActive: true },
      });
      if (companies.length !== dto.companyIds.length) {
        throw new NotFoundException(
          'One or more companies not found or inactive',
        );
      }
    }

    // If phone is changing, check uniqueness
    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id } },
      });
      if (phoneTaken) {
        throw new ConflictException(`Phone ${dto.phone} already registered`);
      }
    }

    // Update user + (optionally) replace company assignments in a transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const userUpdate = await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: dto.role,
          gender: dto.gender,
          address: dto.address,
          city: dto.city,
          isActive: dto.isActive,
        },
      });

      // Replace company assignments only if explicitly provided
      if (dto.companyIds && dto.companyIds.length > 0) {
        await tx.userCompany.deleteMany({ where: { userId: id } });
        await tx.userCompany.createMany({
          data: dto.companyIds.map((companyId) => ({
            userId: id,
            companyId,
          })),
        });
      }

      return userUpdate;
    });

    this.logger.log(
      `✅ User updated: ${updated.email} by ${currentUser.email}`,
    );
    return this.findOne(id, currentUser);
  }

  // ─── CHANGE PASSWORD ──────────────────────────────────────────────────────
  // Users can change their OWN password.
  // SUPER_ADMIN can change anyone's (admin reset for forgotten passwords).
  async changePassword(
    id: string,
    dto: ChangePasswordDto,
    currentUser: JwtPayload,
  ) {
    const isOwnPassword = id === currentUser.sub;
    const isSuperAdmin = currentUser.role === Role.SUPER_ADMIN;

    if (!isOwnPassword && !isSuperAdmin) {
      throw new ForbiddenException('You can only change your own password');
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    // Only verify current password if user is changing their OWN password.
    // SUPER_ADMIN can reset anyone's without knowing the old one.
    if (isOwnPassword) {
      // ── ADD THIS GUARD ──
      if (!dto.currentPassword) {
        throw new BadRequestException(
          'Current password is required when changing your own password',
        );
      }

      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid) {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: { password: hashed, refreshToken: null },
    });

    this.logger.log(
      `✅ Password changed: ${user.email} by ${currentUser.email}`,
    );
    return { message: 'Password changed successfully. Please login again.' };
  }

  // ─── DEACTIVATE ───────────────────────────────────────────────────────────
  async deactivate(id: string, currentUser: JwtPayload) {
    // Existence + access check
    const user = await this.findOne(id, currentUser);

    if (id === currentUser.sub) {
      throw new BadRequestException('You cannot deactivate your own account');
    }

    if (user.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Cannot deactivate SUPER_ADMIN');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false, refreshToken: null },
    });

    this.logger.log(
      `⚠️  User deactivated: ${user.email} by ${currentUser.email}`,
    );
    return { message: `User ${user.email} deactivated successfully` };
  }
}
