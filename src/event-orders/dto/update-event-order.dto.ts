import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateEventOrderDto } from './create-event-order.dto';

export class UpdateEventOrderDto extends PartialType(
  OmitType(CreateEventOrderDto, [
    'items',
    'advancePaid',
    'advancePaymentMode',
  ] as const),
) {}
