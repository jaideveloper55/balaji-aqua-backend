import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsOptional,
  IsNotEmpty,
  Length,
  Min,
  Max,
} from 'class-validator';

export class AdjustStockDto {
  @ApiProperty({ description: 'Product ID to adjust stock for' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({
    description:
      'The actual physically counted quantity — this REPLACES the current stock value, it does not add or subtract from it',
    example: 45,
  })
  @IsInt()
  @Min(0, { message: 'Counted quantity cannot be negative' })
  @Max(1_000_000, {
    message: 'Counted quantity seems unreasonably high — please verify',
  })
  countedQuantity: number;

  @ApiPropertyOptional({
    description:
      'Reference number for this adjustment (e.g. stock count sheet ID)',
  })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  referenceId?: string;

  @ApiPropertyOptional({
    description: 'Notes explaining the reason for this adjustment',
  })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remarks?: string;
}
