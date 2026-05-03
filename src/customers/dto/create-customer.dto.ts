import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export enum CustomerType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
}

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
}

export enum DeliveryFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  ON_DEMAND = 'ON_DEMAND',
}

export enum PaymentMode {
  CASH = 'CASH',
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CREDIT = 'CREDIT',
}

export class CreateCustomerDto {
  // ---- STEP 1: BASIC INFO ----

  @ApiProperty({
    description: 'Full name of the customer',
    example: 'Rajesh Kumar',
  })
  @IsNotEmpty({ message: 'Customer name is required' })
  @IsString()
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name: string;

  @ApiProperty({
    description: 'Indian mobile number',
    example: '+91 98765 43210',
  })
  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @Matches(/^(\+91[\-\s]?)?[0]?(91)?[789]\d{9}$/, {
    message: 'Please provide a valid Indian mobile number',
  })
  phone: string;

  @ApiPropertyOptional({
    description: 'Email address (optional)',
    example: 'rajesh@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiProperty({
    description: 'Type of customer',
    enum: CustomerType,
    example: CustomerType.RESIDENTIAL,
  })
  @IsEnum(CustomerType, {
    message: 'Type must be RESIDENTIAL, COMMERCIAL, or INDUSTRIAL',
  })
  type: CustomerType;

  // ---- STEP 2: DELIVERY & PAYMENT ----

  @ApiProperty({
    description: 'How often the customer wants delivery',
    enum: DeliveryFrequency,
    example: DeliveryFrequency.DAILY,
  })
  @IsEnum(DeliveryFrequency)
  deliveryFrequency: DeliveryFrequency;

  @ApiProperty({
    description: 'Preferred payment method',
    enum: PaymentMode,
    example: PaymentMode.CASH,
  })
  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  // Opening balance / outstanding amount at onboarding.
  // Stored on Customer.outstandingBalance and shown in the list table.
  @ApiPropertyOptional({
    description:
      'Opening balance / outstanding amount at customer onboarding (in INR). Defaults to 0.',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Outstanding must be a number with up to 2 decimal places' },
  )
  @Min(0, { message: 'Outstanding cannot be negative' })
  outstandingBalance?: number;

  @ApiPropertyOptional({
    description: 'Special delivery instructions',
    example: 'Leave at gate if not home',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  notes?: string;

  // ---- STEP 3: ADDRESS ----

  @ApiProperty({
    description: 'Street address, building, door number',
    example: '42, Gandhi Street',
  })
  @IsNotEmpty({ message: 'Address is required' })
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional({
    description: 'Area, locality (optional)',
    example: 'Anna Nagar',
  })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ example: 'Chennai' })
  @IsNotEmpty()
  @IsString()
  city: string;

  @ApiProperty({ example: 'Tamil Nadu' })
  @IsNotEmpty()
  @IsString()
  state: string;

  @ApiProperty({
    description: '6-digit Indian pincode',
    example: '600001',
  })
  @IsNotEmpty()
  @Matches(/^[1-9][0-9]{5}$/, {
    message: 'Please provide a valid 6-digit pincode',
  })
  pincode: string;

  @ApiPropertyOptional({
    description: 'Nearby landmark for delivery',
    example: 'Near Saravana Stores',
  })
  @IsOptional()
  @IsString()
  landmark?: string;
}
