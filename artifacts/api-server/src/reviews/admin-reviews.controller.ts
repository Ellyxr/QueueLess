import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { HideReviewDto, RestoreReviewDto } from './dto/moderate-review.dto';
import { ReviewsService } from './reviews.service';

// US-066: admin moderation of reported reviews.
@ApiTags('Admin reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':reviewId/hide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Hide a review from listings and ratings (optionally resolving its report)' })
  @ApiResponse({ status: 404, description: 'Review or report not found' })
  @ApiResponse({ status: 409, description: 'Already hidden' })
  async hide(
    @CurrentUser() admin: JwtPayload,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: HideReviewDto,
  ) {
    return this.reviewsService.hideReview(admin.sub, reviewId, dto);
  }

  @Post(':reviewId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a hidden review' })
  @ApiResponse({ status: 409, description: 'Not hidden' })
  async restore(
    @CurrentUser() admin: JwtPayload,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: RestoreReviewDto,
  ) {
    return this.reviewsService.restoreReview(admin.sub, reviewId, dto);
  }
}
