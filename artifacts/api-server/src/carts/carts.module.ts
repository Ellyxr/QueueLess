import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { PricingModule } from '../common/pricing/pricing.module';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';

@Module({
  imports: [PrismaModule, PricingModule],
  controllers: [CartsController],
  providers: [CartsService],
})
export class CartsModule {}