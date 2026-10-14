import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

const REVIEW_SELECT = {
  id: true,
  orderId: true,
  vendorId: true,
  rating: true,
  comment: true,
  createdAt: true,
} satisfies Prisma.OrderReviewSelect;

/**
 * US-063: a student reviews an order they placed once it has been picked up
 * (COMPLETED). One review per order, enforced by a unique index; rating 1-5
 * is validated by the DTO and by a database CHECK constraint.
 */
@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(userId: string, orderId: string, dto: CreateReviewDto) {
    const order = await this.findOwnOrder(userId, orderId);

    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('You can review an order after you have picked it up');
    }
    if (order.review) {
      throw new ConflictException('You have already reviewed this order');
    }

    const comment = dto.comment?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const review = await tx.orderReview.create({
          data: {
            orderId: order.id,
            reviewerUserId: userId,
            vendorId: order.vendorId,
            rating: dto.rating,
            comment,
          },
          select: REVIEW_SELECT,
        });
        await tx.auditRecord.create({ data: {
          actorUserId: userId, actionType: 'REVIEW_CREATED',
          entityType: 'OrderReview', entityId: review.id,
          afterState: { orderId: order.id, vendorId: order.vendorId, rating: dto.rating,
            hasComment: comment !== null },
        } });
        return review;
      });
    } catch (error) {
      // Two submissions at once: the unique index lets only one through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this order');
      }
      throw error;
    }
  }

  async getMyReview(userId: string, orderId: string) {
    const order = await this.findOwnOrder(userId, orderId);
    if (!order.review) throw new NotFoundException('This order has not been reviewed yet');
    return order.review;
  }

  // Someone else's order (or a missing one) is reported the same way: 404.
  private async findOwnOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        customerId: true,
        vendorId: true,
        status: true,
        review: { select: REVIEW_SELECT },
      },
    });
    if (!order || order.customerId !== userId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }
}
