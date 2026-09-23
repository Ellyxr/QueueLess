import { Module } from '@nestjs/common';
import { PaymongoModule } from '../payments/paymongo.module';
import { RefundsController } from './refunds.controller';
import { RefundsService } from './refunds.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [PaymongoModule, RealtimeModule],
  controllers: [RefundsController],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}