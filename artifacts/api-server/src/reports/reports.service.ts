import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';

type TargetFields = Pick<Prisma.ReportUncheckedCreateInput,
  'reportedVendorId' | 'reportedUserId' | 'reportedOrderId' |
  'reportedPaymentId' | 'reportedProductId' | 'reportedPasabuyId'>;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(reporterUserId: string, dto: CreateReportDto) {
    const category = dto.category.trim();
    const description = dto.description.trim();
    if (!category || !description) {
      throw new BadRequestException('Category and description are required');
    }

    const target = await this.resolveTarget(reporterUserId, dto.targetType, dto.targetId);
    return this.prisma.report.create({
      data: { reporterUserId, category, description, status: 'OPEN', ...target },
      select: {
        id: true, category: true, description: true, status: true,
        reporterUserId: true, reportedVendorId: true, reportedUserId: true,
        reportedOrderId: true, reportedPaymentId: true, reportedProductId: true,
        reportedPasabuyId: true, createdAt: true,
      },
    });
  }

  private async resolveTarget(userId: string, type: ReportTargetType, id: string): Promise<TargetFields> {
    switch (type) {
      case ReportTargetType.VENDOR: {
        const found = await this.prisma.vendor.findUnique({ where: { id }, select: { id: true } });
        if (!found) break;
        return { reportedVendorId: id };
      }
      case ReportTargetType.USER: {
        const found = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
        if (!found || id === userId) break;
        return { reportedUserId: id };
      }
      case ReportTargetType.PRODUCT: {
        const found = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
        if (!found) break;
        return { reportedProductId: id };
      }
      case ReportTargetType.ORDER: {
        const found = await this.prisma.order.findFirst({
          where: { id, OR: [
            { customerId: userId },
            { vendor: { ownerUserId: userId } },
            { groupOrder: { participants: { some: { userId, status: 'JOINED' } } } },
          ] },
          select: { id: true },
        });
        if (!found) break;
        return { reportedOrderId: id };
      }
      case ReportTargetType.TRANSACTION: {
        const found = await this.prisma.payment.findFirst({
          where: { id, OR: [
            { payerUserId: userId },
            { paymentShares: { some: { order: { vendor: { ownerUserId: userId } } } } },
            { pasabuyRequest: { relatedOrder: { vendor: { ownerUserId: userId } } } },
          ] },
          select: { id: true },
        });
        if (!found) break;
        return { reportedPaymentId: id };
      }
      case ReportTargetType.PASABUY: {
        const found = await this.prisma.pasabuyRequest.findFirst({
          where: { id, OR: [{ requesterUserId: userId }, { fulfillerUserId: userId }] },
          select: { id: true },
        });
        if (!found) break;
        return { reportedPasabuyId: id };
      }
      default:
        throw new BadRequestException('Invalid report target type');
    }
    throw new NotFoundException('Report target not found');
  }
}
