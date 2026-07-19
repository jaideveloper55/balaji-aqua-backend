import { IsOptional, IsString, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryRecurringDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'false', description: 'Show only paused' })
  @IsOptional()
  @IsBooleanString()
  pausedOnly?: string;
}
