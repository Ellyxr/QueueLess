import { Module } from '@nestjs/common';
import { GroupOrdersController } from './group-orders.controller';
import { GroupOrdersService } from './group-orders.service';

@Module({
  controllers: [GroupOrdersController],
  providers: [GroupOrdersService],
})
export class GroupOrdersModule {}
