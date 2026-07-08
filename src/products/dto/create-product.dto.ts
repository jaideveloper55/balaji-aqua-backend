import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, ProductUnit } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty({ description: 'Product name', example: 'Water Can 20L' })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({
    description: 'Unique SKU code (auto-uppercased)',
    example: 'WC-20L-001',
  })
  @IsString()
  @Length(2, 50)
  @Matches(/^[A-Za-z0-9\-_]+$/, {
    message: 'SKU can only contain letters, numbers, hyphens, and underscores',
  })
  sku!: string;

  @ApiProperty({ description: 'Category this product belongs to' })
  @IsNotEmpty({ message: 'categoryId is required' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({
    enum: ProductUnit,
    description: 'Unit of measurement',
    default: 'PCS',
  })
  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Product status (auto-derived from stock if omitted)',
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({
    description:
      'HSN code for GST classification — must be 4-8 digits per Indian GST rules',
    example: '2201',
  })
  @IsOptional()
  @Matches(/^\d{4,8}$/, { message: 'HSN code must be 4-8 digits' })
  hsn?: string;

  @ApiPropertyOptional({ description: 'Product description', maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string;

  // ─── Pricing ───
  @ApiProperty({ description: 'Selling price in ₹', example: 40 })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'basePrice must have ≤ 2 decimals' },
  )
  @Min(0)
  basePrice!: number;

  @ApiPropertyOptional({
    description: 'Cost price in ₹ (for margin tracking)',
    example: 25,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  costPrice?: number;

  @ApiPropertyOptional({
    description:
      'GST rate as a percentage — must match a real Indian GST slab (0, 5, 12, 18, or 28)',
    example: 18,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(28, {
    message: 'gstRate cannot exceed 28% (current max Indian GST slab)',
  })
  gstRate?: number;

  // ─── Inventory ───
  @ApiPropertyOptional({ description: 'Initial stock quantity', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    description: 'Minimum stock threshold for low-stock alerts',
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;
}
