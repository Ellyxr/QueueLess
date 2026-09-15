import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymongoService } from './paymongo.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, PaymongoService],
})
export class PaymentsModule {}
