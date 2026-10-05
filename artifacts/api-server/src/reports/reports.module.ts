import { VendorReportsService } from './vendor-reports.service';
import { Module } from '@nestjs/common';
import { ImagekitModule } from '../imagekit/imagekit.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({ imports: [ImagekitModule], controllers: [ReportsController], providers: [ReportsService, VendorReportsService] })
export class ReportsModule {}
