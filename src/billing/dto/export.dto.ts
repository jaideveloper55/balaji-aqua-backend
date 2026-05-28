import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportFilterDto {
  @ApiPropertyOptional({
    description: 'From date (YYYY-MM-DD). Inclusive.',
    example: '2026-05-01',
  })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'To date (YYYY-MM-DD). Inclusive.',
    example: '2026-05-31',
  })
  @IsOptional()
  @IsString()
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
