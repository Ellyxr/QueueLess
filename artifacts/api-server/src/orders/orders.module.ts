import { Module } from '@nestjs/common';
import { PricingModule } from '../common/pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymongoModule } from '../payments/paymongo.module';
import { RefundsModule } from '../refunds/refunds.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PreorderChangesService } from './preorder-changes.service';
import { PreorderReservationsService } from './preorder-reservations.service';

@Module({
  imports: [
    RefundsModule,
    NotificationsModule,
    PricingModule,
    RealtimeModule,
    PaymongoModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, PreorderReservationsService, PreorderChangesService],
})
export class OrdersModule {}
