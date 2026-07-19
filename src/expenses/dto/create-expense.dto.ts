import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseStatus, PaymentMode } from '@prisma/client';

export class CreateExpenseDto {
  @ApiProperty({ example: 'TN Electricity Board' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  vendorName: string;

  @ApiPropertyOptional({ example: 'uuid-of-vendor' })
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiProperty({ example: 'Monthly electricity bill — April' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  description: string;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'Utilities' })
  @IsString()
  @IsNotEmpty()
  categoryName: string;

  @ApiProperty({ example: 18500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({ example: 2000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  gstAmount?: number;

  @ApiProperty({ enum: PaymentMode, example: PaymentMode.BANK_TRANSFER })
  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @ApiPropertyOptional({ enum: ExpenseStatus, default: ExpenseStatus.PENDING })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiProperty({ example: '2026-05-04' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 'Paid via NEFT' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
