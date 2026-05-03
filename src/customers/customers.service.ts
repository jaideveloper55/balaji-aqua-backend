import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import {
  QueryCustomerDto,
  UpdateCustomerDto,
} from './dto/Update query customer.dto';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { CreateLedgerEntryDto } from './dto/customer-ledger.dto';
import {
  CreateCustomerPricingDto,
  UpdateCustomerPricingDto,
} from './dto/customer-pricing.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // HELPER: Generate CUS-001, CUS-002...
  private async generateCustomerCode(companyId: string): Promise<string> {
    const count = await this.prisma.customer.count({ where: { companyId } });
    return `CUS-${String(count + 1).padStart(3, '0')}`;
  }

  // CREATE — POST /customers
  async create(createCustomerDto: CreateCustomerDto, companyId: string) {
    const existing = await this.prisma.customer.findFirst({
      where: { phone: createCustomerDto.phone, companyId },
    });
    if (existing) {
      throw new ConflictException(
        `Phone ${createCustomerDto.phone} already exists`,
      );
    }
    const customerCode = await this.generateCustomerCode(companyId);
    return this.prisma.customer.create({
      data: {
        ...createCustomerDto,
        customerCode,
        companyId,
        status: 'ACTIVE',
      },
    });
  }

  // LIST — GET /customers
  async findAll(companyId: string, query: QueryCustomerDto) {
    const {
      status,
      type,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: any = { companyId };
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { customerCode: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Start of current month for the "new this month" stat
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [customers, total, outstandingAggregate, newThisMonth] =
      await Promise.all([
        this.prisma.customer.findMany({
          where,
          orderBy: { [sortBy]: sortOrder },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            customerCode: true,
            name: true,
            phone: true,
            email: true,
            type: true,
            status: true,
            outstandingBalance: true,
            deliveryFrequency: true,
            paymentMode: true,
            createdAt: true,
          },
        }),
        this.prisma.customer.count({ where }),
        // Sum + count of customers with outstanding > 0
        this.prisma.customer.aggregate({
          where: { companyId, outstandingBalance: { gt: 0 } },
          _sum: { outstandingBalance: true },
          _count: true,
        }),
        // Customers added since the 1st of this month
        this.prisma.customer.count({
          where: { companyId, createdAt: { gte: startOfMonth } },
        }),
      ]);

    const statsMap = {
      total,
      totalOutstanding: Number(
        outstandingAggregate._sum.outstandingBalance ?? 0,
      ),
      customersWithDues: outstandingAggregate._count,
      newThisMonth,
    };

    return {
      data: customers,
      stats: statsMap,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  // GET ONE — GET /customers/:id
  async findOne(id: string, companyId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
    });
    if (!customer) throw new NotFoundException(`Customer #${id} not found`);
    return customer;
  }

  // GET DETAIL — GET /customers/:id/detail
  async findDetail(id: string, companyId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
      // Include counts for the 4 stat cards at the top of detail page
      include: {
        _count: {
          select: {
            ledger: true,
            pricing: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException(`Customer #${id} not found`);

    // Calculate ledger summary stats for the header cards
    const ledgerSummary = await this.prisma.customerLedger.aggregate({
      where: { customerId: id, companyId },
      _sum: { debitAmount: true, creditAmount: true },
      _max: { entryDate: true },
      _min: { entryDate: true },
      _count: true,
    });

    // Total orders = count of INVOICE type entries only
    const totalOrders = await this.prisma.customerLedger.count({
      where: { customerId: id, companyId, entryType: 'INVOICE' },
    });

    return {
      // Basic customer info (Overview tab left panel)
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      type: customer.type,
      status: customer.status,
      // Address
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
      landmark: customer.landmark,
      // Account details (Overview tab right panel)
      deliveryFrequency: customer.deliveryFrequency,
      paymentMode: customer.paymentMode,
      notes: customer.notes,
      createdAt: customer.createdAt,

      // The 4 stat cards at the top of the detail page:
      summary: {
        totalOrders,
        outstandingBalance: customer.outstandingBalance,
        memberSince: customer.createdAt,
        lastOrderDate: ledgerSummary._max.entryDate,
      },
    };
  }

  // UPDATE — PATCH /customers/:id
  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    companyId: string,
  ) {
    await this.findOne(id, companyId);
    if (updateCustomerDto.phone) {
      const conflict = await this.prisma.customer.findFirst({
        where: { phone: updateCustomerDto.phone, companyId, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException(
          `Phone ${updateCustomerDto.phone} is already used`,
        );
      }
    }
    return this.prisma.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
  }

  // DELETE — DELETE /customers/:id
  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    await this.prisma.customer.delete({ where: { id } });
    return { message: 'Customer deleted successfully', id };
  }

  // EXPORT — GET /customers/export
  async exportCustomers(companyId: string, query: QueryCustomerDto) {
    const { status, type, search } = query;
    const where: any = { companyId };
    if (status) where.status = status;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.customer.findMany({ where, orderBy: { name: 'asc' } });
  }

  // STATS — GET /customers/stats
  async getStats(companyId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      total,
      byStatus,
      byType,
      topOutstanding,
      outstandingAggregate,
      newThisMonth,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { companyId } }),
      this.prisma.customer.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      this.prisma.customer.groupBy({
        by: ['type'],
        where: { companyId },
        _count: true,
      }),
      this.prisma.customer.findMany({
        where: { companyId, outstandingBalance: { gt: 0 } },
        orderBy: { outstandingBalance: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          customerCode: true,
          outstandingBalance: true,
        },
      }),
      this.prisma.customer.aggregate({
        where: { companyId, outstandingBalance: { gt: 0 } },
        _sum: { outstandingBalance: true },
        _count: true,
      }),
      this.prisma.customer.count({
        where: { companyId, createdAt: { gte: startOfMonth } },
      }),
    ]);

    return {
      total,
      totalOutstanding: Number(
        outstandingAggregate._sum.outstandingBalance ?? 0,
      ),
      customersWithDues: outstandingAggregate._count,
      newThisMonth,
      byStatus,
      byType,
      topOutstanding,
    };
  }

  // PRICING TAB METHODS

  // GET PRICING — GET /customers/:id/pricing
  async getPricing(customerId: string, companyId: string) {
    await this.findOne(customerId, companyId);

    const pricing = await this.prisma.customerPricing.findMany({
      where: { customerId, companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Count of active rules — "2 active price rules" shown in the tab header
    const activeCount = pricing.filter((p) => p.isActive).length;

    return { data: pricing, activeCount };
  }

  // ADD PRICING — POST /customers/:id/pricing
  async addPricing(
    customerId: string,
    dto: CreateCustomerPricingDto,
    companyId: string,
  ) {
    await this.findOne(customerId, companyId);

    // Check if an active price already exists for this product+customer combo
    const existing = await this.prisma.customerPricing.findFirst({
      where: {
        customerId,
        productId: dto.productId,
        companyId,
        isActive: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        `An active price rule already exists for this product. Deactivate it first.`,
      );
    }

    return this.prisma.customerPricing.create({
      data: {
        customerId,
        companyId,
        productId: dto.productId,
        customerPrice: dto.customerPrice,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        isActive: true,
      },
    });
  }

  // UPDATE PRICING — PATCH /customers/:id/pricing/:pricingId
  async updatePricing(
    customerId: string,
    pricingId: string,
    dto: UpdateCustomerPricingDto,
    companyId: string,
  ) {
    await this.findOne(customerId, companyId);

    const pricing = await this.prisma.customerPricing.findFirst({
      where: { id: pricingId, customerId, companyId },
    });
    if (!pricing)
      throw new NotFoundException(`Pricing rule #${pricingId} not found`);

    return this.prisma.customerPricing.update({
      where: { id: pricingId },
      data: {
        ...dto,
        effectiveFrom: dto.effectiveFrom
          ? new Date(dto.effectiveFrom)
          : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });
  }

  // DELETE PRICING — DELETE /customers/:id/pricing/:pricingId
  async deletePricing(
    customerId: string,
    pricingId: string,
    companyId: string,
  ) {
    await this.findOne(customerId, companyId);
    const pricing = await this.prisma.customerPricing.findFirst({
      where: { id: pricingId, customerId, companyId },
    });
    if (!pricing) throw new NotFoundException(`Pricing rule not found`);
    await this.prisma.customerPricing.delete({ where: { id: pricingId } });
    return { message: 'Price rule deleted', id: pricingId };
  }

  // LEDGER TAB METHODS

  // GET LEDGER — GET /customers/:id/ledger
  async getLedger(
    customerId: string,
    companyId: string,
    query: QueryLedgerDto,
  ) {
    await this.findOne(customerId, companyId);

    const { entryType, search, fromDate, toDate } = query;

    const where: any = { customerId, companyId };
    if (entryType) where.entryType = entryType;
    if (fromDate || toDate) {
      where.entryDate = {};
      if (fromDate) where.entryDate.gte = new Date(fromDate);
      if (toDate) where.entryDate.lte = new Date(toDate);
    }
    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Run ledger entries + summary totals in parallel
    const [entries, totals] = await Promise.all([
      this.prisma.customerLedger.findMany({
        where,
        orderBy: { entryDate: 'asc' },
      }),

      // Summary cards: Total Debit, Total Credit, Outstanding, Total Entries
      this.prisma.customerLedger.aggregate({
        where: { customerId, companyId },
        _sum: {
          debitAmount: true,
          creditAmount: true,
          cgst: true,
          sgst: true,
          igst: true,
        },
        _count: true,
      }),
    ]);

    const totalDebit = totals._sum.debitAmount ?? 0;
    const totalCredit = totals._sum.creditAmount ?? 0;

    return {
      // The 4 summary cards at the top of Ledger tab:
      summary: {
        totalDebit,
        totalCredit,
        outstanding: totalDebit - totalCredit,
        totalEntries: totals._count,
        // GST totals (for "With GST" toggle)
        totalCgst: totals._sum.cgst ?? 0,
        totalSgst: totals._sum.sgst ?? 0,
        totalIgst: totals._sum.igst ?? 0,
      },
      data: entries,
    };
  }

  // ADD LEDGER ENTRY — POST /customers/:id/ledger
  async addLedgerEntry(
    customerId: string,
    dto: CreateLedgerEntryDto,
    companyId: string,
  ) {
    await this.findOne(customerId, companyId);

    // Validate: must have either debit OR credit, not both zero
    if (!dto.debitAmount && !dto.creditAmount) {
      throw new BadRequestException(
        'Either debitAmount or creditAmount must be provided',
      );
    }

    // Get the current running balance to calculate the new balance
    const lastEntry = await this.prisma.customerLedger.findFirst({
      where: { customerId, companyId },
      orderBy: { entryDate: 'desc' },
      select: { balance: true },
    });

    const previousBalance = lastEntry?.balance ?? 0;
    const debit = dto.debitAmount ?? 0;
    const credit = dto.creditAmount ?? 0;
    const newBalance = previousBalance + debit - credit;
    // Balance formula: previous + debit(money owed) - credit(money received)

    // Create ledger entry
    const entry = await this.prisma.customerLedger.create({
      data: {
        customerId,
        companyId,
        entryType: dto.entryType,
        referenceNo: dto.referenceNo,
        description: dto.description,
        debitAmount: debit,
        creditAmount: credit,
        cgst: dto.cgst ?? 0,
        sgst: dto.sgst ?? 0,
        igst: dto.igst ?? 0,
        balance: newBalance,
        entryDate: new Date(dto.entryDate),
      },
    });

    // Keep customer's outstandingBalance in sync
    // This is the balance shown on the customer list page
    await this.prisma.customer.update({
      where: { id: customerId },
      data: { outstandingBalance: newBalance > 0 ? newBalance : 0 },
    });

    return entry;
  }

  // EXPORT LEDGER — GET /customers/:id/ledger/export
  async exportLedger(
    customerId: string,
    companyId: string,
    query: QueryLedgerDto,
  ) {
    await this.findOne(customerId, companyId);
    const { entryType, fromDate, toDate } = query;

    const where: any = { customerId, companyId };
    if (entryType) where.entryType = entryType;
    if (fromDate || toDate) {
      where.entryDate = {};
      if (fromDate) where.entryDate.gte = new Date(fromDate);
      if (toDate) where.entryDate.lte = new Date(toDate);
    }

    const entries = await this.prisma.customerLedger.findMany({
      where,
      orderBy: { entryDate: 'asc' },
    });

    return {
      entries,
      exportedAt: new Date(),
      totalEntries: entries.length,
      // Frontend uses exportFormat from query to decide PDF vs CSV rendering
    };
  }
}
