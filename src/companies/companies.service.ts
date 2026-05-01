import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import type { JwtPayload } from '../common/decorators/current-user.decorator';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────
  // SUPER_ADMIN creates a new company.
  // Normally companies come from prisma/seed.ts — this endpoint exists only
  // for future expansion (friend opens a 3rd business).
  async create(dto: CreateCompanyDto) {
    if (dto.email) {
      const exists = await this.prisma.company.findUnique({
        where: { email: dto.email },
      });
      if (exists)
        throw new ConflictException(`Email ${dto.email} already registered`);
    }

    if (dto.gstNumber) {
      const exists = await this.prisma.company.findFirst({
        where: { gstNumber: dto.gstNumber },
      });
      if (exists)
        throw new ConflictException(`GST ${dto.gstNumber} already registered`);
    }

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        type: dto.type,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        gstNumber: dto.gstNumber,
      },
    });

    this.logger.log(`✅ Company created: ${company.name} (${company.type})`);
    return company;
  }

  // ─── FIND ALL ─────────────────────────────────────────────────────────────
  // SUPER_ADMIN passes undefined → returns ALL companies
  // ADMIN passes their companyIds[] → returns only those companies
  async findAll(companyIds?: string[]) {
    return this.prisma.company.findMany({
      where: companyIds ? { id: { in: companyIds } } : undefined,
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        gstNumber: true,
        isActive: true,
        createdAt: true,
        // CHANGED: users → userCompanies (count of users with access to this company)
        _count: { select: { userCompanies: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── FIND ONE ─────────────────────────────────────────────────────────────
  // SUPER_ADMIN can view any; ADMIN can only view companies they're assigned to
  async findOne(id: string, user: JwtPayload) {
    this.assertCompanyAccess(id, user);

    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { userCompanies: true } },
      },
    });

    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateCompanyDto, user: JwtPayload) {
    this.assertCompanyAccess(id, user);

    // Verify company exists before updating
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Company ${id} not found`);

    // If email is being changed, check it's not taken by another company
    if (dto.email && dto.email !== existing.email) {
      const emailTaken = await this.prisma.company.findUnique({
        where: { email: dto.email },
      });
      if (emailTaken && emailTaken.id !== id)
        throw new ConflictException(`Email ${dto.email} already registered`);
    }

    // If GST is being changed, check uniqueness
    if (dto.gstNumber && dto.gstNumber !== existing.gstNumber) {
      const gstTaken = await this.prisma.company.findFirst({
        where: { gstNumber: dto.gstNumber, NOT: { id } },
      });
      if (gstTaken)
        throw new ConflictException(`GST ${dto.gstNumber} already registered`);
    }

    const company = await this.prisma.company.update({
      where: { id },
      data: dto,
    });

    this.logger.log(`✅ Company updated: ${company.name} by ${user.email}`);
    return company;
  }

  // ─── DEACTIVATE ───────────────────────────────────────────────────────────
  // Soft delete — sets isActive: false instead of deleting.
  // WHY: Preserves historical data (orders, invoices, customer ledger).
  // SUPER_ADMIN only (locked at controller via @Roles).
  async deactivate(id: string) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Company ${id} not found`);

    if (!existing.isActive) {
      return { message: `Company ${existing.name} is already deactivated` };
    }

    const company = await this.prisma.company.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`⚠️  Company deactivated: ${company.name}`);
    return { message: `Company ${company.name} deactivated successfully` };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────────

  // Throws ForbiddenException if user doesn't have access to this company.
  // SUPER_ADMIN bypasses (can access any company).
  private assertCompanyAccess(companyId: string, user: JwtPayload) {
    if (user.role === Role.SUPER_ADMIN) return; // bypass

    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('No access to this company');
    }
  }
}