import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { VendorReviewsController } from './vendor-reviews.controller';

@Module({
  controllers: [ReviewsController, VendorReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
