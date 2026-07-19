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
import { RecurringFrequency } from '@prisma/client';

export class CreateRecurringDto {
  @ApiProperty({ example: 'Internet & WiFi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({ example: 'Airtel Business' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  vendorName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 'Utilities' })
  @IsString()
  @IsNotEmpty()
  categoryName: string;

  @ApiProperty({
    enum: RecurringFrequency,
    example: RecurringFrequency.MONTHLY,
  })
  @IsEnum(RecurringFrequency)
  frequency: RecurringFrequency;

  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: '2026-06-10' })
  @IsDateString()
  nextDue: string;

  @ApiPropertyOptional({
    example: 5,
    default: 5,
    description: 'Remind N days before due',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reminderDays?: number;
}
