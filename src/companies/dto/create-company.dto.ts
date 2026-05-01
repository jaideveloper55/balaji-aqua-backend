import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanyType } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ example: 'Sri Balaji Aqua Water' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: CompanyType, example: 'WATER_PLANT' })
  @IsEnum(CompanyType, {
    message: 'type must be WATER_PLANT or BEVERAGE',
  })
  type: CompanyType;

  @ApiPropertyOptional({ example: 'info@balaji.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(100)
  email?: string;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{10,15}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: '12 Gandhi Street, RS Puram' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({ example: 'Coimbatore' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Tamil Nadu' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  // Indian GSTIN format: 15 chars, e.g. "33AABCU9603R1ZX"
  // Structure: [2 digit state] [10 char PAN] [1 char entity] [Z] [1 char checksum]
  @ApiPropertyOptional({ example: '33AABCU9603R1ZX' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid GSTIN format (expected: 22AAAAA0000A1Z5)',
  })
  gstNumber?: string;
}
