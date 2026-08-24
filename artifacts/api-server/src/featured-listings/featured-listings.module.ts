import { Module } from '@nestjs/common';
import { FeaturedListingsController } from './featured-listings.controller';
import { FeaturedListingsService } from './featured-listings.service';

@Module({ controllers: [FeaturedListingsController], providers: [FeaturedListingsService] })
export class FeaturedListingsModule {}
