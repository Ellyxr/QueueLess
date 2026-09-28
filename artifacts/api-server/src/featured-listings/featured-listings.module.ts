import { Module } from '@nestjs/common';
import { PaymongoModule } from '../payments/paymongo.module';
import { FeaturedListingsController } from './featured-listings.controller';
import { FeaturedListingsService } from './featured-listings.service';

@Module({ imports: [PaymongoModule], controllers: [FeaturedListingsController], providers: [FeaturedListingsService] })
export class FeaturedListingsModule {}
