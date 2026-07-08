import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayMaxSize,
  IsArray,
  IsString,
} from 'class-validator';

export class BulkDeleteProductDto {
  @ApiProperty({
    description: 'Array of product IDs to delete',
    type: [String],
    example: ['clh7x2k...', 'clh7x9m...'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'At least one product ID is required' })
  @ArrayMaxSize(100, {
    message: 'Cannot delete more than 100 products at once',
  })
  @IsString({ each: true })
  ids: string[];
}
