import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  IsEnum,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RolloverRule } from '@prisma/client';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Utilities' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Electricity, water bill, internet' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @ApiPropertyOptional({
    example: '#d97706',
    description: 'Icon foreground hex',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({
    example: '#fffbeb',
    description: 'Icon background hex',
  })
  @IsOptional()
  @IsString()
  bg?: string;

  @ApiPropertyOptional({
    example: 'lightning-bolt',
    description: 'Icon key for react-icons',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: 25000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  monthlyBudget?: number;

  @ApiPropertyOptional({
    example: 90,
    description: '% used before alerting; 0 = off',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  alertThreshold?: number;

  @ApiPropertyOptional({ enum: RolloverRule, default: RolloverRule.NONE })
  @IsOptional()
  @IsEnum(RolloverRule)
  rolloverRule?: RolloverRule;
}
