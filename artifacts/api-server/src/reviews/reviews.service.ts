import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, ReportStatus, VendorStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { HideReviewDto, RestoreReviewDto } from './dto/moderate-review.dto';
import { ListVendorReviewsDto } from './dto/list-vendor-reviews.dto';
import { VISIBLE_REVIEW, reviewerDisplayName, summarizeRatings } from './review-summary';

// US-065: vendor's own summary page.
export const RECENT_REVIEWS_LIMIT = 5;
export const RECENT_WINDOW_DAYS = 30;

const REVIEW_SELECT = {
  id: true,
  orderId: true,
  vendorId: true,
  rating: true,
  comment: true,
  createdAt: true,
  // US-066: the author can see their own review was hidden (not why).
  hiddenAt: true,
} satisfies Prisma.OrderReviewSelect;

const MODERATION_SELECT = {
  id: true,
  orderId: true,
  vendorId: true,
  rating: true,
  comment: true,
  hiddenAt: true,
  hiddenByUserId: true,
  hiddenReason: true,
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

  /**
   * US-064: a vendor's reviews for the storefront Reviews tab, newest first
   * (id breaks ties so pages never overlap), with the rating summary. Visible
   * for active vendors, or to the owner for their own store, like the
   * storefront itself. Reviewers are shown as first name + last initial.
   */
  async listVendorReviews(vendorId: string, userId: string, query: ListVendorReviewsDto) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, OR: [{ status: VendorStatus.ACTIVE }, { ownerUserId: userId }] },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    const { page, pageSize } = query;
    const [groups, reviews] = await Promise.all([
      this.prisma.orderReview.groupBy({
        by: ['rating'],
        where: { vendorId, ...VISIBLE_REVIEW },
        _count: { _all: true },
      }),
      this.prisma.orderReview.findMany({
        where: { vendorId, ...VISIBLE_REVIEW },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          reviewer: { select: { fullName: true } },
        },
      }),
    ]);
    const summary = summarizeRatings(groups);

    return {
      vendorId,
      summary,
      page,
      pageSize,
      total: summary.totalReviews,
      totalPages: Math.ceil(summary.totalReviews / pageSize),
      items: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: { displayName: reviewerDisplayName(review.reviewer.fullName) },
      })),
    };
  }

  /**
   * US-065: the signed-in vendor owner's own rating summary (all time and the
   * last 30 days, to see whether service is improving) and latest reviews,
   * with the order reference so the vendor can look the order up.
   */
  async getMyVendorReviewSummary(ownerUserId: string, now: Date = new Date()) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId },
      select: { id: true, name: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found for this user');

    const since = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [allTime, recentWindow, latest] = await Promise.all([
      this.prisma.orderReview.groupBy({
        by: ['rating'],
        where: { vendorId: vendor.id, ...VISIBLE_REVIEW },
        _count: { _all: true },
      }),
      this.prisma.orderReview.groupBy({
        by: ['rating'],
        where: { vendorId: vendor.id, ...VISIBLE_REVIEW, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      this.prisma.orderReview.findMany({
        where: { vendorId: vendor.id, ...VISIBLE_REVIEW },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_REVIEWS_LIMIT,
        select: {
          id: true,
          orderId: true,
          rating: true,
          comment: true,
          createdAt: true,
          reviewer: { select: { fullName: true } },
        },
      }),
    ]);
    const last30Days = summarizeRatings(recentWindow);

    return {
      vendor,
      summary: summarizeRatings(allTime),
      last30Days: { averageRating: last30Days.averageRating, totalReviews: last30Days.totalReviews },
      recentReviews: latest.map((review) => ({
        id: review.id,
        orderReference: review.orderId.slice(0, 8).toUpperCase(),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: { displayName: reviewerDisplayName(review.reviewer.fullName) },
      })),
    };
  }

  /**
   * US-066: an admin hides a review (excluded from every listing and rating
   * aggregate). Audit-logged with the reason. If a report prompted it and is
   * still open, that report is resolved in the same transaction.
   */
  async hideReview(adminUserId: string, reviewId: string, dto: HideReviewDto, now: Date = new Date()) {
    const reason = dto.reason.trim();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM order_reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;
      const review = await tx.orderReview.findUnique({
        where: { id: reviewId },
        select: { id: true, hiddenAt: true, vendorId: true },
      });
      if (!review) throw new NotFoundException('Review not found');
      if (review.hiddenAt) throw new ConflictException('This review is already hidden');

      let resolvedReport: string | null = null;
      if (dto.reportId) {
        const report = await tx.report.findUnique({
          where: { id: dto.reportId },
          select: { id: true, status: true, reportedReviewId: true },
        });
        if (!report) throw new NotFoundException('Report not found');
        if (report.reportedReviewId !== reviewId) {
          throw new BadRequestException('That report is not about this review');
        }
        if (report.status === ReportStatus.OPEN || report.status === ReportStatus.IN_REVIEW) {
          const note = `Review hidden: ${reason}`;
          await tx.report.update({ where: { id: report.id }, data: { status: ReportStatus.RESOLVED } });
          await tx.reportStatusHistory.create({
            data: { reportId: report.id, status: ReportStatus.RESOLVED, adminUserId, note },
          });
          await tx.auditRecord.create({ data: {
            actorUserId: adminUserId, actionType: 'REPORT_STATUS_UPDATED',
            entityType: 'Report', entityId: report.id,
            beforeState: { status: report.status },
            afterState: { status: ReportStatus.RESOLVED, note },
          } });
          resolvedReport = report.id;
        }
      }

      const hidden = await tx.orderReview.update({
        where: { id: reviewId },
        data: { hiddenAt: now, hiddenByUserId: adminUserId, hiddenReason: reason },
        select: MODERATION_SELECT,
      });
      await tx.auditRecord.create({ data: {
        actorUserId: adminUserId, actionType: 'REVIEW_HIDDEN',
        entityType: 'OrderReview', entityId: reviewId,
        beforeState: { hiddenAt: null },
        afterState: { hiddenAt: now.toISOString(), reason, reportId: dto.reportId ?? null,
          vendorId: review.vendorId },
      } });
      return { ...hidden, resolvedReportId: resolvedReport };
    });
  }

  /** US-066: an admin restores a hidden review; audit-logged. */
  async restoreReview(adminUserId: string, reviewId: string, dto: RestoreReviewDto) {
    const reason = dto.reason?.trim() || null;
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM order_reviews WHERE id = ${reviewId}::uuid FOR UPDATE`;
      const review = await tx.orderReview.findUnique({
        where: { id: reviewId },
        select: { id: true, hiddenAt: true, hiddenReason: true, vendorId: true },
      });
      if (!review) throw new NotFoundException('Review not found');
      if (!review.hiddenAt) throw new ConflictException('This review is not hidden');

      const restored = await tx.orderReview.update({
        where: { id: reviewId },
        data: { hiddenAt: null, hiddenByUserId: null, hiddenReason: null },
        select: MODERATION_SELECT,
      });
      await tx.auditRecord.create({ data: {
        actorUserId: adminUserId, actionType: 'REVIEW_RESTORED',
        entityType: 'OrderReview', entityId: reviewId,
        beforeState: { hiddenAt: review.hiddenAt.toISOString(), reason: review.hiddenReason },
        afterState: { hiddenAt: null, reason, vendorId: review.vendorId },
      } });
      return restored;
    });
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
