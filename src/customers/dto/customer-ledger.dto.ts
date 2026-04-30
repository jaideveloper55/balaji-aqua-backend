import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export enum LedgerEntryType {
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE',
}

export class CreateLedgerEntryDto {
  @ApiProperty({ enum: LedgerEntryType, example: LedgerEntryType.PAYMENT })
  @IsEnum(LedgerEntryType)
  entryType: LedgerEntryType;

  @ApiProperty({ description: 'Reference number', example: 'NEFT-88432109' })
  @IsNotEmpty()
  @IsString()
  referenceNo: string;

  @ApiProperty({
    description: 'Entry description',
    example: 'UPI payment received',
  })
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiPropertyOptional({
    description: 'Debit amount (Invoice/Debit Note)',
    example: 185000,
  })
  @IsOptional()
  @IsNumber()
  debitAmount?: number;

  @ApiPropertyOptional({
    description: 'Credit amount (Payment/Credit Note)',
    example: 100000,
  })
  @IsOptional()
  @IsNumber()
  creditAmount?: number;

  @ApiPropertyOptional({ description: 'CGST amount', example: 7650 })
  @IsOptional()
  @IsNumber()
  cgst?: number;

  @ApiPropertyOptional({ description: 'SGST amount', example: 7350 })
  @IsOptional()
  @IsNumber()
  sgst?: number;

  @ApiPropertyOptional({ description: 'IGST amount (inter-state)', example: 0 })
  @IsOptional()
  @IsNumber()
  igst?: number;

  @ApiProperty({
    description: 'Date of this ledger entry',
    example: '2026-03-01',
  })
  @IsDateString()
  entryDate: string;
}
