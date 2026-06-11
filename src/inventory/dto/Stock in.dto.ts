import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';

export enum StockInSource {
  PRODUCTION = 'PRODUCTION',
  PURCHASE = 'PURCHASE',
  CUSTOMER_RETURN = 'CUSTOMER_RETURN',
  OPENING_STOCK = 'OPENING_STOCK',
}

export class StockInDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity: number;

  @IsEnum(StockInSource, { message: 'Invalid stock-in source' })
  source: StockInSource;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
