import { Module } from '@nestjs/common';
import { EventOrdersService } from './event-orders.service';
import { EventOrdersController } from './event-orders.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [EventOrdersController],
  providers: [EventOrdersService],
  exports: [EventOrdersService],
})
export class EventOrdersModule {}
