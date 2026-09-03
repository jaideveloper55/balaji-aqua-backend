import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

export class DashboardSummaryQueryDto {
  @ApiPropertyOptional({
    example: '2026-08-01',
    description:
      'Start of the period to report on. Defaults to start of today if omitted.',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-08-15',
    description:
      'End of the period to report on (inclusive). Defaults to now if omitted.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class DashboardKpisDto {
  @ApiProperty({ example: 12, description: 'Total customers for this company' })
  totalCustomers: number;

  @ApiProperty({
    example: 3,
    description: 'New customers added this calendar month',
  })
  newThisMonth: number;

  @ApiProperty({
    example: 7852,
    description: 'Total money all customers still owe (₹)',
  })
  totalOutstanding: number;

  @ApiProperty({
    example: 6,
    description: 'How many customers have a non-zero balance',
  })
  customersWithDues: number;

  @ApiProperty({
    example: 3780,
    description: 'Total money collected today (₹)',
  })
  todayCollection: number;

  @ApiProperty({
    example: 7,
    description: 'How many invoices were generated today',
  })
  todayInvoices: number;

  @ApiProperty({ example: 4240, description: 'Total value invoiced today (₹)' })
  totalBilled: number;

  @ApiProperty({
    example: 3,
    description: 'Total active (non-archived) products',
  })
  totalProducts: number;

  @ApiProperty({
    example: 1,
    description: 'Products at or below their minimum stock level',
  })
  lowStockCount: number;

  @ApiProperty({ example: 0, description: 'Products completely out of stock' })
  outOfStockCount: number;
}

// --- One slice of the payment-mode chart ---
export class PaymentModeSliceDto {
  @ApiProperty({ example: 'CASH' })
  name: string;

  @ApiProperty({
    example: 3760,
    description: 'Total collected via this mode today (₹)',
  })
  value: number;
}

// --- Outstanding-by-risk buckets (the age-bucketed donut) ---
export class OutstandingBucketsDto {
  @ApiProperty({
    example: 5000,
    description: 'Dues overdue more than 15 days (₹)',
  })
  highRisk: number;

  @ApiProperty({ example: 2000, description: 'Dues overdue 1–15 days (₹)' })
  medium: number;

  @ApiProperty({
    example: 852,
    description: 'Dues not yet overdue / very recent (₹)',
  })
  recent: number;
}

export class DueCustomerDto {
  @ApiProperty({
    example: 'clx1a2b3c4d5e6f7g8h9i0j1',
    description: 'Customer primary key',
  })
  id: string;

  @ApiProperty({ example: 'Deva' })
  name: string;

  @ApiProperty({ example: 'CUS-008' })
  customerCode: string;

  @ApiProperty({
    example: 'RESIDENTIAL',
    enum: ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL'],
  })
  type: string;

  @ApiProperty({ example: '9840531612' })
  phone: string;

  @ApiProperty({ example: 5062, description: 'Amount this customer owes (₹)' })
  outstandingBalance: number;

  @ApiProperty({
    example: 20,
    description:
      'Days their oldest unpaid invoice is overdue (0 = not overdue)',
  })
  overdueDays: number;
}

export class StockRowDto {
  @ApiProperty({
    example: 'clx9z8y7x6w5v4u3t2s1r0q',
    description: 'Product primary key',
  })
  id: string;

  @ApiProperty({ example: 'WC-300-ML-STD' })
  sku: string;

  @ApiProperty({ example: '300 ml' })
  name: string;

  @ApiProperty({ example: 10969, description: 'Units currently in stock' })
  stock: number;

  @ApiProperty({ example: 50 })
  minStock: number;

  @ApiProperty({ example: 'BOX' })
  unit: string;
}

// --- The date range actually applied to this response, echoed back so ---
// --- the frontend can label cards correctly ("Today" vs "Aug 1 – Aug 15") ---
export class DashboardPeriodDto {
  @ApiProperty({
    example: '2026-09-01',
    description: 'Start date actually used for this response (YYYY-MM-DD)',
  })
  from: string;

  @ApiProperty({
    example: '2026-09-01',
    description: 'End date actually used for this response (YYYY-MM-DD)',
  })
  to: string;

  @ApiProperty({
    example: false,
    description:
      'True when the caller supplied dateFrom/dateTo. False means this is ' +
      'the default live "today" view — the frontend should show "Today" ' +
      'labels rather than the literal date range.',
  })
  isCustomRange: boolean;
}

// --- The whole payload returned by GET /dashboard/summary ---
export class DashboardSummaryDto {
  @ApiProperty({ type: DashboardKpisDto })
  kpis: DashboardKpisDto;

  @ApiProperty({ type: DashboardPeriodDto })
  period: DashboardPeriodDto;

  @ApiProperty({ type: [PaymentModeSliceDto] })
  paymentMode: PaymentModeSliceDto[];

  @ApiProperty({ type: OutstandingBucketsDto })
  buckets: OutstandingBucketsDto;

  @ApiProperty({ type: [DueCustomerDto] })
  dueCustomers: DueCustomerDto[];

  @ApiProperty({ type: [StockRowDto] })
  stockRows: StockRowDto[];
}
