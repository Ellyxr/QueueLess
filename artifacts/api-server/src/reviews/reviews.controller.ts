import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('orders/:orderId/review')
  @UseGuards(RolesGuard)
  @Roles('BUYER')
  @ApiOperation({ summary: 'Review a completed order (one review per order)' })
  createReview(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.sub, orderId, dto);
  }

  @Get('vendors/:vendorId/reviews')
  @ApiOperation({ summary: 'Paginated reviews and rating summary for a vendor storefront' })
  listVendorReviews(
    @Param('vendorId') vendorId: string,
    @Query() query: ListReviewsQueryDto,
  ) {
    return this.reviewsService.listVendorReviews(vendorId, query.page, query.pageSize);
  }

  @Get('reviews/me/summary')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiOperation({ summary: 'Rating summary and recent reviews for the authenticated vendor' })
  getOwnVendorSummary(@CurrentUser() user: JwtPayload) {
    return this.reviewsService.getOwnVendorSummary(user.sub);
  }
}
