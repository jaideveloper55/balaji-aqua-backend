import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, Min, IsOptional, IsString } from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class RecordEventPaymentDto {
  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiProperty({ enum: PaymentMode })
  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @ApiProperty({ required: false, example: 'UPI-REF-123456' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
