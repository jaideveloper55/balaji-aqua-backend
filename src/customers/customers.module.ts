import { Module } from '@nestjs/common';

import { CustomersService } from './customers.service';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { CustomersController } from './Customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CompanyScopeGuard],
  exports: [CustomersService],
})
export class CustomersModule {}
