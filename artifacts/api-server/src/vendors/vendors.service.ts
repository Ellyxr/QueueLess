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

@Injectable()
export class VendorsService {
  constructor(private readonly prisma: PrismaService) {}

  async listActiveVendors() {
    return this.prisma.vendor.findMany({
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
  }

  async getVendorStorefront(vendorId: string, userId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        id: vendorId,
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
          where: {},
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            category: true,
            preparationTimeMinutes: true,
            isAvailable: true,
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

    const { _count, favoritedBy, ...rest } = vendor;

    return {
      ...rest,
      favoritesCount: _count.favoritedBy,
      isFavoritedByMe: favoritedBy.length > 0,
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
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found for this user');
    }

    return vendor;
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

    const data: {
      name?: string;
      description?: string | null;
      campusLocation?: string | null;
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
        categoryOrder: true,
        vendorType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
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

        return created;
      });

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