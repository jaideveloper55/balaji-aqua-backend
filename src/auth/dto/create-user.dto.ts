import { Role, Gender } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail({}, { message: 'Invalid email' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain a number' })
  password: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{10,15}$/, { message: 'Invalid phone number' })
  phone?: string;

  // SUPER_ADMIN blocked at service layer.
  // Allowed: ADMIN | STAFF | DELIVERY_BOY
  @IsEnum(Role, { message: 'Invalid role' })
  role: Role;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  // Which companies this user has access to.
  // Usually 1 (e.g. staff at Water Plant only).
  // Could be 2 (e.g. an admin who manages both, like the super admin's deputy).
  @IsArray()
  @ArrayMinSize(1, { message: 'Assign at least one company' })
  @IsUUID('4', { each: true })
  companyIds: string[];
}
