import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PaymentPurpose, PaymentStatus, Prisma, VendorSubscriptionStatus, VendorStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PaymongoService } from '../payments/paymongo.service';
import { CreatePlanDto } from './dto/subscription.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly prisma: PrismaService, private readonly paymongo: PaymongoService) {}

  plans() {
    return this.prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
  }

  async createPlan(dto: CreatePlanDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Plan name is required');
    try {
      return await this.prisma.subscriptionPlan.create({
        data: { name, price: dto.price, durationDays: dto.durationDays,
          benefitsDescription: dto.benefitsDescription?.trim() || null },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A plan with this name already exists');
      }
      throw error;
    }
  }

  async mine(userId: string) {
    const vendor = await this.ownedVendor(userId);
    return this.prisma.vendorSubscription.findMany({
      where: { vendorId: vendor.id },
      include: { plan: true, payments: {
        select: { id: true, status: true, amount: true, currency: true, createdAt: true },
      } },
      orderBy: { createdAt: 'desc' }, take: 20,
    });
  }

  async subscribe(userId: string, planId: string) {
    const vendor = await this.ownedVendor(userId);
    if (vendor.status !== VendorStatus.ACTIVE) {
      throw new ConflictException('Only active vendors can subscribe');
    }
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');
    if (plan.price.lessThan(1) || plan.durationDays < 1) {
      throw new ConflictException('Subscription plan is not available for checkout');
    }
    await this.expireVendor(vendor.id);

    let subscription: { id: string };
    try {
      subscription = await this.prisma.$transaction(async (tx) => {
        const created = await tx.vendorSubscription.create({
          data: { vendorId: vendor.id, planId, status: VendorSubscriptionStatus.PENDING },
        });
        await tx.payment.create({ data: {
          payerUserId: userId,
          purpose: PaymentPurpose.SUBSCRIPTION,
          vendorSubscriptionId: created.id,
          amount: plan.price, currency: 'PHP', status: PaymentStatus.PENDING,
        } });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Vendor already has a pending or active subscription');
      }
      throw error;
    }
    return this.checkout(userId, subscription.id);
  }

  async checkout(userId: string, id: string) {
    const vendor = await this.ownedVendor(userId);
    if (vendor.status !== VendorStatus.ACTIVE) throw new ConflictException('Vendor is not active');
    const subscription = await this.prisma.vendorSubscription.findFirst({
      where: { id, vendorId: vendor.id }, include: { plan: true, payments: true },
    });
    if (!subscription) throw new NotFoundException('Vendor subscription not found');
    if (subscription.status !== VendorSubscriptionStatus.PENDING) {
      throw new ConflictException('Subscription is not awaiting payment');
    }
    const payment = subscription.payments[0];
    if (!payment || payment.status !== PaymentStatus.PENDING) {
      throw new ConflictException('Subscription payment is not pending');
    }
    if (payment.checkoutUrl && payment.providerPaymentId) {
      return this.checkoutResponse(subscription.id, payment.id, payment.amount, payment.checkoutUrl, true);
    }
    // Claim checkout creation so two requests cannot create separate provider sessions.
    const reserved = await this.prisma.payment.updateMany({
      where: { id: payment.id, providerPaymentId: null, checkoutUrl: null },
      data: { checkoutUrl: 'CREATING' },
    });
    if (!reserved.count) throw new ConflictException('Checkout is being created');
    try {
      const result = await this.paymongo.createCheckoutSession({
        amount: payment.amount.mul(100).toNumber(),
        description: `QueueLess vendor subscription ${subscription.id}`,
        referenceNumber: payment.id,
        vendorSubscriptionId: subscription.id,
        itemName: subscription.plan.name,
      });
      await this.prisma.payment.update({ where: { id: payment.id }, data: {
        providerPaymentId: result.checkoutSessionId, checkoutUrl: result.checkoutUrl,
      } });
      return this.checkoutResponse(subscription.id, payment.id, payment.amount, result.checkoutUrl, false);
    } catch (error) {
      await this.prisma.payment.updateMany({
        where: { id: payment.id, checkoutUrl: 'CREATING', providerPaymentId: null },
        data: { checkoutUrl: null },
      });
      throw error;
    }
  }

  private checkoutResponse(subscriptionId: string, paymentId: string, amount: Prisma.Decimal, checkoutUrl: string, idempotentReplay: boolean) {
    return { subscriptionId, paymentId, amount: amount.toFixed(2), currency: 'PHP',
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
    await this.prisma.vendorSubscription.updateMany({
      where: { vendorId, status: VendorSubscriptionStatus.ACTIVE, endDate: { lte: new Date() } },
      data: { status: VendorSubscriptionStatus.EXPIRED },
    });
  }

  @Interval(60_000)
  async expireSubscriptions() {
    await this.prisma.vendorSubscription.updateMany({
      where: { status: VendorSubscriptionStatus.ACTIVE, endDate: { lte: new Date() } },
      data: { status: VendorSubscriptionStatus.EXPIRED },
    });
    const stale = await this.prisma.vendorSubscription.findMany({
      where: { status: VendorSubscriptionStatus.PENDING,
        createdAt: { lte: new Date(Date.now() - 30 * 60_000) } },
      select: { id: true, payments: { select: { id: true, providerPaymentId: true, status: true } } },
      take: 50,
    });
    for (const subscription of stale) {
      try {
        const payment = subscription.payments[0];
        if (!payment || payment.status === PaymentStatus.SUCCEEDED) continue;
        if (payment.providerPaymentId &&
          !(await this.paymongo.expireCheckoutSession(payment.providerPaymentId))) continue;
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.vendorSubscription.updateMany({
            where: { id: subscription.id, status: VendorSubscriptionStatus.PENDING },
            data: { status: VendorSubscriptionStatus.CANCELLED },
          });
          if (changed.count) await tx.payment.updateMany({
            where: { vendorSubscriptionId: subscription.id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.FAILED },
          });
        });
      } catch (error) {
        this.logger.warn(`Could not expire subscription ${subscription.id}: ${String(error)}`);
      }
    }
  }
}
