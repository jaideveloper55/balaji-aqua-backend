import { ApiPropertyOptional } from '@nestjs/swagger';
import { LedgerEntryType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class QueryLedgerDto {
  @ApiPropertyOptional({
    enum: LedgerEntryType,
    description: 'Filter by entry type',
  })
  @IsOptional()
  @IsEnum(LedgerEntryType)
  entryType?: LedgerEntryType;

  @ApiPropertyOptional({
    description: 'Search in description or reference',
    example: 'NEFT',
  })
  @IsOptional()
  @IsString()
  search?: string;

  // ── Date range (accept both naming conventions) ─────────────────────────
  @ApiPropertyOptional({ description: 'From date', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date', example: '2026-03-31' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Alias for fromDate',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Alias for toDate',
    example: '2026-03-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  // ── Pagination ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  // ── Export-modal-specific (kept from your original) ─────────────────────
  @ApiPropertyOptional({
    description: 'Include GST breakdown in response',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  withGst?: boolean;

  @ApiPropertyOptional({ description: 'Export format', example: 'CSV' })
  @IsOptional()
  @IsIn(['PDF', 'CSV'])
  exportFormat?: 'PDF' | 'CSV';
}
