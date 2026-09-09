import {
  BadRequestException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { VendorStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class QrService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveVendorContext(token: string) {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      throw new BadRequestException('QR token is required');
    }

    const qrCode = await this.prisma.vendorQrCode.findUnique({
      where: {
        token: normalizedToken,
      },
      include: {
        vendor: true,
      },
    });

    if (!qrCode) {
      throw new NotFoundException('QR code is invalid');
    }

    if (!qrCode.isActive) {
      throw new BadRequestException('QR code is inactive');
    }

    if (qrCode.expiresAt && qrCode.expiresAt.getTime() <= Date.now()) {
      throw new GoneException('QR code has expired');
    }

    if (qrCode.vendor.status !== VendorStatus.ACTIVE) {
      throw new BadRequestException('Vendor is not available');
    }

    return {
      valid: true,
      vendor: {
        id: qrCode.vendor.id,
        name: qrCode.vendor.name,
        description: qrCode.vendor.description,
        campusLocation: qrCode.vendor.campusLocation,
        vendorType: qrCode.vendor.vendorType,
        status: qrCode.vendor.status,
      },
    };
  }
}
