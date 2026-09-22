import { Module } from '@nestjs/common';
import { PricingModule } from '../common/pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RefundsModule } from '../refunds/refunds.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [
    RefundsModule,
    NotificationsModule,
    PricingModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}