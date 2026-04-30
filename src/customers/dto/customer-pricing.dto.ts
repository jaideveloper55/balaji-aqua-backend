import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export class CreateCustomerPricingDto {
  @ApiProperty({
    description: 'Product ID to set special price for',
    example: 'clh7x2k...',
  })
  @IsNotEmpty()
  @IsString()
  productId: string;

  @ApiProperty({
    description: 'Special price for this customer in ₹',
    example: 35,
  })
  @IsNumber()
  @IsPositive()
  customerPrice: number;

  @ApiPropertyOptional({
    description: 'When this price starts',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    description: 'When this price ends (null = no end)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdateCustomerPricingDto extends PartialType(
  CreateCustomerPricingDto,
) {
  @ApiPropertyOptional({
    description: 'Activate or deactivate this price rule',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
