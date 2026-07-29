import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsArray,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BomLineDto {
  @ApiProperty({
    description: 'Raw material product ID to consume',
    example: 'clx8k2p90000abc123',
  })
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @ApiProperty({
    example: 1,
    description: 'Quantity consumed per 1 unit of the finished good',
  })
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantityPerUnit: number;
}

export class SetBomDto {
  @ApiProperty({ type: [BomLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  lines: BomLineDto[];
}
