import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@prisma/client';

export class CorrectInvoiceDto {
  @ApiPropertyOptional({
    enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CREDIT'],
    description:
      'Correct a wrong payment mode — updates invoice + all payment records',
  })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: string;

  @ApiPropertyOptional({ description: 'UPI / bank reference number' })
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional({ description: 'Internal correction note' })
  @IsOptional()
  @IsString()
  correctionNote?: string;
}
