import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymongoService } from './paymongo.service';

@Module({ controllers: [PaymentsController], providers: [PaymongoService] })
export class PaymentsModule {}