import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpendCashDto {
  @ApiProperty({ example: 250 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Tea & snacks for loaders' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @ApiPropertyOptional({ example: 'employee-uuid' })
  @IsOptional()
  @IsString()
  handledById?: string;

  @ApiPropertyOptional({ example: 'Suresh M.' })
  @IsOptional()
  @IsString()
  handledByName?: string;
}
