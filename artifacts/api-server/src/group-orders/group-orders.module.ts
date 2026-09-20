import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { GroupOrdersController } from './group-orders.controller';
import { GroupOrdersService } from './group-orders.service';

@Module({
  imports: [NotificationsModule],
  controllers: [GroupOrdersController],
  providers: [GroupOrdersService],
})
export class GroupOrdersModule {}
