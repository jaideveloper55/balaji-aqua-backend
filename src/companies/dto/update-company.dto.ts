import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// Note: `type` (WATER_PLANT vs BEVERAGE) is intentionally NOT editable.
// It's a fundamental property set at company creation time. Changing it
// would corrupt historical data (orders, customers tagged to that type).
export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Sri Balaji Aqua Water Pvt Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

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

  @ApiPropertyOptional({ example: '33AABCU9603R1ZX' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  @Matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, {
    message: 'Invalid GSTIN format (expected: 22AAAAA0000A1Z5)',
  })
  gstNumber?: string;

  // Allows super admin to deactivate / reactivate a company
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
