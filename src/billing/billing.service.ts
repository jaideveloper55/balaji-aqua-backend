import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateInvoiceDto,
  CreatePaymentDto,
  InvoiceFilterDto,
  PaymentFilterDto,
  OutstandingFilterDto,
} from './dto/billing.dto';
import { Invoice, InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';

interface ProcessedItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxAmount: number;
  lineTotal: number;
}

interface TotalsResult {
  processedItems: ProcessedItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

// Input type for calculateTotals()
interface LineItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── HELPER: Generate Invoice Number ─────────────────────────────────────
  private async generateInvoiceNumber(companyId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INV-${dateStr}-`;

    const last = await this.prisma.invoice.findFirst({
      where: { companyId, invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });

    let nextSerial = 1;
    if (last?.invoiceNumber) {
      const lastSerial = parseInt(last.invoiceNumber.slice(prefix.length), 10);
      if (!isNaN(lastSerial)) nextSerial = lastSerial + 1;
    }

    return prefix + String(nextSerial).padStart(3, '0');
  }

  // ─── HELPER: Generate Payment Number ─────────────────────────────────────
  private async generatePaymentNumber(companyId: string): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PAY-${dateStr}-`;

    const last = await this.prisma.payment.findFirst({
      where: { companyId, paymentNumber: { startsWith: prefix } },
      orderBy: { paymentNumber: 'desc' },
      select: { paymentNumber: true },
    });

    let nextSerial = 1;
    if (last?.paymentNumber) {
      const lastSerial = parseInt(last.paymentNumber.slice(prefix.length), 10);
      if (!isNaN(lastSerial)) nextSerial = lastSerial + 1;
    }

    return prefix + String(nextSerial).padStart(3, '0');
  }

  // ─── HELPER: Calculate Totals ─────────────────────────────────────────────
  // FIX #1: Input type is LineItemInput[] (has productId), return type is TotalsResult
  // Previously: items typed as { quantity, unitPrice, discount? } — no productId
  // That caused: "Property 'productId' does not exist on type..."
  private calculateTotals(
    items: LineItemInput[],
    gstEnabled: boolean,
    gstRate: number,
  ): TotalsResult {
    let subtotal = 0;

    const processedItems: ProcessedItem[] = items.map((item) => {
      const lineBase = item.quantity * item.unitPrice;
      const discount = item.discount || 0;
      const lineAfterDiscount = lineBase - discount;
      const lineTax = gstEnabled ? (lineAfterDiscount * gstRate) / 100 : 0;
      const lineTotal = lineAfterDiscount + lineTax;

      subtotal += lineAfterDiscount;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount,
        taxAmount: parseFloat(lineTax.toFixed(2)),
        lineTotal: parseFloat(lineTotal.toFixed(2)),
      };
    });

    const totalTax = gstEnabled ? (subtotal * gstRate) / 100 : 0;
    const cgst = gstEnabled ? totalTax / 2 : 0;
    const sgst = gstEnabled ? totalTax / 2 : 0;
    const totalAmount = subtotal + totalTax;

    return {
      processedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      cgst: parseFloat(cgst.toFixed(2)),
      sgst: parseFloat(sgst.toFixed(2)),
      igst: 0,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CREATE INVOICE
  // ─────────────────────────────────────────────────────────────────────────
  async createInvoice(
    dto: CreateInvoiceDto,
    companyId: string,
    userId: string,
  ) {
    if (dto.invoiceType === InvoiceType.WALK_IN && !dto.walkInName) {
      throw new BadRequestException('Walk-in customer name is required');
    }

    if (dto.invoiceType === InvoiceType.SALE && !dto.customerId) {
      throw new BadRequestException('Customer ID is required for regular sale');
    }

    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, companyId },
      });
      if (!customer) throw new NotFoundException('Customer not found');
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, companyId, status: 'ACTIVE' },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'One or more products not found or inactive',
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));

    const gstRate = dto.gstEnabled ? (dto.gstRate ?? 18) : 0;

    // FIX #1: Pass dto.items directly — they already have productId
    const { processedItems, subtotal, cgst, sgst, igst, totalAmount } =
      this.calculateTotals(dto.items, dto.gstEnabled ?? false, gstRate);

    const invoiceNumber = await this.generateInvoiceNumber(companyId);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const newInvoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId,
          createdById: userId,
          customerId: dto.customerId ?? null,
          walkInName: dto.walkInName ?? null,
          walkInPhone: dto.walkInPhone ?? null,
          invoiceType: dto.invoiceType,
          gstEnabled: dto.gstEnabled ?? false,
          gstRate,
          notes: dto.notes,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          subtotal,
          cgst,
          sgst,
          igst,
          totalAmount,
          balanceDue: totalAmount,
          paidAmount: 0,
          status: InvoiceStatus.CONFIRMED, // FIX: use enum instead of string literal

          items: {
            create: processedItems.map((item) => {
              // FIX #1: processedItems now has productId, so no need for idx trick
              const product = productMap.get(item.productId)!;
              return {
                productId: item.productId,
                productName: product.name,
                sku: product.sku,
                unit: product.unit,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                discount: item.discount,
                taxAmount: item.taxAmount,
                lineTotal: item.lineTotal,
                companyId,
              };
            }),
          },
        },
        include: {
          items: { include: { product: true } },
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              outstandingBalance: true,
            },
          },
        },
      });

      if (dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { outstandingBalance: { increment: totalAmount } },
        });

        // Re-fetch balance AFTER the increment above
        const updatedForLedger = await tx.customer.findUnique({
          where: { id: dto.customerId },
          select: { outstandingBalance: true },
        });

        await tx.customerLedger.create({
          data: {
            customerId: dto.customerId,
            companyId,
            entryType: 'INVOICE',
            referenceNo: invoiceNumber,
            description: `Invoice ${invoiceNumber}`,
            debitAmount: totalAmount,
            creditAmount: 0,

            cgst,
            sgst,
            igst,
            // FIX: use updatedForLedger (non-null assert after findUnique)
            balance: updatedForLedger!.outstandingBalance,
            entryDate: new Date(),
          },
        });
      }

      // Stock reduction — sequential is fine inside a transaction
      for (const item of processedItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return newInvoice;
    });

    return invoice;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. LIST INVOICES
  // ─────────────────────────────────────────────────────────────────────────
  async findAllInvoices(filters: InvoiceFilterDto, companyId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    // FIX: Use Prisma.InvoiceWhereInput instead of `any`
    // This gives full TypeScript autocomplete and type safety on where clauses
    const where: Prisma.InvoiceWhereInput = { companyId };

    if (filters.status) {
      where.status = filters.status as InvoiceStatus;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.dateFrom || filters.dateTo) {
      where.invoiceDate = {};
      if (filters.dateFrom) {
        where.invoiceDate = {
          ...(where.invoiceDate as object),
          gte: new Date(filters.dateFrom),
        };
      }
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.invoiceDate = {
          ...(where.invoiceDate as object),
          lte: endDate,
        };
      }
    }

    if (filters.search) {
      where.OR = [
        { invoiceNumber: { contains: filters.search, mode: 'insensitive' } },
        {
          customer: { name: { contains: filters.search, mode: 'insensitive' } },
        },
        { walkInName: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [total, invoices] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              type: true,
              customerCode: true,
            },
          },
          items: {
            include: { product: { select: { name: true, sku: true } } },
          },
          _count: { select: { payments: true } },
        },
      }),
    ]);

    return {
      data: invoices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GET SINGLE INVOICE
  // ─────────────────────────────────────────────────────────────────────────
  async findInvoiceById(id: string, companyId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, unit: true },
            },
          },
        },
        payments: { orderBy: { paymentDate: 'desc' } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    return invoice;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. CANCEL INVOICE
  // ─────────────────────────────────────────────────────────────────────────
  async cancelInvoice(id: string, companyId: string) {
    // FIX #2: Typed explicitly so TS knows it's Invoice | null, not `null`
    // Previously: `let invoice = null` → TS inferred type `null` forever
    // Then when we assigned from findFirst(), it conflicted → "not assignable to null"
    const invoice: Invoice | null = await this.prisma.invoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

    // After the null check above, TS now knows invoice is Invoice (not null)
    // So invoice.status, invoice.balanceDue etc. all work ✓
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice already cancelled');
    }
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot cancel a paid invoice');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: { status: InvoiceStatus.CANCELLED, balanceDue: 0 },
      });

      if (invoice.customerId) {
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { outstandingBalance: { decrement: invoice.balanceDue } },
        });

        await tx.customerLedger.create({
          data: {
            customerId: invoice.customerId,
            companyId,
            entryType: 'CREDIT_NOTE',
            referenceNo: invoice.invoiceNumber,
            description: `Cancellation of ${invoice.invoiceNumber}`,
            debitAmount: 0,
            creditAmount: invoice.balanceDue,
            balance: 0,
            entryDate: new Date(),
          },
        });
      }

      const items = await tx.invoiceItem.findMany({ where: { invoiceId: id } });
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    return {
      message: `Invoice ${invoice.invoiceNumber} cancelled successfully`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. RECORD PAYMENT
  // ─────────────────────────────────────────────────────────────────────────
  async createPayment(
    dto: CreatePaymentDto,
    companyId: string,
    userId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // FIX #2: Type as Invoice | null explicitly
    // Previously: `let invoice = null` → TS never updated the type when assigned below
    // Result: invoice.status etc. gave "Property does not exist on type 'never'"
    let invoice: Invoice | null = null;

    if (dto.invoiceId) {
      invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, companyId, customerId: dto.customerId },
      });

      // After assignment, TS knows invoice is Invoice | null
      // The null check below narrows it to Invoice
      if (!invoice) throw new NotFoundException('Invoice not found');

      // Now invoice is Invoice — all properties accessible ✓
      if (invoice.status === InvoiceStatus.PAID) {
        throw new BadRequestException('Invoice is already fully paid');
      }
      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Cannot pay a cancelled invoice');
      }
      if (dto.amount > invoice.balanceDue + 0.01) {
        throw new BadRequestException(
          `Payment amount (₹${dto.amount}) exceeds balance due (₹${invoice.balanceDue})`,
        );
      }
    }

    const paymentNumber = await this.generatePaymentNumber(companyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          paymentNumber,
          customerId: dto.customerId,
          invoiceId: dto.invoiceId ?? null,
          companyId,
          createdById: userId,
          amount: dto.amount,
          paymentMode: dto.paymentMode,
          referenceId: dto.referenceId,
          notes: dto.notes,
          paymentDate: dto.paymentDate ? new Date(dto.paymentDate) : new Date(),
        },
      });

      // FIX #3: invoice might be null here if no invoiceId was provided
      // Use `invoice !== null` check (not just `if (invoice)`) for clarity
      if (invoice !== null) {
        const newPaid = invoice.paidAmount + dto.amount;
        const newBalance = invoice.totalAmount - newPaid;
        const newStatus =
          newBalance <= 0.01 ? InvoiceStatus.PAID : InvoiceStatus.PARTIAL;

        await tx.invoice.update({
          where: { id: dto.invoiceId! },
          data: {
            paidAmount: newPaid,
            balanceDue: Math.max(0, newBalance),
            status: newStatus,
          },
        });
      }

      await tx.customer.update({
        where: { id: dto.customerId },
        data: { outstandingBalance: { decrement: dto.amount } },
      });

      // Re-fetch after decrement to get accurate balance for ledger
      const updatedCustomer = await tx.customer.findUnique({
        where: { id: dto.customerId },
        select: { outstandingBalance: true },
      });

      await tx.customerLedger.create({
        data: {
          customerId: dto.customerId,
          companyId,
          entryType: 'PAYMENT',
          paymentMode: dto.paymentMode,
          referenceNo: paymentNumber,
          description: invoice
            ? `Payment against ${invoice.invoiceNumber}`
            : 'Payment against outstanding balance',
          debitAmount: 0,
          creditAmount: dto.amount,
          balance: updatedCustomer!.outstandingBalance,
          entryDate: new Date(),
        },
      });
    });

    return { message: 'Payment recorded successfully', paymentNumber };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. LIST PAYMENTS
  // ─────────────────────────────────────────────────────────────────────────
  async findAllPayments(filters: PaymentFilterDto, companyId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    // FIX: Use Prisma.PaymentWhereInput instead of `any`
    const where: Prisma.PaymentWhereInput = { companyId };

    if (filters.paymentMode) where.paymentMode = filters.paymentMode as any;
    if (filters.customerId) where.customerId = filters.customerId;

    if (filters.dateFrom || filters.dateTo) {
      const dateFilter: Prisma.DateTimeFilter = {};
      if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const end = new Date(filters.dateTo);
        end.setHours(23, 59, 59, 999);
        dateFilter.lte = end;
      }
      where.paymentDate = dateFilter;
    }

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          invoice: {
            select: { id: true, invoiceNumber: true, totalAmount: true },
          },
        },
      }),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const todayByMode = await this.prisma.payment.groupBy({
      by: ['paymentMode'],
      where: { companyId, paymentDate: { gte: todayStart, lte: todayEnd } },
      _sum: { amount: true },
      _count: true,
    });

    const todaySummary = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      CREDIT: 0,
      total: 0,
      count: 0,
    };
    todayByMode.forEach((row) => {
      const key = row.paymentMode as keyof typeof todaySummary;
      if (key in todaySummary) {
        (todaySummary[key] as number) = row._sum.amount ?? 0;
      }
      todaySummary.total += row._sum.amount ?? 0;
      todaySummary.count += row._count;
    });

    return {
      data: payments,
      todaySummary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. OUTSTANDING DUES
  // ─────────────────────────────────────────────────────────────────────────
  async getOutstanding(filters: OutstandingFilterDto, companyId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    // FIX: Use Prisma.CustomerWhereInput instead of `any`
    const where: Prisma.CustomerWhereInput = {
      companyId,
      outstandingBalance: { gt: 0 },
      status: 'ACTIVE',
    };

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { outstandingBalance: 'desc' },
        select: {
          id: true,
          name: true,
          customerCode: true,
          phone: true,
          type: true,
          outstandingBalance: true,
          ledger: {
            where: { entryType: 'PAYMENT' },
            orderBy: { entryDate: 'desc' },
            take: 1,
            select: { entryDate: true },
          },
          invoices: {
            where: {
              status: { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIAL] },
            },
            orderBy: { invoiceDate: 'asc' },
            take: 1,
            select: {
              invoiceDate: true,
              invoiceNumber: true,
              balanceDue: true,
            },
          },
        },
      }),
    ]);

    const enriched = customers.map((c) => {
      const oldestInvoice = c.invoices[0];
      const lastPayment = c.ledger[0];

      const overdueDays = oldestInvoice
        ? Math.floor(
            (now.getTime() - oldestInvoice.invoiceDate.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 0;

      const risk =
        overdueDays > 15 ? 'HIGH' : overdueDays >= 7 ? 'MEDIUM' : 'RECENT';

      return {
        id: c.id,
        name: c.name,
        customerCode: c.customerCode,
        phone: c.phone,
        type: c.type,
        outstandingBalance: c.outstandingBalance,
        overdueDays,
        risk,
        lastPaid: lastPayment?.entryDate ?? null,
        oldestUnpaidInvoice: oldestInvoice
          ? {
              number: oldestInvoice.invoiceNumber,
              date: oldestInvoice.invoiceDate,
            }
          : null,
      };
    });

    const filtered = filters.risk
      ? enriched.filter((c) => c.risk === filters.risk)
      : enriched;

    const summary = await this.prisma.customer.aggregate({
      where: { companyId, outstandingBalance: { gt: 0 }, status: 'ACTIVE' },
      _sum: { outstandingBalance: true },
      _count: true,
    });

    const highRiskCount = enriched.filter((c) => c.risk === 'HIGH').length;
    const avgOverdue =
      enriched.length > 0
        ? Math.round(
            enriched.reduce((sum, c) => sum + c.overdueDays, 0) /
              enriched.length,
          )
        : 0;

    return {
      data: filtered,
      summary: {
        totalOutstanding: summary._sum.outstandingBalance ?? 0,
        customersWithDues: summary._count,
        highRiskCount,
        avgOverdueDays: avgOverdue,
      },
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. DAILY SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  async getDailySummary(companyId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const dateWhere = { gte: start, lte: end };

    const [invoiceStats, paymentStats, newCustomers, topProducts] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: {
            companyId,
            invoiceDate: dateWhere,
            status: { not: InvoiceStatus.CANCELLED },
          },
          _sum: { totalAmount: true, balanceDue: true },
          _count: true,
        }),
        this.prisma.payment.groupBy({
          by: ['paymentMode'],
          where: { companyId, paymentDate: dateWhere },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.customer.count({
          where: { companyId, createdAt: dateWhere },
        }),
        this.prisma.invoiceItem.groupBy({
          by: ['productId', 'productName'],
          where: {
            companyId,
            invoice: {
              invoiceDate: dateWhere,
              status: { not: InvoiceStatus.CANCELLED },
            },
          },
          _sum: { quantity: true, lineTotal: true },
          orderBy: { _sum: { lineTotal: 'desc' } },
          take: 5,
        }),
      ]);

    const payments: Record<string, number> = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      CREDIT: 0,
    };
    let totalPaymentsReceived = 0;
    paymentStats.forEach((row) => {
      payments[row.paymentMode] = row._sum.amount ?? 0;
      totalPaymentsReceived += row._sum.amount ?? 0;
    });

    return {
      date: targetDate.toISOString().slice(0, 10),
      invoices: {
        count: invoiceStats._count,
        totalBilled: invoiceStats._sum.totalAmount ?? 0,
        totalPending: invoiceStats._sum.balanceDue ?? 0,
      },
      payments: { ...payments, total: totalPaymentsReceived },
      newCustomers,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        quantity: p._sum.quantity ?? 0,
        revenue: p._sum.lineTotal ?? 0,
      })),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 9. GET POS PRODUCTS
  // ─────────────────────────────────────────────────────────────────────────
  async getPOSProducts(companyId: string, search?: string) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      status: 'ACTIVE',
      stock: { gt: 0 },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true, color: true } } },
      orderBy: { name: 'asc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 10. GET CUSTOMER PRICE
  // ─────────────────────────────────────────────────────────────────────────
  async getCustomerPrice(
    customerId: string,
    productId: string,
    companyId: string,
  ): Promise<number> {
    const now = new Date();

    const customPricing = await this.prisma.customerPricing.findFirst({
      where: {
        customerId,
        productId,
        companyId,
        isActive: true,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
    });

    if (customPricing) return customPricing.customerPrice;

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { basePrice: true },
    });

    return product?.basePrice ?? 0;
  }
}
