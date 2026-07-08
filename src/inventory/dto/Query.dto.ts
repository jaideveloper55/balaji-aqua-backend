import { ApiPropertyOptional } from '@nestjs/swagger';
import { MovementType } from '@prisma/client';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum StockStatusFilter {
  IN_STOCK = 'IN_STOCK',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}

export class StockListQueryDto {
  @ApiPropertyOptional({ description: 'Search by product name or SKU' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: StockStatusFilter,
    description: 'Filter by stock status',
  })
  @IsOptional()
  @IsEnum(StockStatusFilter)
  status?: StockStatusFilter;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

export class MovementHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Search by product name or SKU' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: MovementType,
    description: 'Filter by movement type (STOCK_IN, STOCK_OUT, ADJUSTMENT)',
  })
  @IsOptional()
  @IsEnum(MovementType)
  type?: MovementType;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Movements on/after this date',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Movements on/before this date',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Results per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
