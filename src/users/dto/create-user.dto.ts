import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
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
  @ApiProperty({ example: 'staff@balajiaqua.com' })
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
  phone?: string;

  @ApiProperty({
    enum: Role,
    example: Role.STAFF,
    description:
      'SUPER_ADMIN can assign any role. ADMIN can assign MANAGER/STAFF/DELIVERY_BOY only.',
  })
  @IsEnum(Role)
  role: Role;

  // WHY OPTIONAL:
  //   SUPER_ADMIN must pass companyId (creating user for specific company)
  //   ADMIN/MANAGER: companyId comes from their JWT automatically
  @ApiPropertyOptional({
    example: 'uuid-here',
    description:
      'Required for SUPER_ADMIN only. Others use their own companyId from JWT.',
  })
  @IsOptional()
  @IsString()
  companyId?: string;
}
