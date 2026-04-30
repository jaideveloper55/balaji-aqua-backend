import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LedgerEntryType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
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

  @ApiPropertyOptional({ description: 'From date', example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'To date', example: '2026-03-31' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  // For export modal: "With GST" toggle
  @ApiPropertyOptional({
    description: 'Include GST breakdown in response',
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  withGst?: boolean;

  // Export format from the Export Ledger modal
  @ApiPropertyOptional({ description: 'Export format', example: 'CSV' })
  @IsOptional()
  @IsIn(['PDF', 'CSV'])
  exportFormat?: 'PDF' | 'CSV';
}
