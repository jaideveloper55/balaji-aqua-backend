import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Gender } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

// All fields optional — PATCH allows partial updates.
// Email and password are NOT in this DTO:
//   - Email change should be its own flow (with verification)
//   - Password change uses /users/:id/password endpoint
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Ravi' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Kumar' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: '+91-9876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{10,15}$/, { message: 'Invalid phone number' })
  phone?: string;

  @ApiPropertyOptional({
    enum: Role,
    description:
      'SUPER_ADMIN can assign ADMIN/STAFF/DELIVERY_BOY. ' +
      'ADMIN can assign STAFF/DELIVERY_BOY only. ' +
      'Cannot promote anyone to SUPER_ADMIN.',
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  // NEW: Allow reassigning user's companies.
  // If provided, REPLACES all existing company assignments (not merged).
  // Omit this field to keep existing companies unchanged.
  @ApiPropertyOptional({
    example: ['uuid-water-plant'],
    description:
      'Companies the user should have access to. If provided, REPLACES ' +
      'existing assignments. Omit to leave companies unchanged.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Assign at least one company' })
  @IsString({ each: true })
  companyIds?: string[];

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

  @ApiPropertyOptional({
    example: true,
    description: 'Set false to deactivate user without deleting (soft delete)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
