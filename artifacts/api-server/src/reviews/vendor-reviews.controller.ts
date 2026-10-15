import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ListVendorReviewsDto } from './dto/list-vendor-reviews.dto';
import { ReviewsService } from './reviews.service';

// US-064: the storefront Reviews tab. Readable by any signed-in user, like
// the storefront itself.
@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendors')
export class VendorReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  // US-065. Three segments, so it never matches ':vendorId/reviews' below.
  @Get('mine/reviews/summary')
  @UseGuards(RolesGuard)
  @Roles('VENDOR_OWNER')
  @ApiOperation({ summary: 'My store rating summary (all time and last 30 days) and latest reviews' })
  @ApiResponse({ status: 404, description: 'No vendor profile for this user' })
  async getMyVendorReviewSummary(@CurrentUser() user: JwtPayload) {
    return this.reviewsService.getMyVendorReviewSummary(user.sub);
  }

  @Get(':vendorId/reviews')
  @ApiOperation({ summary: "A vendor's reviews, newest first, with the rating summary" })
  @ApiResponse({ status: 200, description: 'summary + one page of reviews' })
  @ApiResponse({ status: 400, description: 'Invalid page or pageSize (1-50)' })
  @ApiResponse({ status: 404, description: 'Vendor not found or not active' })
  async listVendorReviews(
    @CurrentUser() user: JwtPayload,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Query() query: ListVendorReviewsDto,
  ) {
    return this.reviewsService.listVendorReviews(vendorId, user.sub, query);
  }
}
