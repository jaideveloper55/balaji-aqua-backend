import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DashboardSummaryDto,
  PaymentModeSliceDto,
  DueCustomerDto,
  StockRowDto,
} from './dto/dashboard-summary.dto';

interface AsOfBalance {
  balance: number;
  oldestInvoiceDate: Date | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Reconstructs every customer's outstanding balance AS OF a specific
  // date, using the Invoice and Payment tables directly — both are
  // permanent, dated records, so this is real point-in-time accounting
  // (sum of invoices minus sum of payments up to a cutoff), not a guess.
  // This single map feeds the KPI card, the risk donut, AND the
  // "Customers with Dues" list below — one source of truth, so none of
  // them can ever disagree with each other again.
  private async getAsOfBalances(
    companyId: string,
    asOfDate: Date,
  ): Promise<Map<string, AsOfBalance>> {
    const [invoiceSums, paymentSums] = await Promise.all([
      this.prisma.invoice.groupBy({
        by: ['customerId'],
        where: {
          companyId,
          customerId: { not: null },
          invoiceDate: { lte: asOfDate },
          status: { not: 'CANCELLED' },
        },
        _sum: { totalAmount: true },
        _min: { invoiceDate: true },
      }),
      this.prisma.payment.groupBy({
        by: ['customerId'],
        where: { companyId, paymentDate: { lte: asOfDate } },
        _sum: { amount: true },
      }),
    ]);

    const balances = new Map<string, AsOfBalance>();
    for (const row of invoiceSums) {
      if (!row.customerId) continue;
      balances.set(row.customerId, {
        balance: row._sum.totalAmount ?? 0,
        oldestInvoiceDate: row._min.invoiceDate,
      });
    }
    for (const row of paymentSums) {
      if (!row.customerId) continue;
      const existing = balances.get(row.customerId);
      if (existing) {
        existing.balance -= row._sum.amount ?? 0;
      } else {
        balances.set(row.customerId, {
          balance: -(row._sum.amount ?? 0),
          oldestInvoiceDate: null,
        });
      }
    }
    return balances;
  }

  async getSummary(
    companyId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<DashboardSummaryDto> {
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const isCustomRange = !!(dateFrom || dateTo);

    const periodStart = dateFrom ? new Date(dateFrom) : startOfToday;
    const periodEnd = dateTo
      ? new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1)
      : now;

    const [
      todayPayments,
      paymentModeGroups,
      totalCustomersAsOf,
      newCustomersThisMonth,
      totalProducts,
      lowStockCount,
      outOfStockCount,
      todayInvoiceAgg,
      stockProducts,
      asOfBalances,
    ] = await Promise.all([
      // 1) Collection within the period
      this.prisma.payment.aggregate({
        where: { companyId, paymentDate: { gte: periodStart, lte: periodEnd } },
        _sum: { amount: true },
        _count: true,
      }),
      // 2) Same period, grouped by payment mode
      this.prisma.payment.groupBy({
        by: ['paymentMode'],
        where: { companyId, paymentDate: { gte: periodStart, lte: periodEnd } },
        _sum: { amount: true },
      }),
      // 3) Total Customers — genuinely date-accurate now: counts customers
      // who existed by the END of the selected period (createdAt is
      // immutable, so this is a real historical count, not a live total).
      this.prisma.customer.count({
        where: { companyId, createdAt: { lte: periodEnd } },
      }),
      // 4) New customers this CALENDAR month — intentionally NOT
      // period-scoped, same as before: this always means the real current
      // month regardless of what range is picked.
      this.prisma.customer.count({
        where: { companyId, createdAt: { gte: startOfMonth } },
      }),
      // 5–7) STILL CURRENT — no stock-movement replay exists yet, so these
      // three can't be honestly reconstructed for a past date. Flagging
      // clearly rather than faking a date-scoped number.
      this.prisma.product.count({
        where: { companyId, status: { not: 'ARCHIVED' } },
      }),
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "products"
        WHERE "companyId" = ${companyId}
          AND "stock" <= "minStock"
          AND "status" <> 'ARCHIVED'
      `,
      this.prisma.product.count({
        where: { companyId, stock: { lte: 0 }, status: { not: 'ARCHIVED' } },
      }),
      // 8) Billed within the period
      this.prisma.invoice.aggregate({
        where: { companyId, invoiceDate: { gte: periodStart, lte: periodEnd } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // 9) Stock rows (lowest first) — still current, same reason as above.
      this.prisma.product.findMany({
        where: { companyId, status: { not: 'ARCHIVED' } },
        orderBy: { stock: 'asc' },
        take: 6,
        select: {
          id: true,
          sku: true,
          name: true,
          stock: true,
          minStock: true,
          unit: true,
        },
      }),
      // 10) Every customer's balance AS OF periodEnd — the one map that
      // now drives Total Outstanding, Customers with Dues, the risk
      // donut, AND the due-customers list, all consistently.
      this.getAsOfBalances(companyId, periodEnd),
    ]);

    // ---- Derive outstanding totals + risk buckets from the SAME map ----
    let totalOutstandingAsOf = 0;
    let customersWithDuesAsOf = 0;
    const buckets = { highRisk: 0, medium: 0, recent: 0 };
    const owingCustomerIds: string[] = [];

    for (const [customerId, info] of asOfBalances) {
      if (info.balance <= 0.01) continue;
      totalOutstandingAsOf += info.balance;
      customersWithDuesAsOf++;
      owingCustomerIds.push(customerId);

      const overdueDays = info.oldestInvoiceDate
        ? Math.floor(
            (periodEnd.getTime() - info.oldestInvoiceDate.getTime()) /
              86_400_000,
          )
        : 0;
      if (overdueDays > 15) buckets.highRisk += info.balance;
      else if (overdueDays >= 7) buckets.medium += info.balance;
      else buckets.recent += info.balance;
    }

    // Top 5 by as-of balance, for the "Customers with Dues" panel
    const topOwingIds = owingCustomerIds
      .sort(
        (a, b) => asOfBalances.get(b)!.balance - asOfBalances.get(a)!.balance,
      )
      .slice(0, 5);

    const topCustomerRecords = topOwingIds.length
      ? await this.prisma.customer.findMany({
          where: { id: { in: topOwingIds }, companyId },
          select: {
            id: true,
            customerCode: true,
            name: true,
            phone: true,
            type: true,
          },
        })
      : [];

    const dueCustomers: DueCustomerDto[] = topOwingIds.map((id) => {
      const c = topCustomerRecords.find((r) => r.id === id)!;
      const info = asOfBalances.get(id)!;
      const overdueDays = info.oldestInvoiceDate
        ? Math.max(
            0,
            Math.floor(
              (periodEnd.getTime() - info.oldestInvoiceDate.getTime()) /
                86_400_000,
            ),
          )
        : 0;
      return {
        id: c.id,
        name: c.name,
        customerCode: c.customerCode,
        type: c.type,
        phone: c.phone,
        outstandingBalance: info.balance,
        overdueDays,
      };
    });

    // ---- Shape into the DTO ----
    const paymentMode: PaymentModeSliceDto[] = paymentModeGroups.map((g) => ({
      name: g.paymentMode,
      value: g._sum.amount ?? 0,
    }));

    const stockRows: StockRowDto[] = stockProducts.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      stock: p.stock,
      minStock: p.minStock,
      unit: p.unit,
    }));

    return {
      kpis: {
        totalCustomers: totalCustomersAsOf,
        newThisMonth: newCustomersThisMonth,
        totalOutstanding: totalOutstandingAsOf,
        customersWithDues: customersWithDuesAsOf,
        todayCollection: todayPayments._sum.amount ?? 0,
        todayInvoices: todayInvoiceAgg._count,
        totalBilled: todayInvoiceAgg._sum.totalAmount ?? 0,
        totalProducts,
        lowStockCount: Number(lowStockCount[0]?.count ?? 0),
        outOfStockCount,
      },
      period: {
        from: periodStart.toISOString().slice(0, 10),
        to: periodEnd.toISOString().slice(0, 10),
        isCustomRange,
      },
      paymentMode,
      buckets,
      dueCustomers,
      stockRows,
    };
  }
}
