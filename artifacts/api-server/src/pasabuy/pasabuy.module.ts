import { Module } from '@nestjs/common';
import { PasabuyController } from './pasabuy.controller';
import { PasabuyService } from './pasabuy.service';
import { PasabuyCreationService } from './pasabuy-creation.service';
import { PasabuyPaymentsService } from './pasabuy-payments.service';
import { PasabuyWorkflowsService } from './pasabuy-workflows.service';
import { PasabuyIdentityService } from './pasabuy-identity.service';
import { ImagekitModule } from '../imagekit/imagekit.module';
import { PricingModule } from '../common/pricing/pricing.module';
import { PaymongoModule } from '../payments/paymongo.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule, PaymongoModule, ImagekitModule, PricingModule],
  controllers: [PasabuyController],
  providers: [PasabuyService, PasabuyCreationService, PasabuyPaymentsService,
    PasabuyWorkflowsService, PasabuyIdentityService],
  exports: [PasabuyPaymentsService, PasabuyIdentityService],
})
export class PasabuyModule {}
