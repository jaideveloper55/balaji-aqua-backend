import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { ExportFilterDto } from './dto/export.dto';
import { PdfHelper, PdfColumn, formatPdfCurrency } from './pdf.helper';

const MAX_EXPORT_ROWS = 10_000;

interface ExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

@Injectable()
export class ExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfHelper,
  ) {}

  // ─── HELPER: CSV row encoding (RFC 4180) ─────────────────────────────────
  private csvEscape(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (
      s.includes(',') ||
      s.includes('"') ||
      s.includes('\n') ||
      s.includes('\r')
    ) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  private toCsv(headers: string[], rows: unknown[][]): Buffer {
    const lines = [
      headers.map((h) => this.csvEscape(h)).join(','),
      ...rows.map((row) => row.map((cell) => this.csvEscape(cell)).join(',')),
    ];
    const csv = '\ufeff' + lines.join('\n');
    return Buffer.from(csv, 'utf-8');
  }

  // ─── HELPER: Date range filter ───────────────────────────────────────────
  private buildDateFilter(
    filters: ExportFilterDto,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!filters.dateFrom && !filters.dateTo) return undefined;
    const range: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) {
      const start = new Date(filters.dateFrom);
      start.setHours(0, 0, 0, 0);
      range.gte = start;
    }
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      range.lte = end;
    }
    return range;
  }

  private buildFilename(report: string, format: string): string {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    return `${report}_${ts}.${format}`;
  }

  private buildPeriodLabel(filters: ExportFilterDto): string {
    if (!filters.dateFrom && !filters.dateTo) return 'All time';
    const fmt = (d: string) =>
      new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    if (filters.dateFrom && filters.dateTo)
      return `${fmt(filters.dateFrom)} – ${fmt(filters.dateTo)}`;
    if (filters.dateFrom) return `From ${fmt(filters.dateFrom)}`;
    return `Until ${fmt(filters.dateTo!)}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. INVOICES EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  async exportInvoices(
    filters: ExportFilterDto,
    companyId: string,
  ): Promise<ExportResult> {
    const format = filters.format ?? 'csv';

    const where: Prisma.InvoiceWhereInput = {
      companyId,
      status: { not: InvoiceStatus.CANCELLED },
    };
    const dateRange = this.buildDateFilter(filters);
    if (dateRange) where.invoiceDate = dateRange;

    const count = await this.prisma.invoice.count({ where });
    if (count > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `Export too large (${count} rows). Maximum is ${MAX_EXPORT_ROWS}. Please narrow the date range.`,
      );
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      include: {
        customer: {
          select: { name: true, customerCode: true, phone: true, type: true },
        },
        payments: {
          orderBy: { paymentDate: 'desc' },
          take: 1,
          select: { paymentMode: true },
        },
      },
    });

    // ── CSV branch ───────────────────────────────────────────────────
    if (format === 'csv') {
      const headers = [
        'Invoice No',
        'Date',
        'Customer Name',
        'Customer Code',
        'Phone',
        'Type',
        'Subtotal',
        'GST (CGST+SGST)',
        'Total',
        'Paid',
        'Balance',
        'Status',
        'Payment Mode',
        'Due Date',
        'Notes',
      ];
      const rows = invoices.map((inv) => [
        inv.invoiceNumber,
        inv.invoiceDate.toISOString().slice(0, 10),
        inv.customer?.name ?? inv.walkInName ?? 'Walk-in',
        inv.customer?.customerCode ?? 'WALK-IN',
        inv.customer?.phone ?? inv.walkInPhone ?? '',
        inv.customer?.type ?? 'WALK_IN',
        inv.subtotal,
        (inv.cgst ?? 0) + (inv.sgst ?? 0),
        inv.totalAmount,
        inv.paidAmount,
        inv.balanceDue,
        inv.status,
        inv.payments[0]?.paymentMode ?? '',
        inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : '',
        inv.notes ?? '',
      ]);

      return {
        buffer: this.toCsv(headers, rows),
        filename: this.buildFilename('invoices', 'csv'),
        mimeType: 'text/csv; charset=utf-8',
      };
    }

    const columns: PdfColumn[] = [
      { header: 'Invoice No', width: 90 },
      { header: 'Date', width: 60 },
      { header: 'Customer', width: 130 },
      { header: 'Phone', width: 90 },
      { header: 'Total', width: 75, align: 'right', isCurrency: true },
      { header: 'Paid', width: 75, align: 'right', isCurrency: true },
      { header: 'Balance', width: 75, align: 'right', isCurrency: true },
      { header: 'Status', width: 75, align: 'center', isStatus: true },
      { header: 'Mode', width: 80, align: 'center' },
    ];

    const rows: (string | number)[][] = invoices.map((inv) => [
      inv.invoiceNumber,
      inv.invoiceDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      }),
      inv.customer?.name ?? inv.walkInName ?? 'Walk-in',
      inv.customer?.phone ?? inv.walkInPhone ?? '—',
      inv.totalAmount,
      inv.paidAmount,
      inv.balanceDue,
      inv.status,
      inv.payments[0]?.paymentMode ?? '—',
    ]);

    // Totals summary at the bottom
    const totalBilled = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const totalPaid = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalBalance = invoices.reduce((s, i) => s + i.balanceDue, 0);

    const buffer = await this.pdf.generate({
      title: 'Invoice Report',
      subtitle: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`,
      periodLabel: this.buildPeriodLabel(filters),
      orientation: 'landscape',
      columns,
      rows,
      summary: [
        { label: 'Total Billed', value: formatPdfCurrency(totalBilled) },
        { label: 'Collected', value: formatPdfCurrency(totalPaid) },
        { label: 'Outstanding', value: formatPdfCurrency(totalBalance) },
        { label: 'Invoices', value: String(invoices.length) },
      ],
    });

    return {
      buffer,
      filename: this.buildFilename('invoices', 'pdf'),
      mimeType: 'application/pdf',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. PAYMENTS EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  async exportPayments(
    filters: ExportFilterDto,
    companyId: string,
  ): Promise<ExportResult> {
    const format = filters.format ?? 'csv';

    const where: Prisma.PaymentWhereInput = { companyId };
    const dateRange = this.buildDateFilter(filters);
    if (dateRange) where.paymentDate = dateRange;

    const count = await this.prisma.payment.count({ where });
    if (count > MAX_EXPORT_ROWS) {
      throw new BadRequestException(
        `Export too large (${count} rows). Maximum is ${MAX_EXPORT_ROWS}. Please narrow the date range.`,
      );
    }

    const payments = await this.prisma.payment.findMany({
      where,
      orderBy: { paymentDate: 'desc' },
      include: {
        customer: { select: { name: true, customerCode: true, phone: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });

    if (format === 'csv') {
      const headers = [
        'Payment No',
        'Date',
        'Time',
        'Customer Name',
        'Customer Code',
        'Phone',
        'Invoice No',
        'Amount',
        'Mode',
        'Reference',
        'Notes',
      ];
      const rows = payments.map((p) => [
        p.paymentNumber,
        p.paymentDate.toISOString().slice(0, 10),
        p.paymentDate.toISOString().slice(11, 19),
        p.customer?.name ?? p.walkInName ?? 'Walk-in',
        p.customer?.customerCode ?? 'WALK-IN',
        p.customer?.phone ?? p.walkInPhone ?? '',
        p.invoice?.invoiceNumber ?? '',
        p.amount,
        p.paymentMode,
        p.referenceId ?? '',
        p.notes ?? '',
      ]);

      return {
        buffer: this.toCsv(headers, rows),
        filename: this.buildFilename('payments', 'csv'),
        mimeType: 'text/csv; charset=utf-8',
      };
    }

    // ── PDF ──────────────────────────────────────────────────────────
    const columns: PdfColumn[] = [
      { header: 'Payment No', width: 100 },
      { header: 'Date', width: 70 },
      { header: 'Customer', width: 130 },
      { header: 'Invoice No', width: 100 },
      { header: 'Amount', width: 80, align: 'right', isCurrency: true },
      { header: 'Mode', width: 85, align: 'center' },
      { header: 'Reference', width: 110 },
    ];

    const rows: (string | number)[][] = payments.map((p) => [
      p.paymentNumber,
      p.paymentDate.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
      }),
      p.customer?.name ?? p.walkInName ?? 'Walk-in',
      p.invoice?.invoiceNumber ?? '—',
      p.amount,
      p.paymentMode,
      p.referenceId ?? '—',
    ]);

    // Compute mode breakdown for the summary block
    const modeBreakdown: Record<string, number> = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      CREDIT: 0,
    };
    payments.forEach((p) => {
      modeBreakdown[p.paymentMode] =
        (modeBreakdown[p.paymentMode] ?? 0) + p.amount;
    });
    const total = payments.reduce((s, p) => s + p.amount, 0);

    const buffer = await this.pdf.generate({
      title: 'Payment Report',
      subtitle: `${payments.length} payment${payments.length === 1 ? '' : 's'}`,
      periodLabel: this.buildPeriodLabel(filters),
      orientation: 'landscape',
      columns,
      rows,
      summary: [
        { label: 'Total', value: formatPdfCurrency(total) },
        { label: 'Cash', value: formatPdfCurrency(modeBreakdown.CASH) },
        { label: 'UPI', value: formatPdfCurrency(modeBreakdown.UPI) },
        {
          label: 'Bank',
          value: formatPdfCurrency(modeBreakdown.BANK_TRANSFER),
        },
      ],
    });

    return {
      buffer,
      filename: this.buildFilename('payments', 'pdf'),
      mimeType: 'application/pdf',
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. OUTSTANDING EXPORT
  // ─────────────────────────────────────────────────────────────────────────
  async exportOutstanding(
    filters: ExportFilterDto,
    companyId: string,
  ): Promise<ExportResult> {
    const format = filters.format ?? 'csv';
    const now = new Date();

    const customers = await this.prisma.customer.findMany({
      where: {
        companyId,
        outstandingBalance: { gt: 0 },
        status: 'ACTIVE',
      },
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
          select: { invoiceDate: true, invoiceNumber: true },
        },
      },
    });

    // Common enrichment
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
      return { c, oldestInvoice, lastPayment, overdueDays, risk };
    });

    if (format === 'csv') {
      const headers = [
        'Customer Code',
        'Name',
        'Phone',
        'Type',
        'Outstanding',
        'Overdue Days',
        'Risk',
        'Oldest Unpaid Invoice',
        'Oldest Invoice Date',
        'Last Payment Date',
      ];
      const rows = enriched.map(
        ({ c, oldestInvoice, lastPayment, overdueDays, risk }) => [
          c.customerCode,
          c.name,
          c.phone ?? '',
          c.type,
          c.outstandingBalance,
          overdueDays,
          risk,
          oldestInvoice?.invoiceNumber ?? '',
          oldestInvoice?.invoiceDate.toISOString().slice(0, 10) ?? '',
          lastPayment?.entryDate.toISOString().slice(0, 10) ?? '',
        ],
      );

      return {
        buffer: this.toCsv(headers, rows),
        filename: this.buildFilename('outstanding', 'csv'),
        mimeType: 'text/csv; charset=utf-8',
      };
    }

    // ── PDF ──────────────────────────────────────────────────────────
    // Portrait orientation fits the columns we care about more naturally
    const columns: PdfColumn[] = [
      { header: 'Code', width: 60 },
      { header: 'Name', width: 150 },
      { header: 'Phone', width: 90 },
      { header: 'Type', width: 70, align: 'center' },
      { header: 'Outstanding', width: 75, align: 'right', isCurrency: true },
      { header: 'Days', width: 45, align: 'center' },
      { header: 'Risk', width: 60, align: 'center' },
    ];

    const rows: (string | number)[][] = enriched.map(
      ({ c, overdueDays, risk }) => [
        c.customerCode,
        c.name,
        c.phone ?? '—',
        c.type,
        c.outstandingBalance,
        overdueDays,
        risk,
      ],
    );

    const total = customers.reduce((s, c) => s + c.outstandingBalance, 0);
    const highRiskCount = enriched.filter((e) => e.risk === 'HIGH').length;
    const avgOverdue =
      enriched.length > 0
        ? Math.round(
            enriched.reduce((s, e) => s + e.overdueDays, 0) / enriched.length,
          )
        : 0;

    const buffer = await this.pdf.generate({
      title: 'Outstanding Report',
      subtitle: `As of ${now.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })}`,
      orientation: 'portrait',
      columns,
      rows,
      summary: [
        { label: 'Total Due', value: formatPdfCurrency(total) },
        { label: 'Customers', value: String(customers.length) },
        { label: 'High Risk', value: String(highRiskCount) },
        { label: 'Avg Overdue', value: `${avgOverdue}d` },
      ],
    });

    return {
      buffer,
      filename: this.buildFilename('outstanding', 'pdf'),
      mimeType: 'application/pdf',
    };
  }

  //  DAILY SUMMARY EXPORT

  async exportDailySummary(
    filters: ExportFilterDto,
    companyId: string,
  ): Promise<ExportResult> {
    const format = filters.format ?? 'csv';
    const dateRange = this.buildDateFilter(filters);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const range = dateRange ?? { gte: today, lte: endOfToday };

    const [invoiceStats, paymentStats] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          companyId,
          invoiceDate: range,
          status: { not: InvoiceStatus.CANCELLED },
        },
        _sum: { totalAmount: true, balanceDue: true },
        _count: true,
      }),
      this.prisma.payment.groupBy({
        by: ['paymentMode'],
        where: { companyId, paymentDate: range },
        _sum: { amount: true },
      }),
    ]);

    const modeAmounts: Record<string, number> = {
      CASH: 0,
      UPI: 0,
      BANK_TRANSFER: 0,
      CREDIT: 0,
    };
    paymentStats.forEach((row) => {
      modeAmounts[row.paymentMode] = row._sum.amount ?? 0;
    });
    const totalCollected =
      modeAmounts.CASH +
      modeAmounts.UPI +
      modeAmounts.BANK_TRANSFER +
      modeAmounts.CREDIT;

    const fromStr = (range.gte ?? today).toISOString().slice(0, 10);
    const toStr = (range.lte ?? endOfToday).toISOString().slice(0, 10);

    if (format === 'csv') {
      const headers = [
        'From',
        'To',
        'Invoices Generated',
        'Total Billed',
        'Total Collected',
        'Cash',
        'UPI',
        'Bank Transfer',
        'Credit',
        'Pending (Range)',
      ];
      const rows = [
        [
          fromStr,
          toStr,
          invoiceStats._count,
          invoiceStats._sum.totalAmount ?? 0,
          totalCollected,
          modeAmounts.CASH,
          modeAmounts.UPI,
          modeAmounts.BANK_TRANSFER,
          modeAmounts.CREDIT,
          invoiceStats._sum.balanceDue ?? 0,
        ],
      ];

      return {
        buffer: this.toCsv(headers, rows),
        filename: this.buildFilename('daily-summary', 'csv'),
        mimeType: 'text/csv; charset=utf-8',
      };
    }

    // ── PDF: this report is best shown as KPI cards, not a table ────
    // We pass a single-row table just to satisfy the generator, then
    // the real story is told in the summary cards.
    const columns: PdfColumn[] = [
      { header: 'Metric', width: 200 },
      { header: 'Value', width: 200, align: 'right' },
    ];

    const rows: (string | number)[][] = [
      ['Invoices Generated', invoiceStats._count],
      ['Total Billed', formatPdfCurrency(invoiceStats._sum.totalAmount ?? 0)],
      ['Total Collected', formatPdfCurrency(totalCollected)],
      ['Cash', formatPdfCurrency(modeAmounts.CASH)],
      ['UPI', formatPdfCurrency(modeAmounts.UPI)],
      ['Bank Transfer', formatPdfCurrency(modeAmounts.BANK_TRANSFER)],
      ['Credit Sales', formatPdfCurrency(modeAmounts.CREDIT)],
      [
        'Pending in Range',
        formatPdfCurrency(invoiceStats._sum.balanceDue ?? 0),
      ],
    ];

    const buffer = await this.pdf.generate({
      title: 'Collection Summary',
      subtitle: 'Period overview',
      periodLabel: this.buildPeriodLabel(filters),
      orientation: 'portrait',
      columns,
      rows,
      summary: [
        {
          label: 'Total Collected',
          value: formatPdfCurrency(totalCollected),
        },
        { label: 'Invoices', value: String(invoiceStats._count) },
        {
          label: 'Total Billed',
          value: formatPdfCurrency(invoiceStats._sum.totalAmount ?? 0),
        },
        {
          label: 'Pending',
          value: formatPdfCurrency(invoiceStats._sum.balanceDue ?? 0),
        },
      ],
    });

    return {
      buffer,
      filename: this.buildFilename('daily-summary', 'pdf'),
      mimeType: 'application/pdf',
    };
  }
}
