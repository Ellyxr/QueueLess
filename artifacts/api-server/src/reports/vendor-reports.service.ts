import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ReviewVendorResponseDto, VendorReportResponseDto } from './dto/vendor-report.dto';

// Never send reporter identity, original private evidence, or transaction details to vendors.
const vendorView = { id: true, category: true, targetType: true, status: true, vendorNotice: true,
  createdAt: true, updatedAt: true } satisfies Prisma.ReportSelect;

export function relatedVendorFilter(vendorId: string): Prisma.ReportWhereInput {
  return { OR: [
    { reportedVendorId: vendorId }, { reportedUser: { vendorOwned: { id: vendorId } } }, { reportedProduct: { vendorId } }, { reportedOrder: { vendorId } },
    { reportedPasabuy: { relatedOrder: { vendorId } } },
    { reportedPayment: { OR: [{ pasabuyRequest: { relatedOrder: { vendorId } } },{ featuredListing: { vendorId } }, { vendorSubscription: { vendorId } },
      { paymentShares: { some: { order: { vendorId } } } }] } },
  ] };
}

@Injectable()
export class VendorReportsService {
  constructor(private readonly prisma: PrismaService) {}
  private async vendor(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { ownerUserId: userId }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }
  async mine(userId: string, page: number, limit: number) {
    const vendor = await this.vendor(userId);
    const where = { AND: [relatedVendorFilter(vendor.id), { vendorNotice: { not: null } }] };
    const [items, total] = await Promise.all([
      this.prisma.report.findMany({ where, select: vendorView, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total, page, limit };
  }
  async detail(userId: string, id: string) {
    const vendor = await this.vendor(userId);
    const report = await this.prisma.report.findFirst({ where: { id, AND: [relatedVendorFilter(vendor.id), { vendorNotice: { not: null } }] },
      select: { ...vendorView, vendorResponses: { where: { vendorId: vendor.id }, select: {
        id: true, kind: true, body: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true } } } });
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }
  async publishNotice(actorUserId: string, id: string, notice: string) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM reports WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await tx.report.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Report not found');
      const after = await tx.report.update({ where: { id }, data: { vendorNotice: notice } });
      await tx.auditRecord.create({ data: { actorUserId, actionType: 'REPORT_VENDOR_NOTICE_PUBLISHED', entityType: 'Report', entityId: id,
        afterState: { noticePublished: true } } });
      return { id: after.id, vendorNotice: after.vendorNotice };
    }, { maxWait: 10000, timeout: 30000 });
  }
  async respond(userId: string, id: string, dto: VendorReportResponseDto) {
    const vendor = await this.vendor(userId);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM reports WHERE id = ${id}::uuid FOR UPDATE`;
        const report = await tx.report.findFirst({ where: { id, AND: [relatedVendorFilter(vendor.id), { vendorNotice: { not: null } }] } });
        if (!report) throw new NotFoundException('Report not found');
        if ((dto.kind === 'RESPONSE' && !['OPEN', 'IN_REVIEW'].includes(report.status)) ||
          (dto.kind === 'APPEAL' && report.status !== 'RESOLVED'))
          throw new ConflictException('Respond to open reports; appeal only resolved reports');
        const response = await tx.reportVendorResponse.create({ data: { reportId: id, vendorId: vendor.id, authorUserId: userId, kind: dto.kind, body: dto.body } });
        await tx.auditRecord.create({ data: { actorUserId: userId, actionType: 'REPORT_VENDOR_' + dto.kind, entityType: 'Report', entityId: id,
          afterState: { responseId: response.id, vendorId: vendor.id, kind: dto.kind, status: 'PENDING' } } });
        return response;
      }, { maxWait: 10000, timeout: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('A response of this kind has already been submitted');
      throw error;
    }
  }
  async review(actorUserId: string, id: string, responseId: string, dto: ReviewVendorResponseDto) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM reports WHERE id = ${id}::uuid FOR UPDATE`;
      const report = await tx.report.findUnique({ where: { id } });
      const response = await tx.reportVendorResponse.findFirst({ where: { id: responseId, reportId: id } });
      if (!report || !response) throw new NotFoundException('Report response not found');
      if (response.status !== 'PENDING') throw new ConflictException('Response has already been reviewed');
      const after = await tx.reportVendorResponse.update({ where: { id: responseId }, data: { status: dto.decision,
        reviewedByUserId: actorUserId, reviewNote: dto.note, reviewedAt: new Date() } });
      if (response.kind === 'APPEAL' && dto.decision === 'ACCEPTED') {
        if (report.status !== 'RESOLVED') throw new ConflictException('Report is no longer resolved');
        await tx.report.update({ where: { id }, data: { status: 'IN_REVIEW' } });
        await tx.reportStatusHistory.create({ data: { reportId: id, status: 'IN_REVIEW', adminUserId: actorUserId, note: dto.note } });
      }
      await tx.auditRecord.create({ data: { actorUserId, actionType: 'REPORT_VENDOR_RESPONSE_REVIEWED', entityType: 'Report', entityId: id,
        beforeState: { responseStatus: 'PENDING', reportStatus: report.status },
        afterState: { responseId, responseStatus: dto.decision, reportStatus: response.kind === 'APPEAL' && dto.decision === 'ACCEPTED' ? 'IN_REVIEW' : report.status } } });
      return after;
    }, { maxWait: 10000, timeout: 30000 });
  }
}
