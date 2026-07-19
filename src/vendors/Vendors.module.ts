import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VendorsController } from './Vendors.controller';
import { VendorsService } from './Vendors.service';

@Module({
  imports: [PrismaModule],
  controllers: [VendorsController],
  providers: [VendorsService],
  exports: [VendorsService],
})
export class VendorsModule {}
