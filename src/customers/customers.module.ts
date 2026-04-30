import { Module } from '@nestjs/common';
import { CustomersController } from './Customers.controller';
import { CustomersService } from './customers.service';

@Module({
  controllers: [CustomersController],

  providers: [CustomersService],

  exports: [CustomersService],
})
export class CustomersModule {}
