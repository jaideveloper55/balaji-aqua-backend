import { Module } from '@nestjs/common';
import { PettyCashService } from './petty-cash.service';
import { PettyCashController } from './petty-cash.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PettyCashController],
  providers: [PettyCashService],
  exports: [PettyCashService],
})
export class PettyCashModule {}
