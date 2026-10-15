import { lockVendorWallet } from '../featured-listings/featured-pricing.policy';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { LedgerEntryType, Prisma, VendorStatus } from '@prisma/client';
import type { UserRole } from '../auth/roles';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpdateVendorPreorderAvailabilityDto } from './dto/update-vendor-preorder-availability.dto';
import { UpdateVendorAvailabilityDto } from './dto/update-vendor-availability.dto';
import { VISIBLE_REVIEW, summarizeRatings } from '../reviews/review-summary';
import {
  MANILA_TZ,
  computeAvailabilityStatus,
  nextStoreOpening,
  preorderPickupStatus,
  storefrontPreorderInfo,
  resolvePreorderWindows,
  sortWindows,
  validateDaySchedule,
  validatePickupWindows,
} from './availability.util';

const PREORDER_AVAILABILITY_SELECT = {
  dayOfWeek: true,
  isEnabled: true,
  openTime: true,
  closeTime: true,
} satisfies Prisma.VendorPreorderAvailabilitySelect;

const AVAILABILITY_SELECT = {
  dayOfWeek: true,
  isOpen: true,
  openTime: true,
  closeTime: true,
} satisfies Prisma.VendorAvailabilitySelect;

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveVendors() {
    const vendors = await this.prisma.vendor.findMany({
      where: {
        status: VendorStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        description: true,
        campusLocation: true,
        categoryOrder: true,
        vendorType: true,
        status: true,
        products: {
          where: {
            isAvailable: true,
          },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            category: true,
            preparationTimeMinutes: true,
            isAvailable: true,
            imageUrl: true,
            imageFileId: true,
            eligibleExtras: {
              select: {
                id: true,
                name: true,
                price: true,
                description: true,
              },
            },
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // US-065: average rating per vendor, from one grouped query for the
    // whole list rather than one query per vendor.
    const ratingGroups = vendors.length
      ? await this.prisma.orderReview.groupBy({
          by: ['vendorId', 'rating'],
          where: { vendorId: { in: vendors.map((vendor) => vendor.id) }, ...VISIBLE_REVIEW },
          _count: { _all: true },
        })
      : [];
    const groupsByVendor = new Map<string, typeof ratingGroups>();
    for (const group of ratingGroups) {
      groupsByVendor.set(group.vendorId, [...(groupsByVendor.get(group.vendorId) ?? []), group]);
    }

    return vendors.map((vendor) => {
      const { averageRating, totalReviews } = summarizeRatings(groupsByVendor.get(vendor.id) ?? []);
      return { ...vendor, averageRating, totalReviews };
    });
  }

  async getVendorStorefront(vendorId: string, userId: string, now: Date = new Date()) {
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        id: vendorId,
        OR: [{ status: VendorStatus.ACTIVE }, { ownerUserId: userId }],
      },
      select: {
        id: true,
        name: true,
        description: true,
        campusLocation: true,
        categoryOrder: true,
        vendorType: true,
        status: true,
        preorderEnabled: true,
        preorderSameAsStoreHours: true,
        preorderMinLeadTimeMinutes: true,
        availability: {
          select: AVAILABILITY_SELECT,
        },
        preorderAvailability: {
          select: PREORDER_AVAILABILITY_SELECT,
        },
        products: {
          where: {},
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            category: true,
            preparationTimeMinutes: true,
            isAvailable: true,
            imageUrl: true,
            imageFileId: true,
            eligibleExtras: {
              select: {
                id: true,
                name: true,
                price: true,
                description: true,
              },
            },
          },
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: { favoritedBy: true },
        },
        favoritedBy: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const { _count, favoritedBy, availability, preorderAvailability, preorderSameAsStoreHours, ...rest } =
      vendor;

    // Computed from the vendor schedule and server time (Asia/Manila).
    const { isOpenNow, nextAvailableLabel } = computeAvailabilityStatus(availability, now);
    const schedule = { preorderSameAsStoreHours, preorderAvailability, availability };

    // US-064: rating summary for the Reviews tab header.
    const ratingGroups = await this.prisma.orderReview.groupBy({
      by: ['rating'],
      where: { vendorId: vendor.id, ...VISIBLE_REVIEW },
      _count: { _all: true },
    });
    const { averageRating, totalReviews } = summarizeRatings(ratingGroups);

    return {
      ...rest,
      favoritesCount: _count.favoritedBy,
      isFavoritedByMe: favoritedBy.length > 0,
      availabilityDays: availability,
      isOpenNow,
      nextAvailableLabel,
      preorderSameAsStoreHours,
      preorderAvailability: resolvePreorderWindows(schedule),
      // US-056
      serverTime: now,
      timezone: MANILA_TZ,
      nextOpenAt: isOpenNow ? null : nextStoreOpening(availability, now),
      preorder: storefrontPreorderInfo({ ...schedule, preorderEnabled: vendor.preorderEnabled }, now),
      reviewSummary: { averageRating, totalReviews },
    };
  }

  async favoriteVendor(userId: string, vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    await this.prisma.vendorFavorite.upsert({
      where: { userId_vendorId: { userId, vendorId } },
      create: { userId, vendorId },
      update: {},
    });

    return this.getFavoriteStatus(userId, vendorId);
  }

  async unfavoriteVendor(userId: string, vendorId: string) {
    await this.prisma.vendorFavorite.deleteMany({
      where: { userId, vendorId },
    });

    return this.getFavoriteStatus(userId, vendorId);
  }

  async getMyFavoriteVendors(userId: string) {
    const favorites = await this.prisma.vendorFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        vendor: {
          select: {
            id: true,
            name: true,
            description: true,
            campusLocation: true,
            vendorType: true,
            status: true,
          },
        },
      },
    });

    return favorites.map((favorite) => favorite.vendor);
  }

  private async getFavoriteStatus(userId: string, vendorId: string) {
    const [favoritesCount, mine] = await Promise.all([
      this.prisma.vendorFavorite.count({ where: { vendorId } }),
      this.prisma.vendorFavorite.findUnique({
        where: { userId_vendorId: { userId, vendorId } },
      }),
    ]);

    return { vendorId, favoritesCount, isFavoritedByMe: Boolean(mine) };
  }

  async getVendorForOwner(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        ownerUserId: userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        campusLocation: true,
        categoryOrder: true,
        vendorType: true,
        status: true,
        preorderEnabled: true,
        preorderSameAsStoreHours: true,
        preorderMinLeadTimeMinutes: true,
        preorderAvailability: {
          select: PREORDER_AVAILABILITY_SELECT,
        },
        availability: {
          select: AVAILABILITY_SELECT,
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found for this user');
    }

    const { availability, ...rest } = vendor;

    return {
      ...rest,
      availabilityDays: availability,
    };
  }

  async updateVendorStorefront(
    userId: string,
    vendorId: string,
    dto: UpdateVendorDto,
    roles: UserRole[],
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        id: vendorId,
      },
      select: {
        id: true,
        ownerUserId: true,
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    const isAdmin = roles.includes('ADMIN');
    const isOwner = vendor.ownerUserId === userId;

    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        'You do not have permission to modify this vendor',
      );
    }

    if ((dto.pickupLatitude === undefined) !== (dto.pickupLongitude === undefined)) {
      throw new BadRequestException('Pickup latitude and longitude must be provided together');
    }

    const data: {
      name?: string;
      description?: string | null;
      campusLocation?: string | null;
      pickupLocation?: string;
      pickupLatitude?: number;
      pickupLongitude?: number;
      categoryOrder?: string[];
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.campusLocation !== undefined) {
      data.campusLocation = dto.campusLocation.trim() || null;
    }

    if (dto.pickupLocation !== undefined) data.pickupLocation = dto.pickupLocation.trim();
    if (dto.pickupLatitude !== undefined) data.pickupLatitude = dto.pickupLatitude;
    if (dto.pickupLongitude !== undefined) data.pickupLongitude = dto.pickupLongitude;

    if (dto.categoryOrder !== undefined) {
      data.categoryOrder = dto.categoryOrder.map((category) => category.trim());
    }

    return this.prisma.vendor.update({
      where: {
        id: vendorId,
      },
      data,
      select: {
        id: true,
        ownerUserId: true,
        name: true,
        description: true,
        campusLocation: true,
        pickupLocation: true,
        pickupLatitude: true,
        pickupLongitude: true,
        categoryOrder: true,
        vendorType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // Owner of the vendor or an admin; everyone else is refused.
  private async assertCanManageVendor(
    userId: string,
    vendorId: string,
    roles: UserRole[],
    action: 'view' | 'modify',
  ) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { id: true, ownerUserId: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    if (!roles.includes('ADMIN') && vendor.ownerUserId !== userId) {
      throw new ForbiddenException(
        `You do not have permission to ${action} this vendor`,
      );
    }
  }

  // US-055: configured preorder pickup windows, the windows in force (store
  // hours when sameAsStoreHours) and whether pickup is open now, all in
  // Asia/Manila time.
  async getPreorderAvailability(
    userId: string,
    vendorId: string,
    roles: UserRole[],
    now: Date = new Date(),
  ) {
    await this.assertCanManageVendor(userId, vendorId, roles, 'view');
    return this.buildPreorderAvailability(vendorId, now);
  }

  private async buildPreorderAvailability(vendorId: string, now: Date) {
    const vendor = await this.prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      select: {
        id: true,
        preorderEnabled: true,
        preorderSameAsStoreHours: true,
        preorderAvailability: { select: PREORDER_AVAILABILITY_SELECT },
        availability: { select: AVAILABILITY_SELECT },
      },
    });
    const { isOpenNow, nextAvailableLabel, hasPickupWindows } = preorderPickupStatus(vendor, now);

    return {
      id: vendor.id,
      timezone: MANILA_TZ,
      preorderEnabled: vendor.preorderEnabled,
      preorderSameAsStoreHours: vendor.preorderSameAsStoreHours,
      preorderAvailability: sortWindows(vendor.preorderAvailability),
      effectivePickupWindows: resolvePreorderWindows(vendor),
      pickup: {
        hasPickupWindows,
        isOpenNow: vendor.preorderEnabled && hasPickupWindows && isOpenNow,
        nextAvailableLabel: vendor.preorderEnabled ? nextAvailableLabel : null,
      },
    };
  }

  async getStoreAvailability(
    userId: string,
    vendorId: string,
    roles: UserRole[],
    now: Date = new Date(),
  ) {
    await this.assertCanManageVendor(userId, vendorId, roles, 'view');
    const vendor = await this.prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      select: { id: true, availability: { select: AVAILABILITY_SELECT } },
    });
    return {
      id: vendor.id,
      timezone: MANILA_TZ,
      availability: sortWindows(vendor.availability),
      ...computeAvailabilityStatus(vendor.availability, now),
    };
  }

  async updatePreorderAvailability(
    userId: string,
    vendorId: string,
    dto: UpdateVendorPreorderAvailabilityDto,
    roles: UserRole[],
  ) {
    await this.assertCanManageVendor(userId, vendorId, roles, 'modify');

    const days = dto.sameAsStoreHours ? [] : (dto.days ?? []);

    if (!dto.sameAsStoreHours && (!dto.days || dto.days.length === 0)) {
      throw new BadRequestException(
        'days is required when sameAsStoreHours is false',
      );
    }

    validatePickupWindows(days);

    await this.prisma.$transaction(async (tx) => {
      await tx.vendor.update({
        where: { id: vendorId },
        data: {
          preorderEnabled: dto.preorderEnabled,
          preorderSameAsStoreHours: dto.sameAsStoreHours,
          ...(dto.minLeadTimeMinutes !== undefined ? { preorderMinLeadTimeMinutes: dto.minLeadTimeMinutes } : {}),
        },
      });

      await tx.vendorPreorderAvailability.deleteMany({
        where: { vendorId },
      });

      if (days.length > 0) {
        await tx.vendorPreorderAvailability.createMany({
          data: days.map((day) => ({
            vendorId,
            dayOfWeek: day.dayOfWeek,
            isEnabled: day.isEnabled,
            openTime: day.isEnabled ? day.openTime! : null,
            closeTime: day.isEnabled ? day.closeTime! : null,
          })),
        });
      }
    });

    // Same fields as before (id, preorderEnabled, preorderSameAsStoreHours,
    // preorderAvailability) plus the resolved windows and pickup status.
    return this.buildPreorderAvailability(vendorId, new Date());
  }

  async updateAvailability(
    userId: string,
    vendorId: string,
    dto: UpdateVendorAvailabilityDto,
    roles: UserRole[],
  ) {
    await this.assertCanManageVendor(userId, vendorId, roles, 'modify');

    validateDaySchedule(
      dto.days.map((day) => ({
        dayOfWeek: day.dayOfWeek,
        isEnabled: day.isOpen,
        openTime: day.openTime,
        closeTime: day.closeTime,
      })),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.vendorAvailability.deleteMany({
        where: { vendorId },
      });

      if (dto.days.length > 0) {
        await tx.vendorAvailability.createMany({
          data: dto.days.map((day) => ({
            vendorId,
            dayOfWeek: day.dayOfWeek,
            isOpen: day.isOpen,
            openTime: day.isOpen ? day.openTime! : null,
            closeTime: day.isOpen ? day.closeTime! : null,
          })),
        });
      }
    });

    return this.prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      select: {
        id: true,
        availability: {
          select: AVAILABILITY_SELECT,
        },
      },
    });
  }

  async getVendorLedgerBalance(ownerUserId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found for this user');
    }

    const balance = await this.sumLedgerBalance(vendor.id);

    return { balance: balance.toFixed(2) };
  }

  async payoutVendorBalance(ownerUserId: string, idempotencyKey: string | undefined) {
    const normalizedKey = idempotencyKey?.trim();

    if (!normalizedKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    if (normalizedKey.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key must not exceed 255 characters',
      );
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { ownerUserId },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found for this user');
    }

    const existing = await this.prisma.payout.findUnique({
      where: { idempotencyKey: normalizedKey },
    });

    if (existing) {
      if (existing.vendorId !== vendor.id) {
        throw new ConflictException(
          'Idempotency-Key has already been used for another vendor',
        );
      }

      return { id: existing.id, amount: existing.amount.toFixed(2), status: existing.status };
    }

    try {
      const payout = await this.prisma.$transaction(async (tx) => {
        await lockVendorWallet(tx, vendor.id);
        const replay = await tx.payout.findUnique({ where: { idempotencyKey: normalizedKey } });
        if (replay) {
          if (replay.vendorId !== vendor.id) throw new ConflictException('Idempotency-Key belongs to another vendor');
          return replay;
        }
        const balance = await this.sumLedgerBalance(vendor.id, tx);

        if (balance.lessThanOrEqualTo(0)) {
          throw new BadRequestException('No balance available to transfer out');
        }

        const created = await tx.payout.create({
          data: {
            vendorId: vendor.id,
            amount: balance,
            idempotencyKey: normalizedKey,
          },
        });

        await tx.vendorLedgerEntry.create({
          data: {
            vendorId: vendor.id,
            payoutId: created.id,
            type: LedgerEntryType.PAYOUT_DEBIT,
            amount: balance.negated(),
          },
        });

        await tx.auditRecord.create({ data: { actorUserId: ownerUserId, actionType: 'VENDOR_PAYOUT_RESERVED',
          entityType: 'Payout', entityId: created.id, afterState: { vendorId: vendor.id, amount: balance.toFixed(2) } } });
        return created;
      }, { maxWait: 10000, timeout: 30000 });

      return { id: payout.id, amount: payout.amount.toFixed(2), status: payout.status };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.prisma.payout.findUnique({
          where: { idempotencyKey: normalizedKey },
        });

        if (replay) {
          if (replay.vendorId !== vendor.id) throw new ConflictException('Idempotency-Key belongs to another vendor');
          return { id: replay.id, amount: replay.amount.toFixed(2), status: replay.status };
        }

        throw new ConflictException(
          'A payout request with this Idempotency-Key is already being processed',
        );
      }

      throw error;
    }
  }

  private async sumLedgerBalance(
    vendorId: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const result = await client.vendorLedgerEntry.aggregate({
      where: { vendorId },
      _sum: { amount: true },
    });

    return result._sum.amount ?? new Prisma.Decimal(0);
  }
}
