import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController, CartController],
  providers: [BillingService, CartService],
  exports: [BillingService],
})
export class BillingModule {}
