import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminTransactionsService } from './admin-transactions.service';
import { OperationalReportsService } from './operational-reports.service';
import { PasabuyModule } from '../pasabuy/pasabuy.module';

@Module({
  imports: [PasabuyModule],
  controllers: [AdminController],
  providers: [AdminService, AdminTransactionsService, OperationalReportsService],
})
export class AdminModule {}
