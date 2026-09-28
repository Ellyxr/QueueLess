import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { FeaturedListingPlacement, FeaturedListingStatus, PaymentPurpose, PaymentStatus, Prisma, VendorStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { CreateFeaturedListingDto, CreateFeaturedPlanDto } from './dto/featured-listing.dto';

@Injectable()
export class FeaturedListingsService {
  private readonly logger = new Logger(FeaturedListingsService.name);

  constructor(private readonly prisma: PrismaService, private readonly paymongo: PaymongoService) {}

  plans() {
    return this.prisma.featuredListingPlan.findMany({
      where: { isActive: true }, orderBy: [{ placement: 'asc' }, { price: 'asc' }],
    });
  }

  async createPlan(dto: CreateFeaturedPlanDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Plan name is required');
    try {
      return await this.prisma.featuredListingPlan.create({
        data: { name, placement: dto.placement, price: dto.price, durationDays: dto.durationDays },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Featured listing plan name already exists');
      }
      throw error;
    }
  }

  async updatePlan(id: string, isActive: boolean) {
    const updated = await this.prisma.featuredListingPlan.updateMany({
      where: { id }, data: { isActive },
    });
    if (!updated.count) throw new NotFoundException('Featured listing plan not found');
    return this.prisma.featuredListingPlan.findUniqueOrThrow({ where: { id } });
  }

  async mine(userId: string) {
    const vendor = await this.ownedVendor(userId);
    return this.prisma.featuredListing.findMany({
      where: { vendorId: vendor.id }, include: {
        plan: true, product: { select: { id: true, name: true, isAvailable: true } },
        payments: { select: { id: true, status: true, amount: true, currency: true, createdAt: true } },
      }, orderBy: { createdAt: 'desc' }, take: 50,
    });
  }

  list(placement?: FeaturedListingPlacement) {
    const now = new Date();
    return this.prisma.featuredListing.findMany({
      where: {
        status: FeaturedListingStatus.ACTIVE,
        startDate: { lte: now }, endDate: { gt: now },
        vendor: { status: VendorStatus.ACTIVE },
        OR: [{ productId: null }, { product: { isAvailable: true } }],
        ...(placement ? { placement } : {}),
      },
      select: {
        id: true, placement: true, startDate: true, endDate: true,
        vendor: { select: { id: true, name: true, businessName: true, campusLocation: true } },
        product: { select: { id: true, name: true, imageUrl: true } },
      },
      orderBy: { startDate: 'desc' }, take: 100,
    });
  }

  async create(userId: string, dto: CreateFeaturedListingDto) {
    const vendor = await this.ownedVendor(userId);
    if (vendor.status !== VendorStatus.ACTIVE) {
      throw new ConflictException('Only active vendors can buy featured listings');
    }
    const plan = await this.prisma.featuredListingPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) throw new NotFoundException('Featured listing plan not found');
    if (!plan.isActive || plan.price.lessThan(1) || plan.durationDays < 1) {
      throw new ConflictException('Featured listing plan is not available');
    }
    if (plan.placement === FeaturedListingPlacement.PRODUCT_SPOTLIGHT) {
      if (!dto.productId) throw new BadRequestException('Product is required for this placement');
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, vendorId: vendor.id, isAvailable: true }, select: { id: true },
      });
      if (!product) throw new NotFoundException('Available vendor product not found');
    } else if (dto.productId) {
      throw new BadRequestException('Product is only accepted for PRODUCT_SPOTLIGHT');
    }
    await this.expireVendor(vendor.id);
    let listing: { id: string };
    try {
      listing = await this.prisma.$transaction(async (tx) => {
        const created = await tx.featuredListing.create({ data: {
          vendorId: vendor.id, planId: plan.id, placement: plan.placement,
          productId: dto.productId ?? null, status: FeaturedListingStatus.PENDING,
        } });
        await tx.payment.create({ data: {
          payerUserId: userId, purpose: PaymentPurpose.FEATURED_LISTING,
          featuredListingId: created.id, amount: plan.price,
          currency: 'PHP', status: PaymentStatus.PENDING,
        } });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Vendor already has a pending or active listing for this placement');
      }
      throw error;
    }
    return this.checkout(userId, listing.id);
  }

  async checkout(userId: string, id: string) {
    const vendor = await this.ownedVendor(userId);
    if (vendor.status !== VendorStatus.ACTIVE) throw new ConflictException('Vendor is not active');
    const listing = await this.prisma.featuredListing.findFirst({
      where: { id, vendorId: vendor.id }, include: { plan: true, product: true, payments: true },
    });
    if (!listing) throw new NotFoundException('Featured listing not found');
    if (listing.status !== FeaturedListingStatus.PENDING || !listing.plan) {
      throw new ConflictException('Featured listing is not awaiting payment');
    }
    if (listing.productId && !listing.product?.isAvailable) {
      throw new ConflictException('Featured product is unavailable');
    }
    const payment = listing.payments[0];
    if (!payment || payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException('Featured listing payment is not pending');
    }
    if (payment.checkoutUrl && payment.providerPaymentId) {
      return this.checkoutResponse(listing.id, payment.id, payment.amount, payment.checkoutUrl, true);
    }
    const reserved = await this.prisma.payment.updateMany({
      where: { id: payment.id, providerPaymentId: null, checkoutUrl: null },
      data: { checkoutUrl: 'CREATING' },
    });
    if (!reserved.count) throw new ConflictException('Checkout is being created');
    try {
      const result = await this.paymongo.createCheckoutSession({
        amount: payment.amount.mul(100).toNumber(),
        description: `QueueLess featured listing ${listing.id}`,
        referenceNumber: payment.id, featuredListingId: listing.id,
        itemName: listing.plan.name,
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: {
        providerPaymentId: result.checkoutSessionId, checkoutUrl: result.checkoutUrl,
      } });
      return this.checkoutResponse(listing.id, payment.id, payment.amount, result.checkoutUrl, false);
    } catch (error) {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, checkoutUrl: 'CREATING', providerPaymentId: null },
        data: { checkoutUrl: null },
      });
      throw error;
    }
  }

  private checkoutResponse(listingId: string, paymentId: string, amount: Prisma.Decimal, checkoutUrl: string, idempotentReplay: boolean) {
    return { listingId, paymentId, amount: amount.toFixed(2), currency: 'PHP',
      checkoutUrl, status: 'PENDING', idempotentReplay };
  }

  private async ownedVendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId: userId }, select: { id: true, status: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private async expireVendor(vendorId: string) {
    await this.prisma.featuredListing.updateMany({
      where: { vendorId, status: FeaturedListingStatus.ACTIVE, endDate: { lte: new Date() } },
      data: { status: FeaturedListingStatus.EXPIRED },
    });
  }

  @Interval(60_000)
  async expireListings() {
    await this.prisma.featuredListing.updateMany({
      where: { status: FeaturedListingStatus.ACTIVE, endDate: { lte: new Date() } },
      data: { status: FeaturedListingStatus.EXPIRED },
    });
    const stale = await this.prisma.featuredListing.findMany({
      where: { status: FeaturedListingStatus.PENDING,
        createdAt: { lte: new Date(Date.now() - 30 * 60_000) } },
      select: { id: true, payments: { select: { id: true, providerPaymentId: true, status: true } } },
      take: 50,
    });
    for (const listing of stale) {
      try {
        const payment = listing.payments[0];
        if (!payment || payment.status === PaymentStatus.SUCCEEDED) continue;
        if (payment.providerPaymentId &&
          !(await this.paymongo.expireCheckoutSession(payment.providerPaymentId))) continue;
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.featuredListing.updateMany({
            where: { id: listing.id, status: FeaturedListingStatus.PENDING },
            data: { status: FeaturedListingStatus.CANCELLED },
          });
          if (changed.count) await tx.payment.updateMany({
            where: { featuredListingId: listing.id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.FAILED },
          });
        });
      } catch (error) {
        this.logger.warn(`Could not expire featured listing ${listing.id}: ${String(error)}`);
      }
    }
  }
}
