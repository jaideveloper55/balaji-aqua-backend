import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {
  @ApiPropertyOptional({
    description:
      'Whether this product can be sold directly (false = internal use only, e.g. raw water before bottling)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isSellable?: boolean;
}
