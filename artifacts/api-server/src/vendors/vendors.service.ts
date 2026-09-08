import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { VendorStatus } from '@prisma/client';
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
            isAvailable: true,
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

  async getVendorStorefront(vendorId: string) {
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
            isAvailable: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
      },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return vendor;
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
        vendorType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}