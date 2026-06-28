import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [ConfigModule],
  providers: [TelegramService, NotificationService],
  exports: [TelegramService, NotificationService],
})
export class NotificationsModule {}
