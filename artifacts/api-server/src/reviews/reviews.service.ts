import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

const RECENT_REVIEW_COUNT = 5;

/** "Maria Santos" -> "Maria S." so reviews don't expose full student names. */
function displayName(fullName: string | null): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Student';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function average(sum: number, count: number): number | null {
  return count === 0 ? null : Math.round((sum / count) * 10) / 10;
}

const REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  customer: { select: { fullName: true } },
} satisfies Prisma.ReviewSelect;

type ReviewRow = Prisma.ReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

function toReviewView(review: ReviewRow) {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    reviewerName: displayName(review.customer.fullName),
  };
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(userId: string, orderId: string, dto: CreateReviewDto) {
    const comment = dto.comment?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: orderId, customerId: userId },
          select: { vendorId: true, status: true, pickupConfirmedAt: true },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status !== OrderStatus.COMPLETED || !order.pickupConfirmedAt) {
          throw new BadRequestException('You can review an order after confirming pickup');
        }

        // The unique orderId index makes a double submit fail with P2002.
        const review = await tx.review.create({
          data: {
            orderId,
            vendorId: order.vendorId,
            customerId: userId,
            rating: dto.rating,
            comment,
          },
          select: { id: true, rating: true, comment: true, createdAt: true },
        });

        // Atomic increments keep the denormalised aggregates exact under concurrency.
        await tx.vendor.update({
          where: { id: order.vendorId },
          data: { ratingCount: { increment: 1 }, ratingSum: { increment: dto.rating } },
        });

        return review;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('You have already reviewed this order');
      }
      throw error;
    }
  }

  async listVendorReviews(vendorId: string, page = 1, pageSize = 10) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { ratingCount: true, ratingSum: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const reviews = await this.prisma.review.findMany({
      where: { vendorId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: REVIEW_SELECT,
    });

    return {
      averageRating: average(vendor.ratingSum, vendor.ratingCount),
      ratingCount: vendor.ratingCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(vendor.ratingCount / pageSize)),
      reviews: reviews.map(toReviewView),
    };
  }

  async getOwnVendorSummary(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId: userId },
      select: { id: true, ratingCount: true, ratingSum: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found for this user');

    const [distribution, recent] = await Promise.all([
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { vendorId: vendor.id },
        _count: { _all: true },
      }),
      this.prisma.review.findMany({
        where: { vendorId: vendor.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_REVIEW_COUNT,
        select: REVIEW_SELECT,
      }),
    ]);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of distribution) counts[row.rating] = row._count._all;

    return {
      averageRating: average(vendor.ratingSum, vendor.ratingCount),
      ratingCount: vendor.ratingCount,
      distribution: counts,
      recentReviews: recent.map(toReviewView),
    };
  }
}
