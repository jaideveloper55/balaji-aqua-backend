import { ApiProperty } from '@nestjs/swagger';
import { EventType } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEventOrderItemDto {
  @ApiProperty({
    example: 'clx1a2b3c4d5',
    description: 'Product ID from products table',
  })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 100, description: 'How many units of this product' })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({
    example: 60,
    description: 'Price per unit (may be customized for this order)',
  })
  @IsNumber()
  @Min(0)
  unitPrice: number;
}

export class CreateEventOrderDto {
  @ApiProperty({ example: 'Ramesh & Priya Wedding Reception' })
  @IsString()
  @IsNotEmpty()
  eventName: string;

  @ApiProperty({ enum: EventType, example: EventType.WEDDING })
  @IsEnum(EventType)
  eventType: EventType;

  @ApiProperty({ example: 500, description: 'Number of expected guests' })
  @IsInt()
  @Min(1)
  expectedGuests: number;

  @ApiProperty({ example: '2026-08-15', description: 'ISO date string' })
  @IsDateString()
  eventDate: string;

  @ApiProperty({
    example: '08:00',
    description: 'Delivery time in HH:mm format',
  })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'deliveryTime must be in HH:mm format',
  })
  deliveryTime: string;

  @ApiProperty({ example: '22:00', required: false })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'pickupTime must be in HH:mm format',
  })
  pickupTime?: string;

  @ApiProperty({
    example: 'clx1a2b3c4d5',
    required: false,
    description: 'Existing customer ID',
  })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @ApiProperty({ example: 'Sundar Mahal' })
  @IsString()
  @IsNotEmpty()
  venueName: string;

  @ApiProperty({ example: 'No. 12, MG Road, T. Nagar' })
  @IsString()
  @IsNotEmpty()
  venueAddress: string;

  @ApiProperty({ example: 'Chennai' })
  @IsString()
  @IsNotEmpty()
  venueCity: string;

  @ApiProperty({ example: '600017', required: false })
  @IsOptional()
  @IsString()
  venuePincode?: string;

  @ApiProperty({ example: 'Suresh (Uncle)', required: false })
  @IsOptional()
  @IsString()
  onSiteContactName?: string;

  @ApiProperty({ example: '9876543211', required: false })
  @IsOptional()
  @IsString()
  onSiteContactPhone?: string;

  @ApiProperty({
    type: [CreateEventOrderItemDto],
    description: 'At least 1 item required',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one item is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateEventOrderItemDto)
  items: CreateEventOrderItemDto[];

  @ApiProperty({
    example: 500,
    required: false,
    description: 'Flat discount amount',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Should we apply 18% GST?',
  })
  @IsOptional()
  @IsBoolean()
  gstEnabled?: boolean;

  @ApiProperty({
    example: 5000,
    required: false,
    description: 'Amount paid upfront',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  advancePaid?: number;

  @ApiProperty({
    example: 2000,
    required: false,
    description: 'Refundable security deposit',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  securityDeposit?: number;

  @ApiProperty({
    example: 'Cash',
    required: false,
    description: 'Payment mode for advance',
  })
  @IsOptional()
  @IsString()
  advancePaymentMode?: string;

  @ApiProperty({
    example: 'Special instructions for delivery team...',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
