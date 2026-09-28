import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';

type TargetFields = Pick<Prisma.ReportUncheckedCreateInput,
  'reportedVendorId' | 'reportedUserId' | 'reportedOrderId' |
  'reportedPaymentId' | 'reportedProductId' | 'reportedPasabuyId'>;

const targetFilters: Record<ReportTargetType, Prisma.ReportWhereInput> = {
  VENDOR: { reportedVendorId: { not: null } },
  USER: { reportedUserId: { not: null } },
  ORDER: { reportedOrderId: { not: null } },
  TRANSACTION: { reportedPaymentId: { not: null } },
  PRODUCT: { reportedProductId: { not: null } },
  PASABUY: { reportedPasabuyId: { not: null } },
};

const reportSummary = {
  id: true,
  category: true,
  description: true,
  status: true,
  reporterUserId: true,
  reporter: { select: { id: true, fullName: true, email: true } },
  reportedVendorId: true,
  reportedUserId: true,
  reportedOrderId: true,
  reportedPaymentId: true,
  reportedProductId: true,
  reportedPasabuyId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReportSelect;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListReportsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.targetType ? targetFilters[query.targetType] : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        select: reportSummary,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async detail(id: string) {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: {
        ...reportSummary,
        reportedVendor: { select: { id: true, name: true } },
        reportedUser: { select: { id: true, fullName: true } },
        reportedOrder: { select: { id: true, status: true } },
        reportedPayment: { select: { id: true, purpose: true, status: true } },
        reportedProduct: { select: { id: true, name: true, vendorId: true } },
        reportedPasabuy: { select: { id: true, status: true } },
        statusHistory: {
          orderBy: [{ changedAt: 'asc' }, { id: 'asc' }],
          select: { id: true, status: true, note: true, changedAt: true, adminUserId: true },
        },
      },
    });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

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
