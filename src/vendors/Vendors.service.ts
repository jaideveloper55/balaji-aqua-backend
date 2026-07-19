import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateVendorDto } from './dto/Create vendor.dto';
import { QueryVendorDto } from './dto/Query vendor.dto';
import { UpdateVendorDto } from './dto/Update vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ──────────────────────────────────────────────────────────────
  async create(companyId: string, dto: CreateVendorDto) {
    return this.prisma.vendor.create({
      data: {
        companyId,
        name: dto.name,
        category: dto.category,
        phone: dto.phone,
        email: dto.email ?? null,
        gstin: dto.gstin ?? null,
        notes: dto.notes ?? null,
        openingOutstanding: new Prisma.Decimal(dto.openingOutstanding ?? 0),
      },
    });
  }

  // ─── List (with paid YTD + outstanding + txn count) ──────────────────────
  async findAll(companyId: string, query: QueryVendorDto) {
    const where: Prisma.VendorWhereInput = { companyId };
    if (query.search)
      where.name = { contains: query.search, mode: 'insensitive' };
    if (query.category) where.category = query.category;
    if (query.activeOnly === 'true') where.isActive = true;

    const vendors = await this.prisma.vendor.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Paid YTD + txn count + last txn per vendor
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [paidByVendor, lastTxns] = await this.prisma.$transaction([
      this.prisma.expense.groupBy({
        by: ['vendorId'],
        where: {
          companyId,
          vendorId: { not: null },
          date: { gte: yearStart },
          status: { in: ['PAID', 'APPROVED'] },
        },
        _sum: { amount: true },
        _count: true,
        orderBy: { vendorId: 'asc' },
      }),
      this.prisma.expense.groupBy({
        by: ['vendorId'],
        where: { companyId, vendorId: { not: null } },
        _max: { date: true },
        orderBy: { vendorId: 'asc' },
      }),
    ]);

    const paidMap = new Map(
      paidByVendor.map((p) => [
        p.vendorId,
        { paid: Number(p._sum?.amount ?? 0), transactions: p._count },
      ]),
    );
    const lastMap = new Map(
      lastTxns.map((l) => [l.vendorId, l._max?.date ?? null]),
    );

    return vendors.map((v) => {
      const stat = paidMap.get(v.id) ?? { paid: 0, transactions: 0 };
      return {
        ...v,
        totalPaidYTD: stat.paid,
        transactions: stat.transactions,
        outstanding: Number(v.openingOutstanding),
        lastTransaction: lastMap.get(v.id) ?? null,
      };
    });
  }

  // ─── Stats (for vendor tab cards) ────────────────────────────────────────
  async getStats(companyId: string) {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const [count, paidAgg, outstandingAgg, withDues] =
      await this.prisma.$transaction([
        this.prisma.vendor.count({ where: { companyId, isActive: true } }),
        this.prisma.expense.aggregate({
          where: {
            companyId,
            vendorId: { not: null },
            date: { gte: yearStart },
            status: { in: ['PAID', 'APPROVED'] },
          },
          _sum: { amount: true },
        }),
        this.prisma.vendor.aggregate({
          where: { companyId },
          _sum: { openingOutstanding: true },
        }),
        this.prisma.vendor.count({
          where: { companyId, openingOutstanding: { gt: 0 } },
        }),
      ]);

    return {
      totalVendors: count,
      paidYtd: Number(paidAgg._sum.amount ?? 0),
      totalOutstanding: Number(outstandingAgg._sum.openingOutstanding ?? 0),
      needPayment: withDues,
    };
  }

  // ─── Simple list (dropdowns) ─────────────────────────────────────────────
  async listSimple(companyId: string) {
    return this.prisma.vendor.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, category: true },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Find one ────────────────────────────────────────────────────────────
  async findOne(companyId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, companyId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  async update(companyId: string, id: string, dto: UpdateVendorDto) {
    await this.findOne(companyId, id);
    const data: Prisma.VendorUpdateInput = { ...dto } as any;
    if (dto.openingOutstanding !== undefined) {
      data.openingOutstanding = new Prisma.Decimal(dto.openingOutstanding);
    }
    return this.prisma.vendor.update({ where: { id }, data });
  }

  // ─── Delete (block if expenses linked) ───────────────────────────────────
  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    const linked = await this.prisma.expense.count({
      where: { companyId, vendorId: id },
    });
    if (linked > 0) {
      throw new BadRequestException(
        `Cannot delete — ${linked} expense(s) reference this vendor.`,
      );
    }
    await this.prisma.vendor.delete({ where: { id } });
    return { message: 'Vendor deleted successfully' };
  }
}
