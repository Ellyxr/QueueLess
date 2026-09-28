import { Module } from '@nestjs/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { PaymongoModule } from '../payments/paymongo.module';

@Module({ imports: [PaymongoModule], controllers: [SubscriptionsController], providers: [SubscriptionsService] })
export class SubscriptionsModule {}
