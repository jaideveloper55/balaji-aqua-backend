import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Gender } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'ravi@balajiaqua.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Staff@12345' })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'Password must have uppercase, lowercase and number',
  })
  password: string;

  @ApiProperty({ example: 'Ravi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ example: 'Kumar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  lastName: string;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{10,15}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiProperty({
    enum: Role,
    example: Role.STAFF,
    description:
      'SUPER_ADMIN can assign ADMIN/STAFF/DELIVERY_BOY. ' +
      'ADMIN can assign STAFF/DELIVERY_BOY only. ' +
      'SUPER_ADMIN cannot be created via API (seeded only).',
  })
  @IsEnum(Role)
  role: Role;

  // CHANGED: companyId (single) → companyIds (array)
  // A user can belong to multiple companies (e.g. someone working at both
  // Water Plant and Beverages). Caller can only assign companies they
  // themselves have access to (enforced in service).
  @ApiProperty({
    example: ['uuid-water-plant', 'uuid-beverages'],
    description:
      'Companies the user has access to. Usually 1 (e.g. STAFF at one ' +
      'company), but can be multiple. Caller can only assign companies ' +
      'they themselves belong to.',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Assign at least one company' })
  @IsString({ each: true })
  companyIds: string[];

  // ─── Optional profile fields ──────────────────────────────────────────────

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

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
}
