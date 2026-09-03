import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DashboardSummaryDto,
  PaymentModeSliceDto,
  DueCustomerDto,
  StockRowDto,
} from './dto/dashboard-summary.dto';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

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

    // True only when the caller actually passed a date filter — lets the
    // frontend decide whether to show "Today" or the literal date range.
    const isCustomRange = !!(dateFrom || dateTo);

    const periodStart = dateFrom ? new Date(dateFrom) : startOfToday;
    const periodEnd = dateTo
      ? new Date(new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1)
      : now;

    const [
      todayPayments,
      paymentModeGroups,
      customerAgg,
      customersWithDuesCount,
      totalCustomers,
      newCustomersThisMonth,
      totalProducts,
      lowStockCount,
      outOfStockCount,
      todayInvoiceAgg,
      stockProducts,
    ] = await Promise.all([
      // 1) Collection within the period (defaults to "today")
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
      // 3) Total outstanding across all customers — SNAPSHOT, not period-scoped
      this.prisma.customer.aggregate({
        where: { companyId },
        _sum: { outstandingBalance: true },
      }),
      // 4) How many customers owe money — SNAPSHOT
      this.prisma.customer.count({
        where: { companyId, outstandingBalance: { gt: 0 } },
      }),
      // 5) Total customers — SNAPSHOT
      this.prisma.customer.count({ where: { companyId } }),
      // 6) New customers this CALENDAR month — always the real current
      //    month, regardless of any export range chosen (matches the live
      //    dashboard's own "+X new this month" label literally)
      this.prisma.customer.count({
        where: { companyId, createdAt: { gte: startOfMonth } },
      }),
      // 7) Total active products — SNAPSHOT
      this.prisma.product.count({
        where: { companyId, status: { not: 'ARCHIVED' } },
      }),
      // 8) Low stock (column vs column → raw SQL) — SNAPSHOT
      this.prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*)::int AS count
        FROM "products"
        WHERE "companyId" = ${companyId}
          AND "stock" <= "minStock"
          AND "status" <> 'ARCHIVED'
      `,
      // 9) Out of stock — SNAPSHOT
      this.prisma.product.count({
        where: { companyId, stock: { lte: 0 }, status: { not: 'ARCHIVED' } },
      }),
      // 10) Billed within the period (defaults to "today")
      this.prisma.invoice.aggregate({
        where: { companyId, invoiceDate: { gte: periodStart, lte: periodEnd } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // 11) Stock rows (lowest first) — SNAPSHOT
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
    ]);

    const topCustomers = await this.prisma.customer.findMany({
      where: { companyId, outstandingBalance: { gt: 0 } },
      orderBy: { outstandingBalance: 'desc' },
      take: 5,
      select: {
        id: true,
        customerCode: true,
        name: true,
        phone: true,
        type: true,
        outstandingBalance: true,
      },
    });

    // Step 2: for just those 5 customers, find each one's OLDEST unpaid
    // invoice due date. groupBy + _min is Prisma's native way to do a
    // per-group MIN() — no raw SQL, no manual quoting, no LATERAL join.
    const oldestDueDates = await this.prisma.invoice.groupBy({
      by: ['customerId'],
      where: {
        companyId,
        customerId: { in: topCustomers.map((c) => c.id) },
        status: { in: ['CONFIRMED', 'PARTIAL'] },
      },
      _min: { dueDate: true },
    });

    // A quick lookup: customerId -> their oldest unpaid due date (if any).
    const oldestDueByCustomer = new Map(
      oldestDueDates.map((row) => [row.customerId, row._min.dueDate]),
    );

    const dueCustomers: DueCustomerDto[] = topCustomers.map((c) => {
      const oldestDue = oldestDueByCustomer.get(c.id);
      const overdueDays = oldestDue
        ? Math.max(
            0,
            Math.ceil((now.getTime() - oldestDue.getTime()) / 86_400_000),
          )
        : 0;
      return {
        id: c.id,
        name: c.name,
        customerCode: c.customerCode,
        type: c.type,
        phone: c.phone,
        outstandingBalance: c.outstandingBalance,
        overdueDays,
      };
    });

    const riskRows = await this.prisma.$queryRaw<
      {
        bucket: string;
        total: number;
      }[]
    >`
    SELECT
      CASE
        WHEN oldest.min_invoice_date < NOW() - INTERVAL '15 days'
          THEN 'highRisk'
        WHEN oldest.min_invoice_date < NOW() - INTERVAL '7 days'
          THEN 'medium'
        ELSE 'recent'
      END AS bucket,
      SUM(c."outstandingBalance") AS total
    FROM "customers" c
    JOIN LATERAL (
      SELECT MIN(i."invoiceDate") AS min_invoice_date
      FROM "invoices" i
      WHERE i."customerId" = c."id"
        AND i."status" IN ('CONFIRMED', 'PARTIAL')
    ) oldest ON true
    WHERE c."companyId" = ${companyId}
      AND c."outstandingBalance" > 0
    GROUP BY bucket
  `;
    const buckets = { highRisk: 0, medium: 0, recent: 0 };
    for (const row of riskRows) {
      const val = Number(row.total) || 0;
      if (row.bucket === 'highRisk') buckets.highRisk = val;
      else if (row.bucket === 'medium') buckets.medium = val;
      else buckets.recent = val;
    }

    // ---- Shape into the DTO (field names match the frontend) ----
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
        // Names match the `DashboardKPIs` interface in Dashboardkpicards.tsx
        totalCustomers,
        newThisMonth: newCustomersThisMonth,
        totalOutstanding: customerAgg._sum.outstandingBalance ?? 0,
        customersWithDues: customersWithDuesCount,
        todayCollection: todayPayments._sum.amount ?? 0,
        todayInvoices: todayInvoiceAgg._count,
        totalBilled: todayInvoiceAgg._sum.totalAmount ?? 0,
        totalProducts,
        lowStockCount: Number(lowStockCount[0]?.count ?? 0),
        outOfStockCount: outOfStockCount,
      },
      // Echoes back exactly what date range this response covers, so the
      // frontend can show "Today" for the default view vs the real dates
      // once the user picks a custom range — see DashboardPage.tsx.
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
