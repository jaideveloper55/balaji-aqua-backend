import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  private readonly logger = new Logger(CompaniesService.name);

  constructor(private prisma: PrismaService) {}

  // ─── CREATE ───────────────────────────────────────────────────────────────
  // SUPER_ADMIN creates a new company
  async create(dto: CreateCompanyDto) {
    // Check duplicate email
    if (dto.email) {
      const exists = await this.prisma.company.findUnique({
        where: { email: dto.email },
      });
      if (exists)
        throw new ConflictException(`Email ${dto.email} already registered`);
    }

    // Check duplicate GST
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
  // SUPER_ADMIN sees all companies
  // ADMIN sees only their own company
  async findAll(companyId?: string) {
    // If companyId provided → filter to that company only (ADMIN)
    // If not → return all (SUPER_ADMIN)
    return this.prisma.company.findMany({
      where: companyId ? { id: companyId } : undefined,
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
        // Count users in each company
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── FIND ONE ─────────────────────────────────────────────────────────────
  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
      },
    });

    if (!company) throw new NotFoundException(`Company ${id} not found`);
    return company;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id); // throws 404 if not found

    const company = await this.prisma.company.update({
      where: { id },
      data: dto,
    });

    this.logger.log(`✅ Company updated: ${company.name}`);
    return company;
  }

  // ─── DEACTIVATE ───────────────────────────────────────────────────────────
  // Soft delete — sets isActive: false instead of deleting
  // WHY: Preserve historical data (orders, invoices, etc.)
  async deactivate(id: string) {
    await this.findOne(id);

    const company = await this.prisma.company.update({
      where: { id },
      data: { isActive: false },
    });

    this.logger.log(`⚠️ Company deactivated: ${company.name}`);
    return { message: `Company ${company.name} deactivated successfully` };
  }
}
