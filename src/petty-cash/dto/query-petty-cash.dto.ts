import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PettyCashDirection } from '@prisma/client';

export class QueryPettyCashDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PettyCashDirection })
  @IsOptional()
  @IsEnum(PettyCashDirection)
  direction?: PettyCashDirection;

  @ApiPropertyOptional({ example: '2026-07-18' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
