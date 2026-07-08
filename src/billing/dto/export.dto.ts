import { IsOptional, IsIn, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportFilterDto {
  @ApiPropertyOptional({
    description: 'From date (YYYY-MM-DD). Inclusive.',
    example: '2026-05-01',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'To date (YYYY-MM-DD). Inclusive.',
    example: '2026-05-31',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: ['csv', 'pdf'],
    default: 'csv',
    description: 'Output format.',
  })
  @IsOptional()
  @IsIn(['csv', 'pdf'])
  format?: 'csv' | 'pdf' = 'csv';
}
