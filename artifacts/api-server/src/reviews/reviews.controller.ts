import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('Reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('BUYER')
@Controller('orders')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post(':orderId/review')
  @ApiOperation({ summary: 'Review my order after pickup (one review per order)' })
  @ApiResponse({ status: 201, description: 'Review created' })
  @ApiResponse({ status: 400, description: 'Invalid rating/comment, or order not picked up yet' })
  @ApiResponse({ status: 404, description: 'Order not found or not mine' })
  @ApiResponse({ status: 409, description: 'Order already reviewed' })
  async createReview(
    @CurrentUser() user: JwtPayload,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.sub, orderId, dto);
  }

  @Get(':orderId/review')
  @ApiOperation({ summary: 'My review of an order' })
  async getMyReview(
    @CurrentUser() user: JwtPayload,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.reviewsService.getMyReview(user.sub, orderId);
  }
}
