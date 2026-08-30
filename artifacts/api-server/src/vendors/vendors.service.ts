import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { VendorStatus } from '@prisma/client';

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
      },
      orderBy: {
        name: 'asc',
      },
    });
  }
}