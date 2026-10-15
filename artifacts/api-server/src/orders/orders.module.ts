import { Module } from '@nestjs/common';
import { PricingModule } from '../common/pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RefundsModule } from '../refunds/refunds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PaymongoModule } from '../payments/paymongo.module';
import { VendorsModule } from '../vendors/vendors.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    RefundsModule,
    NotificationsModule,
    PricingModule,
    RealtimeModule,
    VendorsModule,
    PaymongoModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}