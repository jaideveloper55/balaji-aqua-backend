import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { BillingController } from './billing.controller';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { PdfHelper } from './pdf.helper';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, CartController, ExportController],
  providers: [BillingService, CartService, ExportService, PdfHelper],
  exports: [BillingService],
})
export class BillingModule {}
