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

export class StockOutDto {
  @ApiProperty({ description: 'Product ID to remove stock from' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'Quantity being removed', example: 20 })
  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1' })
  @Max(1_000_000, {
    message: 'Quantity seems unreasonably high — please verify',
  })
  quantity: number;

  @ApiProperty({
    description: 'Reason for this stock-out movement',
    enum: [
      MovementSource.DELIVERY,
      MovementSource.INTERNAL_USE,
      MovementSource.DAMAGE,
    ],
    example: MovementSource.DELIVERY,
  })
  @IsIn(
    [
      MovementSource.DELIVERY,
      MovementSource.INTERNAL_USE,
      MovementSource.DAMAGE,
    ],
    {
      message: 'source must be DELIVERY, INTERNAL_USE, or DAMAGE for stock-out',
    },
  )
  source: MovementSource;

  @ApiPropertyOptional({
    description: 'Reference number (e.g. delivery/order ID)',
  })
  @IsOptional()
  @IsString()
  @Length(0, 100)
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Additional notes about this stock-out' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remarks?: string;
}
