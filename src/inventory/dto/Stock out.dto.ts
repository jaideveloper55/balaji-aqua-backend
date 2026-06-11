import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';

export enum StockOutSource {
  DELIVERY = 'DELIVERY',
  INTERNAL_USE = 'INTERNAL_USE',
  DAMAGE = 'DAMAGE',
}

export class StockOutDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @IsEnum(StockOutSource, { message: 'Invalid stock-out reason' })
  source: StockOutSource;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
