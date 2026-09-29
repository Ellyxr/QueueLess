import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DealDiscountType, DealTriggerType, Prisma, VendorStatus, VendorType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDealDto, UpdateDealDto } from './dto/deal.dto';

const DEAL_SELECT = {
  id: true, vendorId: true, productId: true, discountType: true, discountValue: true,
  triggerType: true, triggerValue: true, isActive: true, createdAt: true, updatedAt: true,
  product: { select: { id: true, name: true, price: true, imageUrl: true } },
} as const;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ownedVendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
    if (!vendor) throw new ForbiddenException('Authenticated user does not own a vendor account');
    return vendor;
  }

  private validateDiscountValue(discountType: DealDiscountType, discountValue: number) {
    if (discountType === DealDiscountType.PERCENTAGE && (discountValue < 1 || discountValue > 100)) {
      throw new BadRequestException('Percentage discounts must be between 1 and 100');
    }
  }

  private normalizeTrigger(triggerType: DealTriggerType | undefined, triggerValue: number | undefined) {
    const type = triggerType ?? DealTriggerType.NONE;
    if (type === DealTriggerType.NONE) return { triggerType: type, triggerValue: null };
    if (triggerValue === undefined || triggerValue <= 0) {
      throw new BadRequestException('A trigger value is required when a minimum-order trigger is selected');
    }
    return { triggerType: type, triggerValue };
  }

  async mine(userId: string) {
    const vendor = await this.ownedVendor(userId);
    return this.prisma.deal.findMany({
      where: { vendorId: vendor.id }, select: DEAL_SELECT, orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, dto: CreateDealDto) {
    const vendor = await this.ownedVendor(userId);
    this.validateDiscountValue(dto.discountType, dto.discountValue);
    const trigger = this.normalizeTrigger(dto.triggerType, dto.triggerValue);

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, vendorId: vendor.id }, select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found for this vendor');

    return this.prisma.deal.create({
      data: {
        vendorId: vendor.id, productId: dto.productId,
        discountType: dto.discountType, discountValue: dto.discountValue,
        triggerType: trigger.triggerType, triggerValue: trigger.triggerValue,
      },
      select: DEAL_SELECT,
    });
  }

  async update(userId: string, id: string, dto: UpdateDealDto) {
    const vendor = await this.ownedVendor(userId);
    const deal = await this.prisma.deal.findUnique({ where: { id }, select: { id: true, vendorId: true, discountType: true, discountValue: true } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (deal.vendorId !== vendor.id) throw new ForbiddenException('You do not have permission to modify this deal');

    const data: Prisma.DealUpdateInput = {};
    const discountType = dto.discountType ?? deal.discountType;
    const discountValue = dto.discountValue ?? Number(deal.discountValue);
    if (dto.discountType !== undefined || dto.discountValue !== undefined) {
      this.validateDiscountValue(discountType, discountValue);
      data.discountType = discountType;
      data.discountValue = discountValue;
    }
    if (dto.triggerType !== undefined || dto.triggerValue !== undefined) {
      const trigger = this.normalizeTrigger(dto.triggerType, dto.triggerValue);
      data.triggerType = trigger.triggerType;
      data.triggerValue = trigger.triggerValue;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.deal.update({ where: { id }, data, select: DEAL_SELECT });
  }

  async remove(userId: string, id: string) {
    const vendor = await this.ownedVendor(userId);
    const deal = await this.prisma.deal.findUnique({ where: { id }, select: { id: true, vendorId: true } });
    if (!deal) throw new NotFoundException('Deal not found');
    if (deal.vendorId !== vendor.id) throw new ForbiddenException('You do not have permission to delete this deal');
    await this.prisma.deal.delete({ where: { id } });
    return { message: 'Deal deleted successfully' };
  }

  /**
   * Deals with no minimum-order trigger surface first (they discount instantly and are the
   * most eye-catching), ties broken by the larger effective discount percentage.
   */
  async active(vendorType?: VendorType) {
    const deals = await this.prisma.deal.findMany({
      where: {
        isActive: true,
        vendor: { status: VendorStatus.ACTIVE, ...(vendorType ? { vendorType } : {}) },
        product: { isAvailable: true },
      },
      select: {
        id: true, discountType: true, discountValue: true, triggerType: true, triggerValue: true,
        vendor: { select: { id: true, name: true, businessName: true, vendorType: true } },
        product: { select: { id: true, name: true, price: true, imageUrl: true } },
      },
      take: 100,
    });

    const effectivePercent = (deal: (typeof deals)[number]) =>
      deal.discountType === DealDiscountType.PERCENTAGE
        ? Number(deal.discountValue)
        : (Number(deal.discountValue) / Number(deal.product.price)) * 100;

    return deals.sort((a, b) => {
      const aImmediate = a.triggerType === DealTriggerType.NONE ? 0 : 1;
      const bImmediate = b.triggerType === DealTriggerType.NONE ? 0 : 1;
      if (aImmediate !== bImmediate) return aImmediate - bImmediate;
      return effectivePercent(b) - effectivePercent(a);
    });
  }
}
