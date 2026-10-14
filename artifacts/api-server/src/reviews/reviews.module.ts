import { Module } from '@nestjs/common';
import { AdminReviewsController } from './admin-reviews.controller';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { VendorReviewsController } from './vendor-reviews.controller';

@Module({
  controllers: [ReviewsController, VendorReviewsController, AdminReviewsController],
  providers: [ReviewsService],
})
export class ReviewsModule {}
