import { IsString, IsInt, IsOptional, Min, IsNotEmpty } from 'class-validator';

export class AdjustStockDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(0, { message: 'Counted quantity cannot be negative' })
  countedQuantity: number;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
