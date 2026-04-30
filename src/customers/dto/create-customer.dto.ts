import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
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
  // WHY REGEX? Phone numbers look like text but have a specific format.
  // This regex validates Indian numbers like: 9876543210, +91 98765 43210
  phone: string;

  @ApiPropertyOptional({
    description: 'Email address (optional)',
    example: 'rajesh@example.com',
  })
  @IsOptional()
  // IsOptional() means: if the field is not sent, skip all other validations
  // This matches your form where email is optional
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

  // ---- STEP 2: DELIVERY SETTINGS ----

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

  @ApiPropertyOptional({
    description: 'Special delivery instructions',
    example: 'Leave at gate if not home',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @Length(0, 300)
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
