import { Module } from '@nestjs/common';
import { PasabuyController } from './pasabuy.controller';
import { PasabuyService } from './pasabuy.service';
import { PasabuyCreationService } from './pasabuy-creation.service';
import { PasabuyPaymentsService } from './pasabuy-payments.service';
import { PaymongoModule } from '../payments/paymongo.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, PaymongoModule],
  controllers: [PasabuyController],
  providers: [PasabuyService, PasabuyCreationService, PasabuyPaymentsService],
  exports: [PasabuyPaymentsService],
})
export class PasabuyModule {}
