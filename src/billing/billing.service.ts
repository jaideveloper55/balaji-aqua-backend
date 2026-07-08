import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { Logger } from '@nestjs/common';
import {
  CreateInvoiceDto,
  CreatePaymentDto,
  InvoiceFilterDto,
  PaymentFilterDto,
  OutstandingFilterDto,
  DailySummaryFilterDto,
  UpdateInvoiceDto,
} from './dto/billing.dto';
import { Invoice, InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { NotificationService } from 'src/notifications/notification.service';

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

interface LineItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  // ─── HELPER: Generate Invoice Number ─────────────────────────────────────
  private async generateInvoiceNumber(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
  ): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `INV-${dateStr}-`;

    const last = await client.invoice.findFirst({
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
  private async generatePaymentNumber(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
  ): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PAY-${dateStr}-`;

    const last = await client.payment.findFirst({
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

  // ─── STOCK ALERT HELPER ───
  private async checkAndNotifyStock(
    productId: string,
    companyId: string,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId },
      include: { company: { select: { name: true } } },
    });

    if (!product) return;

    if (product.stock === 0) {
      void this.notifications
        .notifyOutOfStock({
          companyName: product.company.name,
          productName: product.name,
          sku: product.sku,
          unit: product.unit,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to send out-of-stock notification for ${product.sku}`,
            err,
          );
        });
    } else if (product.minStock > 0 && product.stock <= product.minStock) {
      void this.notifications
        .notifyLowStock({
          companyName: product.company.name,
          productName: product.name,
          sku: product.sku,
          stock: product.stock,
          minStock: product.minStock,
          unit: product.unit,
        })
        .catch((err) => {
          this.logger.error(
            `Failed to send low-stock notification for ${product.sku}`,
            err,
          );
        });
    }
  }

  // ─── HELPER: Calculate Totals ─────────────────────────────────────────────
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

  // ─── HELPER: Resolve date range from filter ──────────────────────────────
  // Returns [start-of-day, end-of-day] for either a single date or a range.
  // If neither is provided, defaults to today.
  private resolveDateRange(input: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
  }): { start: Date; end: Date; isRange: boolean } {
    // Range takes precedence
    if (input.dateFrom && input.dateTo) {
      const start = new Date(input.dateFrom);
      start.setHours(0, 0, 0, 0);
      const end = new Date(input.dateTo);
      end.setHours(23, 59, 59, 999);
      return {
        start,
        end,
        isRange: !this.isSameDay(start, end),
      };
    }

    // Single date (legacy / default)
    const base = input.date ? new Date(input.date) : new Date();
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(base);
    end.setHours(23, 59, 59, 999);
    return { start, end, isRange: false };
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  // CREATE INVOICE

  async createInvoice(
    dto: CreateInvoiceDto,
    companyId: string,
    userId: string,
    externalTx?: Prisma.TransactionClient,
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

    const { processedItems, subtotal, cgst, sgst, igst, totalAmount } =
      this.calculateTotals(dto.items, dto.gstEnabled ?? false, gstRate);

    const runInTx = async (tx: Prisma.TransactionClient) => {
      const invoiceNumber = await this.generateInvoiceNumber(tx, companyId);

      for (const item of processedItems) {
        const product = productMap.get(item.productId)!;
        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${item.quantity}`,
          );
        }
      }

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
          status: InvoiceStatus.CONFIRMED,

          items: {
            create: processedItems.map((item) => {
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
            balance: updatedForLedger!.outstandingBalance,
            entryDate: new Date(),
          },
        });
      }

      for (const item of processedItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return newInvoice;
    };

    const invoice = externalTx
      ? await runInTx(externalTx)
      : await this.prisma.$transaction(runInTx);

    for (const item of processedItems) {
      void this.checkAndNotifyStock(item.productId, companyId);
    }
    return invoice;
  }

  // LIST INVOICES

  async findAllInvoices(filters: InvoiceFilterDto, companyId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.InvoiceWhereInput = { companyId };

    if (filters.status === 'OVERDUE') {
      where.AND = [
        { balanceDue: { gt: 0 } },
        { dueDate: { lt: now } },
        { status: { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIAL] } },
      ];
    } else if (filters.status) {
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

    const [
      total,
      invoices,
      paidCount,
      pendingCount,
      partialCount,
      overdueCount,
      totalsSum,
      totalAllCount,
    ] = await Promise.all([
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
          payments: {
            orderBy: { paymentDate: 'desc' },
            select: { paymentMode: true },
          },
          _count: { select: { payments: true } },
        },
      }),
      this.prisma.invoice.count({
        where: { companyId, status: InvoiceStatus.PAID },
      }),
      this.prisma.invoice.count({
        where: { companyId, status: InvoiceStatus.CONFIRMED },
      }),
      this.prisma.invoice.count({
        where: { companyId, status: InvoiceStatus.PARTIAL },
      }),
      this.prisma.invoice.count({
        where: {
          companyId,
          balanceDue: { gt: 0 },
          dueDate: { lt: now },
          status: { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIAL] },
        },
      }),
      this.prisma.invoice.aggregate({
        where: { companyId, status: { not: InvoiceStatus.CANCELLED } },
        _sum: { totalAmount: true, balanceDue: true, paidAmount: true },
      }),
      this.prisma.invoice.count({
        where: { companyId, status: { not: InvoiceStatus.CANCELLED } },
      }),
    ]);

    return {
      data: invoices,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      stats: {
        paid: paidCount,
        pending: pendingCount,
        partial: partialCount,
        overdue: overdueCount,
        totalAll: totalAllCount,
        totalBilled: totalsSum._sum.totalAmount ?? 0,
        totalCollected: totalsSum._sum.paidAmount ?? 0,
        totalPending: totalsSum._sum.balanceDue ?? 0,
      },
    };
  }

  async updateInvoice(id: string, dto: UpdateInvoiceDto, companyId: string) {
    const invoice = await this.findInvoiceById(id, companyId);

    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled invoice');
    }

    return this.prisma.invoice.update({
      where: { id },
      data: {
        notes: dto.notes ?? invoice.notes,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : invoice.dueDate,
      },
    });
  }

  //  GET SINGLE INVOICE

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
    const invoice: Invoice | null = await this.prisma.invoice.findFirst({
      where: { id, companyId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');

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

        const updatedForLedger = await tx.customer.findUnique({
          where: { id: invoice.customerId },
          select: { outstandingBalance: true },
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
            balance: updatedForLedger!.outstandingBalance,
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

  // RECORD PAYMENT

  async createPayment(
    dto: CreatePaymentDto,
    companyId: string,
    userId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    let invoice: Invoice | null = null;

    if (dto.invoiceId) {
      invoice = await this.prisma.invoice.findFirst({
        where: { id: dto.invoiceId, companyId, customerId: dto.customerId },
      });

      if (!invoice) throw new NotFoundException('Invoice not found');

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

    let paymentNumber: string;

    await this.prisma.$transaction(async (tx) => {
      paymentNumber = await this.generatePaymentNumber(tx, companyId);

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

    return {
      message: 'Payment recorded successfully',
      paymentNumber: paymentNumber!,
    };
  }

  // LIST PAYMENTS

  async findAllPayments(filters: PaymentFilterDto, companyId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

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

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { paymentNumber: { contains: q, mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { walkInName: { contains: q, mode: 'insensitive' } },
      ];
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

  //  OUTSTANDING DUES

  async getOutstanding(filters: OutstandingFilterDto, companyId: string) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const sortBy = filters.sortBy ?? 'risk';
    const now = new Date();

    const where: Prisma.CustomerWhereInput = {
      companyId,
      outstandingBalance: { gt: 0 },
      status: 'ACTIVE',
    };

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { customerCode: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const isInMemorySort =
      sortBy === 'risk' ||
      sortBy === 'days' ||
      sortBy === 'lastPaid' ||
      sortBy === 'newest';

    const dbOrderBy: Prisma.CustomerOrderByWithRelationInput =
      sortBy === 'amount'
        ? { outstandingBalance: 'desc' }
        : { outstandingBalance: 'desc' };

    const selectShape = {
      id: true,
      name: true,
      customerCode: true,
      phone: true,
      type: true,
      outstandingBalance: true,
      ledger: {
        where: { entryType: 'PAYMENT' as const },
        orderBy: { entryDate: 'desc' as const },
        take: 1,
        select: { entryDate: true },
      },
      invoices: {
        where: {
          status: { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIAL] },
        },
        orderBy: { invoiceDate: 'asc' as const },
        select: {
          invoiceDate: true,
          invoiceNumber: true,
          balanceDue: true,
        },
      },
    } satisfies Prisma.CustomerSelect;

    const [total, customers] = await Promise.all([
      this.prisma.customer.count({ where }),
      isInMemorySort
        ? this.prisma.customer.findMany({
            where,
            orderBy: dbOrderBy,
            select: selectShape,
          })
        : this.prisma.customer.findMany({
            where,
            orderBy: dbOrderBy,
            skip,
            take: limit,
            select: selectShape,
          }),
    ]);

    //  Enrich with derived fields
    const enriched = customers.map((c) => {
      const oldestInvoice = c.invoices[0];
      const newestInvoice = c.invoices[c.invoices.length - 1];
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
        newestInvoiceDate: newestInvoice?.invoiceDate ?? null,
        oldestUnpaidInvoice: oldestInvoice
          ? {
              number: oldestInvoice.invoiceNumber,
              date: oldestInvoice.invoiceDate,
            }
          : null,
      };
    });

    let filtered = filters.risk
      ? enriched.filter((c) => c.risk === filters.risk)
      : enriched;

    if (sortBy === 'risk') {
      filtered = filtered.sort(
        (a, b) =>
          b.overdueDays * b.outstandingBalance -
          a.overdueDays * a.outstandingBalance,
      );
    } else if (sortBy === 'days') {
      filtered = filtered.sort((a, b) => b.overdueDays - a.overdueDays);
    } else if (sortBy === 'lastPaid') {
      filtered = filtered.sort((a, b) => {
        if (!a.lastPaid && !b.lastPaid) return 0;
        if (!a.lastPaid) return -1;
        if (!b.lastPaid) return 1;
        return a.lastPaid.getTime() - b.lastPaid.getTime();
      });
    } else if (sortBy === 'newest') {
      // Most recently invoiced customers first
      filtered = filtered.sort((a, b) => {
        const ad = a.newestInvoiceDate?.getTime() ?? 0;
        const bd = b.newestInvoiceDate?.getTime() ?? 0;
        return bd - ad;
      });
    }

    //  Paginate after in-memory sort
    const paginated = isInMemorySort
      ? filtered.slice(skip, skip + limit)
      : filtered;

    //  Summary stats
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
      data: paginated,
      summary: {
        totalOutstanding: summary._sum.outstandingBalance ?? 0,
        customersWithDues: summary._count,
        highRiskCount,
        avgOverdueDays: avgOverdue,
      },
      meta: {
        total: filters.risk ? filtered.length : total,
        page,
        limit,
        totalPages: Math.ceil((filters.risk ? filtered.length : total) / limit),
      },
    };
  }

  //  DAILY SUMMARY  (now accepts dateFrom/dateTo range)

  async getDailySummary(companyId: string, filters: DailySummaryFilterDto) {
    const hasDates = !!(filters.date || filters.dateFrom || filters.dateTo);
    const { start, end, isRange } = this.resolveDateRange(filters);
    const dateWhere = hasDates ? { gte: start, lte: end } : undefined;

    // Spread helpers so we apply the date filter only when we have one.
    const invoiceDateFilter = dateWhere ? { invoiceDate: dateWhere } : {};
    const paymentDateFilter = dateWhere ? { paymentDate: dateWhere } : {};
    const customerDateFilter = dateWhere ? { createdAt: dateWhere } : {};

    const [invoiceStats, paymentStats, newCustomers, topProducts, creditStats] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: {
            companyId,
            ...invoiceDateFilter,
            status: { not: InvoiceStatus.CANCELLED },
          },
          _sum: { totalAmount: true, balanceDue: true },
          _count: true,
        }),
        this.prisma.payment.groupBy({
          by: ['paymentMode'],
          where: { companyId, ...paymentDateFilter },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.customer.count({
          where: { companyId, ...customerDateFilter },
        }),
        this.prisma.invoiceItem.groupBy({
          by: ['productId', 'productName'],
          where: {
            companyId,
            invoice: {
              ...invoiceDateFilter,
              status: { not: InvoiceStatus.CANCELLED },
            },
          },
          _sum: { quantity: true, lineTotal: true },
          orderBy: { _sum: { lineTotal: 'desc' } },
          take: 5,
        }),

        this.prisma.invoice.aggregate({
          where: {
            companyId,
            ...invoiceDateFilter,
            status: { in: [InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIAL] },
            balanceDue: { gt: 0 },
          },
          _sum: { balanceDue: true, totalAmount: true },
          _count: true,
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
      period: {
        from: hasDates ? start.toISOString().slice(0, 10) : null,
        to: hasDates ? end.toISOString().slice(0, 10) : null,
        isRange,
        allTime: !hasDates,
      },

      date: hasDates ? start.toISOString().slice(0, 10) : null,
      invoices: {
        count: invoiceStats._count,
        totalBilled: invoiceStats._sum.totalAmount ?? 0,
        totalPending: invoiceStats._sum.balanceDue ?? 0,
      },
      payments: { ...payments, total: totalPaymentsReceived },

      creditSales: creditStats._sum.balanceDue ?? 0,
      creditSalesCount: creditStats._count,
      newCustomers,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: p.productName,
        quantity: p._sum.quantity ?? 0,
        revenue: p._sum.lineTotal ?? 0,
      })),
    };
  }

  // GET POS PRODUCTS

  async getPOSProducts(companyId: string, search?: string) {
    const where: Prisma.ProductWhereInput = {
      companyId,
      status: 'ACTIVE',
      stock: { gt: 0 },
      category: {
        name: 'Finished Goods',
      },
      isSellable: true,
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

  //  GET CUSTOMER PRICE

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

  // DAILY SALES REPORT
  // @Cron('* * * * *')
  @Cron('0 15 * * *')
  async sendDailySalesReport(): Promise<void> {
    this.logger.log('📊 Running daily sales report cron job...');

    try {
      // Get all companies  each company gets their own report
      const companies = await this.prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
      const todayIST = new Date().toLocaleDateString('en-CA', {
        timeZone: 'Asia/Kolkata',
      });

      for (const company of companies) {
        try {
          const summary = await this.getDailySummary(company.id, {
            date: todayIST,
          });

          // skip companies with zero activity today
          if (
            summary.invoices.count === 0 &&
            summary.newCustomers === 0 &&
            summary.payments.total === 0
          ) {
            this.logger.log(`⏭️ Skipping ${company.name} — no activity today`);
            continue;
          }

          await this.notifications.notifyDailySummary({
            companyName: company.name,
            date: new Date().toLocaleDateString('en-IN', {
              timeZone: 'Asia/Kolkata',
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }),
            totalSales: summary.invoices.totalBilled,
            totalDeliveries: summary.invoices.count,
            pendingDeliveries: summary.creditSalesCount,
            newCustomers: summary.newCustomers,
            overduePayments: Math.round(summary.creditSales),
          });

          this.logger.log(`✅ Daily report sent for ${company.name}`);
        } catch (companyError) {
          this.logger.error(
            `Failed to send report for ${company.name}: ${companyError}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Daily sales cron job failed: ${error}`);
    }
  }
}
