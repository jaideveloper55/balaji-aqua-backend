import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MovementSource } from '@prisma/client';
import {
  IsString,
  IsInt,
  IsIn,
  IsOptional,
  Min,
  Max,
  IsNotEmpty,
  Length,
} from 'class-validator';

export class StockInDto {
  @ApiProperty({ description: 'Product ID to add stock to' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Quantity being added', example: 100 })
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1_000_000, {
    message: 'Quantity seems unreasonably high — please verify',
  })
  quantity: number;

  @ApiProperty({
    description: 'Reason for this stock-in movement',
    enum: [
      MovementSource.PRODUCTION,
      MovementSource.PURCHASE,
      MovementSource.CUSTOMER_RETURN,
      MovementSource.OPENING_STOCK,
    ],
    example: MovementSource.PRODUCTION,
  })
  @IsIn(
    [
      MovementSource.PRODUCTION,
      MovementSource.PURCHASE,
      MovementSource.CUSTOMER_RETURN,
      MovementSource.OPENING_STOCK,
    ],
    {
      message:
        'source must be PRODUCTION, PURCHASE, CUSTOMER_RETURN, or OPENING_STOCK for stock-in',
    },
  )
  source: MovementSource;

  @ApiPropertyOptional({
    description: 'Reference number (e.g. purchase order ID)',
  })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Additional notes about this stock-in' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remarks?: string;
}
