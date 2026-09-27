import { Module } from '@nestjs/common';
import { RefundsModule } from '../refunds/refunds.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymongoModule } from './paymongo.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PasabuyModule } from '../pasabuy/pasabuy.module';

@Module({
  imports: [PaymongoModule, RefundsModule, RealtimeModule, PasabuyModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
