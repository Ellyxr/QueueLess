import { Module } from '@nestjs/common';
import { RefundsModule } from '../refunds/refunds.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymongoModule } from './paymongo.module';

@Module({
  imports: [PaymongoModule, RefundsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}