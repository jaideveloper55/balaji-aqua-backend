import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RecurringService } from './recurring.service';

@Injectable()
export class RecurringCron {
  private readonly logger = new Logger(RecurringCron.name);

  constructor(private readonly recurringService: RecurringService) {}

  // Runs every day at 1:00 AM — generates any due recurring expenses
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDueSchedules() {
    this.logger.log('Processing due recurring expense schedules...');
    try {
      const { generated } = await this.recurringService.processDueSchedules();
      if (generated > 0) {
        this.logger.log(
          `Auto-generated ${generated} expense(s) from schedules`,
        );
      }
    } catch (err) {
      this.logger.error('Failed to process recurring schedules', err);
    }
  }
}
