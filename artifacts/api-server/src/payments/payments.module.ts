import { Module } from '@nestjs/common';
import { PaymongoModule } from './paymongo.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [PaymongoModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}