import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReportStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';
import { ImagekitService } from '../imagekit/imagekit.service';
import { CreateReportDto, ReportTargetType } from './dto/create-report.dto';
import { ListReportsDto } from './dto/list-reports.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

type TargetFields = Pick<Prisma.ReportUncheckedCreateInput,
  'reportedVendorId' | 'reportedUserId' | 'reportedOrderId' |
  'reportedPaymentId' | 'reportedProductId' | 'reportedPasabuyId'>;

const targetFilters: Record<ReportTargetType, Prisma.ReportWhereInput> = {
  VENDOR: { reportedVendorId: { not: null } },
  USER: { reportedUserId: { not: null } },
  ORDER: { reportedOrderId: { not: null } },
  TRANSACTION: { OR: [{ reportedPaymentId: { not: null } }, { targetType: 'TRANSACTION' }] },
  PRODUCT: { reportedProductId: { not: null } },
  PASABUY: { reportedPasabuyId: { not: null } },
};

const reportSummary = {
  id: true,
  targetType: true,
  category: true,
  description: true,
  attachmentName: true,
  attachmentMimeType: true,
  attachmentSize: true,
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

const allowedTransitions: Record<ReportStatus, ReportStatus[]> = {
  OPEN: [ReportStatus.IN_REVIEW, ReportStatus.RESOLVED, ReportStatus.DISMISSED],
  IN_REVIEW: [ReportStatus.RESOLVED, ReportStatus.DISMISSED],
  RESOLVED: [],
  DISMISSED: [],
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly images: ImagekitService) {}

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
    return { items: items.map((item) => ({ ...item, attachment: this.attachmentReference(item) })),
      page, limit, total, totalPages: Math.ceil(total / limit) };
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
    return { ...report, attachment: this.attachmentReference(report) };
  }

  async attachment(id: string) {
    const report = await this.prisma.report.findUnique({ where: { id },
      select: { attachmentPath: true, attachmentName: true, attachmentMimeType: true, attachmentSize: true } });
    if (!report?.attachmentPath) throw new NotFoundException('Report attachment not found');
    return { url: this.images.signedReportAttachmentUrl(report.attachmentPath),
      expiresInSeconds: 300, fileName: report.attachmentName,
      mimeType: report.attachmentMimeType, size: report.attachmentSize };
  }

  async updateStatus(id: string, adminUserId: string, dto: UpdateReportStatusDto) {
    const note = dto.note?.trim() ?? null;
    if (dto.status !== ReportStatus.IN_REVIEW && !note) {
      throw new BadRequestException('A resolution or dismissal note is required');
    }
    const current = await this.prisma.report.findUnique({
      where: { id }, select: { status: true },
    });
    if (!current) throw new NotFoundException('Report not found');
    if (!allowedTransitions[current.status].includes(dto.status)) {
      throw new ConflictException(`Report cannot transition from ${current.status} to ${dto.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.report.updateMany({
        where: { id, status: current.status },
        data: { status: dto.status },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Report status changed; please retry');
      }
      await tx.reportStatusHistory.create({
        data: { reportId: id, status: dto.status, adminUserId, note },
      });
      await tx.auditRecord.create({
        data: {
          actorUserId: adminUserId,
          actionType: 'REPORT_STATUS_UPDATED',
          entityType: 'Report',
          entityId: id,
          beforeState: { status: current.status },
          afterState: { status: dto.status, note },
        },
      });
    });
    return this.detail(id);
  }

  async create(reporterUserId: string, dto: CreateReportDto,
    attachment?: { buffer: Buffer; mimetype: string; size: number; originalname: string }) {
    const category = dto.category.trim();
    const description = dto.description.trim();
    if (!category || !description) {
      throw new BadRequestException('Category and description are required');
    }

    const extension = attachment ? this.validateAttachment(attachment) : null;
    const targetId = dto.targetId?.trim();
    if (!targetId && (dto.targetType !== ReportTargetType.TRANSACTION || !attachment)) {
      throw new BadRequestException('A target ID is required unless transaction proof is attached');
    }
    const target = targetId
      ? await this.resolveTarget(reporterUserId, dto.targetType, targetId)
      : {};
    const id = randomUUID();
    const uploaded = attachment && extension
      ? await this.images.uploadPrivateReportAttachment(id, attachment.buffer, extension)
      : null;
    try {
      const report = await this.prisma.$transaction(async (tx) => {
        const created = await tx.report.create({
        data: { id, reporterUserId, targetType: dto.targetType, category, description, status: 'OPEN',
          ...target, ...(uploaded && attachment ? {
            attachmentPath: uploaded.path, attachmentFileId: uploaded.fileId,
            attachmentName: attachment.originalname.slice(0, 255),
            attachmentMimeType: attachment.mimetype, attachmentSize: attachment.size,
          } : {}) },
        select: {
          id: true, targetType: true, category: true, description: true, status: true,
          reporterUserId: true, reportedVendorId: true, reportedUserId: true,
          reportedOrderId: true, reportedPaymentId: true, reportedProductId: true,
          reportedPasabuyId: true, attachmentName: true, attachmentMimeType: true,
          attachmentSize: true, createdAt: true,
        },
        });
        await tx.auditRecord.create({ data: {
          actorUserId: reporterUserId, actionType: 'REPORT_CREATED',
          entityType: 'Report', entityId: created.id,
          afterState: { status: created.status, targetType: created.targetType,
            targetId: targetId || null, category, hasAttachment: Boolean(uploaded) },
        } });
        return created;
      });
      return { ...report, attachment: this.attachmentReference(report) };
    } catch (error) {
      if (uploaded) await this.images.deletePrivateFile(uploaded.fileId).catch(() => undefined);
      throw error;
    }
  }

  private attachmentReference(report: { id: string; attachmentName: string | null;
    attachmentMimeType: string | null; attachmentSize: number | null }) {
    return report.attachmentName ? { fileName: report.attachmentName,
      mimeType: report.attachmentMimeType, size: report.attachmentSize,
      adminUrl: `/api/v1/reports/${report.id}/attachment` } : null;
  }

  private validateAttachment(file: { buffer: Buffer; mimetype: string;
    size: number; originalname: string }) {
    if (!file.buffer || file.size < 1 || file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Attachment must be between 1 byte and 5 MB');
    }
    const extension = extname(file.originalname).toLowerCase();
    const matches = (
      (['.jpg', '.jpeg'].includes(extension) && file.mimetype === 'image/jpeg' &&
        file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) ||
      (extension === '.png' && file.mimetype === 'image/png' &&
        file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (extension === '.pdf' && file.mimetype === 'application/pdf' &&
        file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-')))
    );
    if (!matches) throw new BadRequestException('Only JPG, JPEG, PNG, or PDF attachments are allowed');
    return extension.slice(1);
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
