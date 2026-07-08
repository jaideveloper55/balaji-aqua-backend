import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Water Cans' })
  @IsString()
  @Length(2, 30, { message: 'Name must be 2-30 characters' })
  name!: string;

  @ApiPropertyOptional({
    description:
      'URL-friendly identifier — auto-generated from name if omitted',
    example: 'water_cans',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Slug must be lowercase letters, numbers, and underscores only',
  })
  slug?: string;

  @ApiPropertyOptional({
    description: 'Hex color for the category badge text/icon',
    example: '#2563eb',
    default: '#2563eb',
  })
  @IsOptional()
  @IsHexColor({ message: 'color must be a valid hex code' })
  color?: string;

  @ApiPropertyOptional({
    description: 'Hex color for the category badge background',
    example: '#dbeafe',
    default: '#dbeafe',
  })
  @IsOptional()
  @IsHexColor({ message: 'bg must be a valid hex code' })
  bg?: string;

  @ApiPropertyOptional({ description: 'Category description', maxLength: 200 })
  @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether this category is active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
