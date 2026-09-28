import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { OperationalReportQueryDto } from './dto/operational-report.dto';

type DailyRow = {
  day: string;
  users: number;
  vendors: number;
  orders: number;
  payments: number;
  reports: number;
  refunds: number;
};

@Injectable()
export class OperationalReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private period(query: OperationalReportQueryDto) {
    const parseDay = (value: string) => {
      const parsed = new Date(`${value}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== value) {
        throw new BadRequestException('Provide valid UTC calendar dates');
      }
      return parsed;
    };
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const to = query.to ? parseDay(query.to) : today;
    const from = query.from ? parseDay(query.from) : new Date(to);
    if (!query.from) from.setUTCDate(from.getUTCDate() - 6);
    if (from > to || (to.getTime() - from.getTime()) / 86_400_000 >= 31) {
      throw new BadRequestException('Provide a valid UTC date range of at most 31 days');
    }
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = to.toISOString().slice(0, 10);
    const end = new Date(to);
    end.setUTCDate(end.getUTCDate() + 1);
    return { fromDate, toDate, from, end };
  }

  async summary(query: OperationalReportQueryDto) {
    const { fromDate, toDate, from, end } = this.period(query);
    const createdAt = { gte: from, lt: end };
    const [newUsers, vendors, orders, payments, reports, refunds, fees] =
      await Promise.all([
        this.prisma.user.count({ where: { createdAt } }),
        this.prisma.vendor.groupBy({
          by: ['status'], where: { createdAt }, _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ['status'], where: { createdAt },
          _count: { _all: true }, _sum: { totalAmount: true, marketplaceFee: true },
        }),
        this.prisma.payment.groupBy({
          by: ['purpose', 'status', 'currency'], where: { createdAt },
          _count: { _all: true }, _sum: { amount: true },
        }),
        this.prisma.report.groupBy({
          by: ['status'], where: { createdAt }, _count: { _all: true },
        }),
        this.prisma.refund.groupBy({
          by: ['status'], where: { createdAt },
          _count: { _all: true }, _sum: { amount: true },
        }),
        this.prisma.feeAssessment.groupBy({
          by: ['type', 'ruleVersion'], where: { assessedAt: createdAt },
          _count: { _all: true }, _sum: { amount: true },
        }),
      ]);
    return {
      period: { from: fromDate, to: toDate, timezone: 'UTC' },
      newUsers,
      newVendors: vendors.map((row) => ({
        currentStatus: row.status, count: row._count._all,
      })),
      orders: orders.map((row) => ({
        currentStatus: row.status, count: row._count._all,
        recordedOrderAmount: row._sum.totalAmount?.toFixed(2) ?? '0.00',
        recordedMarketplaceFee: row._sum.marketplaceFee?.toFixed(2) ?? '0.00',
      })),
      payments: payments.map((row) => ({
        purpose: row.purpose, currentStatus: row.status, currency: row.currency,
        count: row._count._all, amount: row._sum.amount?.toFixed(2) ?? '0.00',
      })),
      reports: reports.map((row) => ({ currentStatus: row.status, count: row._count._all })),
      refunds: refunds.map((row) => ({
        currentStatus: row.status, count: row._count._all,
        requestedAmount: row._sum.amount?.toFixed(2) ?? '0.00',
      })),
      assessedFees: fees.map((row) => ({
        type: row.type, ruleVersion: row.ruleVersion,
        count: row._count._all, amount: row._sum.amount?.toFixed(2) ?? '0.00',
      })),
    };
  }

  async daily(query: OperationalReportQueryDto) {
    const { fromDate, toDate, from, end } = this.period(query);
    // Each source is filtered before unioning; SQL values are bound parameters.
    const items = await this.prisma.$queryRaw<DailyRow[]>(Prisma.sql`
      WITH activity AS (
        SELECT "createdAt" AS occurred_at, 'user' AS kind FROM "users"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${end}
        UNION ALL SELECT "createdAt", 'vendor' FROM "vendors"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${end}
        UNION ALL SELECT "createdAt", 'order' FROM "orders"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${end}
        UNION ALL SELECT "createdAt", 'payment' FROM "payments"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${end}
        UNION ALL SELECT "createdAt", 'report' FROM "reports"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${end}
        UNION ALL SELECT "createdAt", 'refund' FROM "refunds"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${end}
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
        count(*) FILTER (WHERE kind = 'user')::int AS users,
        count(*) FILTER (WHERE kind = 'vendor')::int AS vendors,
        count(*) FILTER (WHERE kind = 'order')::int AS orders,
        count(*) FILTER (WHERE kind = 'payment')::int AS payments,
        count(*) FILTER (WHERE kind = 'report')::int AS reports,
        count(*) FILTER (WHERE kind = 'refund')::int AS refunds
      FROM generate_series(${fromDate}::timestamp, ${toDate}::timestamp,
        interval '1 day') AS days(day)
      LEFT JOIN activity ON (activity.occurred_at AT TIME ZONE 'UTC')::date = days.day::date
      GROUP BY days.day ORDER BY days.day
    `);
    return { period: { from: fromDate, to: toDate, timezone: 'UTC' }, items };
  }
}
