import { Module } from '@nestjs/common';
import { PricingModule } from '../common/pricing/pricing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { GroupOrdersController } from './group-orders.controller';
import { GroupOrdersService } from './group-orders.service';

@Module({
  imports: [
    NotificationsModule,
    PricingModule,
    RealtimeModule,
  ],
  controllers: [GroupOrdersController],
  providers: [GroupOrdersService],
})
export class GroupOrdersModule {}