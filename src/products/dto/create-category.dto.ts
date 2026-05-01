import {
  IsBoolean,
  IsHexColor,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @Length(2, 30, { message: 'Name must be 2-30 characters' })
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Slug must be lowercase letters, numbers, and underscores only',
  })
  slug?: string; // auto-generated from name if omitted

  @IsOptional()
  @IsHexColor({ message: 'color must be a valid hex code' })
  color?: string;

  @IsOptional()
  @IsHexColor({ message: 'bg must be a valid hex code' })
  bg?: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
