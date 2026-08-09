import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { EventCancellationReason } from '@prisma/client';

export class CancelEventOrderDto {
  @ApiProperty({ enum: EventCancellationReason })
  @IsEnum(EventCancellationReason)
  reason: EventCancellationReason;

  @ApiProperty({
    required: false,
    description: 'Optional note explaining more',
  })
  @IsOptional()
  @IsString()
  note?: string;
}
