import { Module } from '@nestjs/common';
import { UamController } from './uam.controller';
import { UamService } from './uam.service';

@Module({
  controllers: [UamController],
  providers: [UamService],
})
export class UamModule {}
