import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CompaniesModule } from './companies/companies.module';
import { UsersModule } from './users/users.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { BillingModule } from './billing/billing.module';
import { InventoryModule } from './inventory/Inventory.module';
import { CompanyScopeGuard } from './common/guards/company-scope.guard';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { CategoriesModule } from './expense-categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),

    ScheduleModule.forRoot(),

    // Rate limiting — 10 req/sec, 100 req/min per IP
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    CustomersModule,
    ProductsModule,
    InventoryModule,
    CategoriesModule,
    BillingModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Rate limit ALL routes globally
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Protect ALL routes by default — @Public() to opt out
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Role check ALL routes — only activates when @Roles() is present
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    { provide: APP_GUARD, useClass: CompanyScopeGuard },
  ],
})
export class AppModule {}
