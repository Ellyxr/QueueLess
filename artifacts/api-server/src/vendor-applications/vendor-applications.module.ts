import { Module } from '@nestjs/common';
import { ImagekitModule } from '../imagekit/imagekit.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AdminVendorApplicationsController, VendorApplicationsController } from './vendor-applications.controller';
import { VendorApplicationsService } from './vendor-applications.service';
@Module({ imports: [ImagekitModule, SubscriptionsModule],
  controllers: [VendorApplicationsController, AdminVendorApplicationsController], providers: [VendorApplicationsService] })
export class VendorApplicationsModule {}
