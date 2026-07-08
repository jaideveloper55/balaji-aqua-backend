import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class QueryProductDto {
  @ApiPropertyOptional({
    description: 'Search by name, SKU, or ID',
    example: 'Water Can',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Filter by product status',
    enum: ProductStatus,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    description: 'Filter by whether the product can be sold directly',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  isSellable?: boolean;

  @ApiPropertyOptional({
    description: 'Created on/after this date',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Created on/before this date',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Page number', example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'createdAt',
    default: 'createdAt',
    enum: ['name', 'sku', 'basePrice', 'stock', 'createdAt'],
  })
  @IsOptional()
  @IsIn(['name', 'sku', 'basePrice', 'stock', 'createdAt'], {
    message: 'sortBy must be one of: name, sku, basePrice, stock, createdAt',
  })
  sortBy?: 'name' | 'sku' | 'basePrice' | 'stock' | 'createdAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    example: 'desc',
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
