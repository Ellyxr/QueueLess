import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { ProductsModule } from './products/products.module';
import { EventsModule } from './events/events.module';
import { CartsModule } from './carts/carts.module';
import { OrdersModule } from './orders/orders.module';
import { RefundsModule } from './refunds/refunds.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PasabuyModule } from './pasabuy/pasabuy.module';
import { ReportsModule } from './reports/reports.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FeaturedListingsModule } from './featured-listings/featured-listings.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    PaymentsModule,
    RealtimeModule,
    UsersModule,
    VendorsModule,
    ProductsModule,
    EventsModule,
    CartsModule,
    OrdersModule,
    RefundsModule,
    NotificationsModule,
    PasabuyModule,
    ReportsModule,
    SubscriptionsModule,
    FeaturedListingsModule,
    AdminModule,
  ],
})
export class AppModule {}