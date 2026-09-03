import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { BillingController } from './billing.controller';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from '../notifications/notifications.module';
import { PdfHelper } from './pdf.helper';
import { InventoryModule } from '../inventory/Inventory.module';

@Module({
  imports: [PrismaModule, ScheduleModule, NotificationsModule, InventoryModule],
  controllers: [BillingController, CartController, ExportController],
  providers: [BillingService, CartService, ExportService, PdfHelper],
  exports: [BillingService],
})
export class BillingModule {}
