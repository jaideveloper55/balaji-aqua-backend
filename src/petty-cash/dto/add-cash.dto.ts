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

export class AddCashDto {
  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Top-up from main account' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  description: string;

  @ApiPropertyOptional({ example: 'employee-uuid' })
  @IsOptional()
  @IsString()
  handledById?: string;

  @ApiPropertyOptional({ example: 'Devaa Balaji' })
  @IsOptional()
  @IsString()
  handledByName?: string;
}
