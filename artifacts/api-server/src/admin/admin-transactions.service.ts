import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AdminTransactionFiltersDto, AdminTransactionsQueryDto } from './dto/admin-transactions.dto';

// Select only operational data. Checkout URLs, provider resource IDs, payer
// email/phone, and payment credentials must never reach an admin response.
const transactionSelect = {
  id: true,
  purpose: true,
  status: true,
  amount: true,
  currency: true,
  provider: true,
  createdAt: true,
  updatedAt: true,
  payer: { select: { id: true, fullName: true } },
  paymentShares: {
    select: {
      id: true, status: true, amountDue: true,
      order: {
        select: {
          id: true, status: true,
          vendor: { select: { id: true, name: true } },
        },
      },
    },
  },
  pasabuyRequest: {
    select: {
      id: true, status: true, relatedOrderId: true,
      relatedOrder: { select: { vendor: { select: { id: true, name: true } } } },
    },
  },
  vendorSubscription: {
    select: {
      id: true, status: true, vendor: { select: { id: true, name: true } },
    },
  },
  featuredListing: {
    select: {
      id: true, status: true, placement: true,
      vendor: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.PaymentSelect;

@Injectable()
export class AdminTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(query: AdminTransactionFiltersDto): Prisma.PaymentWhereInput {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) ||
        (to && Number.isNaN(to.getTime())) ||
        (from && to && from > to)) {
      throw new BadRequestException('Invalid transaction date range');
    }

    const and: Prisma.PaymentWhereInput[] = [];
    if (query.orderId) {
      and.push({ OR: [
        { paymentShares: { some: { orderId: query.orderId } } },
        { pasabuyRequest: { is: { relatedOrderId: query.orderId } } },
      ] });
    }
    if (query.vendorId) {
      and.push({ OR: [
        { paymentShares: { some: { order: { vendorId: query.vendorId } } } },
        { pasabuyRequest: { is: { relatedOrder: { is: { vendorId: query.vendorId } } } } },
        { vendorSubscription: { is: { vendorId: query.vendorId } } },
        { featuredListing: { is: { vendorId: query.vendorId } } },
      ] });
    }

    return {
      status: query.status,
      purpose: query.purpose,
      provider: query.provider,
      payerUserId: query.payerUserId,
      createdAt: from || to ? { gte: from, lte: to } : undefined,
      ...(and.length ? { AND: and } : {}),
    };
  }

  async list(query: AdminTransactionsQueryDto, page: number, limit: number) {
    if (!Number.isSafeInteger(page) || page < 1 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
        !Number.isSafeInteger((page - 1) * limit)) {
      throw new BadRequestException('page must be positive and limit must be between 1 and 100');
    }
    const where = this.where(query);
    const [total, items] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: transactionSelect,
      }),
    ]);
    return { items, page, limit, total, totalPages: Math.ceil(total / limit) };
  }

  async summary(query: AdminTransactionFiltersDto) {
    const where = this.where(query);
    const groups = await this.prisma.payment.groupBy({
      by: ['purpose', 'status', 'currency'],
      where,
      _count: { _all: true },
      _sum: { amount: true },
      orderBy: [{ purpose: 'asc' }, { status: 'asc' }, { currency: 'asc' }],
    });
    return {
      total: groups.reduce((total, group) => total + group._count._all, 0),
      // Amounts are grouped by currency. Never add unlike currencies together.
      groups: groups.map((group) => ({
        purpose: group.purpose,
        status: group.status,
        currency: group.currency,
        count: group._count._all,
        amount: group._sum.amount?.toFixed(2) ?? '0.00',
      })),
    };
  }

  async detail(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id }, select: transactionSelect,
    });
    if (!payment) throw new NotFoundException('Transaction not found');
    return payment;
  }
}
