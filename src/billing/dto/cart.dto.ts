import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceType } from '@prisma/client';

// ADD / UPDATE ITEM IN CART
export class AddToCartDto {
  @ApiProperty({ description: 'Product ID to add', example: 'clx_product_id' })
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Quantity to add', example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({
    description:
      'Override unit price (for custom pricing). If not sent, uses product base price or customer custom price.',
    example: 40,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

//  UPDATE ITEM QUANTITY
export class UpdateCartItemDto {
  @ApiProperty({ description: 'New quantity (set to 0 to remove)', example: 2 })
  @IsInt()
  @Min(0) // 0 = remove the item
  quantity: number;

  @ApiPropertyOptional({ description: 'Updated unit price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

//  UPDATE CART SETTINGS
export class UpdateCartSettingsDto {
  @ApiPropertyOptional({
    description: 'Selected customer ID (null for walk-in)',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Walk-in customer name' })
  @IsOptional()
  @IsString()
  walkInName?: string;

  @ApiPropertyOptional({ description: 'Walk-in customer phone' })
  @IsOptional()
  @IsString()
  walkInPhone?: string;

  @ApiPropertyOptional({ enum: InvoiceType })
  @IsOptional()
  @IsEnum(InvoiceType)
  invoiceType?: InvoiceType;

  @ApiPropertyOptional({
    description: 'Toggle GST on/off (the GST 18% toggle in UI)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  gstEnabled?: boolean;

  @ApiPropertyOptional({ description: 'GST rate %', example: 18 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  gstRate?: number;

  @ApiPropertyOptional({
    description: 'Global invoice-level discount in ₹ (not %)',
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Notes for the invoice' })
  @IsOptional()
  @IsString()
  notes?: string;
}

//  CHECKOUT (Convert cart → invoice)
export class CheckoutCartDto {
  @ApiPropertyOptional({
    description: 'Payment mode if paying immediately',
    example: 'CASH',
  })
  @IsOptional()
  @IsString()
  paymentMode?: string;

  @ApiPropertyOptional({ description: 'Reference ID for payment' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Due date for credit sales' })
  @IsOptional()
  @IsString()
  dueDate?: string;
}
