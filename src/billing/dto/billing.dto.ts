import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsArray,
  ValidateNested,
  IsDateString,
  IsInt,
  Min,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceType, PaymentMode } from '@prisma/client';

// Invoice items

export class CreateInvoiceItemDto {
  @ApiProperty({ description: 'Product ID', example: 'clx123abc' })
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Quantity sold', example: 5 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    description: 'Price per unit (override for custom pricing)',
    example: 40,
  })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Discount on this line', example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional({ description: 'Customer ID (for existing customers)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'Walk-in customer name (for WALK_IN type)',
  })
  @IsOptional()
  @IsString()
  walkInName?: string;

  @ApiPropertyOptional({ description: 'Walk-in customer phone (optional)' })
  @IsOptional()
  @IsString()
  walkInPhone?: string;

  @ApiProperty({ enum: InvoiceType, default: InvoiceType.SALE })
  @IsEnum(InvoiceType)
  invoiceType: InvoiceType;

  @ApiPropertyOptional({
    description: 'Apply GST to this invoice?',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  gstEnabled?: boolean;

  @ApiPropertyOptional({ description: 'GST rate % (18 default)', default: 18 })
  @IsOptional()
  @IsNumber()
  gstRate?: number;

  @ApiPropertyOptional({ description: 'Due date for payment' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Notes / remarks' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Line items (at least 1 product)',
    type: [CreateInvoiceItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  items: CreateInvoiceItemDto[];
}

// Update invoice

export class UpdateInvoiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

// Record payment

export class CreatePaymentDto {
  @ApiProperty({ description: 'Customer ID who is paying' })
  @IsString()
  customerId: string;

  @ApiPropertyOptional({
    description:
      'Invoice ID (optional — null means against overall outstanding)',
  })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiProperty({ description: 'Amount received', example: 350 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: PaymentMode, description: 'Cash, UPI, Bank, etc.' })
  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @ApiPropertyOptional({
    description: 'UPI ref / cheque no / transaction ID',
    example: 'UPI-REF-12345',
  })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Optional notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Payment date (defaults to now)' })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;
}

// Filters

export class InvoiceFilterDto {
  @ApiPropertyOptional({ description: 'Page number', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description:
      'Filter by status. OVERDUE is derived (balance > 0 + dueDate passed), not a stored value.',
    enum: ['DRAFT', 'CONFIRMED', 'PAID', 'PARTIAL', 'CANCELLED', 'OVERDUE'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({
    description: 'From date (YYYY-MM-DD)',
    example: '2026-05-01',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'To date (YYYY-MM-DD)',
    example: '2026-05-03',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Search by invoice number or customer name',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class PaymentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CREDIT'] })
  @IsOptional()
  @IsString()
  paymentMode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'From date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'To date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Search by payment number, invoice number, or customer name',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

export class OutstandingFilterDto {
  @ApiPropertyOptional({
    description: 'Risk filter: HIGH (>15d), MEDIUM (7-15d), RECENT (<7d)',
  })
  @IsOptional()
  @IsString()
  risk?: 'HIGH' | 'MEDIUM' | 'RECENT';

  @ApiPropertyOptional({
    description: 'Search by customer name, customerCode, or phone',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Sort field. risk = days overdue × balance (default), amount = outstanding desc, days = overdue days desc, lastPaid = oldest payment first, newest = most recent invoice first.',
    enum: ['risk', 'amount', 'days', 'lastPaid', 'newest'],
    default: 'risk',
  })
  @IsOptional()
  @IsIn(['risk', 'amount', 'days', 'lastPaid', 'newest'])
  sortBy?: 'risk' | 'amount' | 'days' | 'lastPaid' | 'newest' = 'risk';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class DailySummaryFilterDto {
  @ApiPropertyOptional({
    description:
      'Single date (YYYY-MM-DD). Used when dateFrom/dateTo are not provided. Defaults to today.',
    example: '2026-05-27',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'From date (YYYY-MM-DD). Use with dateTo for a range summary.',
    example: '2026-05-01',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'To date (YYYY-MM-DD). Use with dateFrom for a range summary.',
    example: '2026-05-31',
  })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
