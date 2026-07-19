import { Module } from '@nestjs/common';
import { RecurringService } from './recurring.service';
import { RecurringController } from './recurring.controller';
import { RecurringCron } from './recurring.cron';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RecurringController],
  providers: [RecurringService, RecurringCron],
  exports: [RecurringService],
})
export class RecurringModule {}
