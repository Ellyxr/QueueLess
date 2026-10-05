import { useEffect, useMemo, useState } from "react";

import {
  AlertCircle,
  BarChart3,
  CircleDollarSign,
  FileWarning,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  Store,
  Users,
  Wallet,
} from "lucide-react";

import {
  getAdminOperationalDaily,
  getAdminOperationalSummary,
  type AdminOperationalDailyItem,
  type AdminOperationalSummary,
} from "@/features/auth/api";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AdminShell } from "./admin-shell";

const currency = (amount: number | string) => {
  const value =
    typeof amount === "string" ? Number.parseFloat(amount) : amount;

  if (!Number.isFinite(value)) {
    return "₱0.00";
  }

  return `₱${value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const number = (value: number) => value.toLocaleString("en-PH");

const today = new Date();

const formatDateInput = (date: Date) => {
  return date.toISOString().slice(0, 10);
};

const getDefaultFromDate = () => {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() - 6);
  return formatDateInput(date);
};

const getDefaultToDate = () => {
  return formatDateInput(today);
};

const getTotal = (
  groups: Array<{
    count: number;
  }>,
) => {
  return groups.reduce((total, group) => total + group.count, 0);
};

const getTotalAmount = (
  groups: Array<{
    amount: string;
  }>,
) => {
  return groups.reduce(
    (total, group) => total + Number.parseFloat(group.amount || "0"),
    0,
  );
};

const getOrderAmount = (
  groups: Array<{
    recordedOrderAmount: string;
  }>,
) => {
  return groups.reduce(
    (total, group) =>
      total + Number.parseFloat(group.recordedOrderAmount || "0"),
    0,
  );
};

const getRefundAmount = (
  groups: Array<{
    requestedAmount: string;
  }>,
) => {
  return groups.reduce(
    (total, group) =>
      total + Number.parseFloat(group.requestedAmount || "0"),
    0,
  );
};

export default function AdminDashboardPage() {
  const [summary, setSummary] =
    useState<AdminOperationalSummary | null>(null);

  const [daily, setDaily] = useState<AdminOperationalDailyItem[]>([]);

  const [from, setFrom] = useState(getDefaultFromDate);
  const [to, setTo] = useState(getDefaultToDate);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOperationalReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResponse, dailyResponse] = await Promise.all([
        getAdminOperationalSummary({
          from,
          to,
        }),
        getAdminOperationalDaily({
          from,
          to,
        }),
      ]);

      setSummary(summaryResponse);
      setDaily(dailyResponse.items);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load operational reports.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOperationalReports();
  }, [from, to]);

  const metrics = useMemo(() => {
    if (!summary) {
      return {
        users: 0,
        vendors: 0,
        orders: 0,
        payments: 0,
        reports: 0,
        refunds: 0,
        orderAmount: 0,
        paymentAmount: 0,
        refundAmount: 0,
        assessedFeeAmount: 0,
      };
    }

    return {
      users: summary.newUsers,
      vendors: getTotal(summary.newVendors),
      orders: getTotal(summary.orders),
      payments: getTotal(summary.payments),
      reports: getTotal(summary.reports),
      refunds: getTotal(summary.refunds),
      orderAmount: getOrderAmount(summary.orders),
      paymentAmount: getTotalAmount(summary.payments),
      refundAmount: getRefundAmount(summary.refunds),
      assessedFeeAmount: getTotalAmount(summary.assessedFees),
    };
  }, [summary]);

  const maxDailyActivity = useMemo(() => {
    return Math.max(
      1,
      ...daily.map(
        (item) =>
          item.users +
          item.vendors +
          item.orders +
          item.payments +
          item.reports +
          item.refunds,
      ),
    );
  }, [daily]);

  return (
    <AdminShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Operational Dashboard
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Platform activity and operational metrics based on persisted
              records.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                From
              </label>

              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                To
              </label>

              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>

          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

            <div>
              <p className="font-semibold">
                Unable to load operational reports
              </p>

              <p className="mt-1">{error}</p>
            </div>
          </div>
        ) : null}

        {/* Loading */}
        {loading && !summary ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-border bg-card">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin" />

              <p className="text-sm">
                Loading operational metrics...
              </p>
            </div>
          </div>
        ) : null}

        {/* Metrics */}
        {summary ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      New Users
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {number(metrics.users)}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Users className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      New Vendors
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {number(metrics.vendors)}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Store className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Orders
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {number(metrics.orders)}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {currency(metrics.orderAmount)} recorded
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ShoppingBag className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Payments
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {number(metrics.payments)}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {currency(metrics.paymentAmount)} recorded
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Wallet className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Reports
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {number(metrics.reports)}
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileWarning className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Refunds
                    </p>

                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {number(metrics.refunds)}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {currency(metrics.refundAmount)} requested
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Financial overview */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CircleDollarSign className="h-5 w-5 text-primary" />

                    <CardTitle>Financial Overview</CardTitle>
                  </div>

                  <CardDescription>
                    Recorded amounts within the selected reporting period.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                      <p className="text-xs text-muted-foreground">
                        Order Amount
                      </p>

                      <p className="mt-2 text-lg font-bold">
                        {currency(metrics.orderAmount)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                      <p className="text-xs text-muted-foreground">
                        Payment Amount
                      </p>

                      <p className="mt-2 text-lg font-bold">
                        {currency(metrics.paymentAmount)}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border bg-secondary/30 p-4">
                      <p className="text-xs text-muted-foreground">
                        Assessed Fees
                      </p>

                      <p className="mt-2 text-lg font-bold">
                        {currency(metrics.assessedFeeAmount)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />

                    <CardTitle>Period</CardTitle>
                  </div>

                  <CardDescription>
                    Current operational report coverage.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <div className="rounded-2xl border border-border bg-secondary/30 p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Reporting period
                        </p>

                        <p className="mt-1 font-semibold">
                          {summary.period.from} to {summary.period.to}
                        </p>
                      </div>

                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {summary.period.timezone}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily activity */}
            <Card className="border-card-border/80 bg-card/90 shadow-sm">
              <CardHeader>
                <CardTitle>Daily Platform Activity</CardTitle>

                <CardDescription>
                  Number of new persisted records created each UTC calendar
                  day.
                </CardDescription>
              </CardHeader>

              <CardContent>
                {daily.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    No daily activity was recorded for this period.
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-primary" />
                        Users
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-primary/80" />
                        Vendors
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-primary/70" />
                        Orders
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-primary/60" />
                        Payments
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-primary/50" />
                        Reports
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-sm bg-primary/40" />
                        Refunds
                      </div>
                    </div>

                    {daily.map((item) => {
                      const total =
                        item.users +
                        item.vendors +
                        item.orders +
                        item.payments +
                        item.reports +
                        item.refunds;

                      const totalWidth =
                        (total / maxDailyActivity) * 100;

                      const getSegmentWidth = (value: number) =>
                        `${(value / maxDailyActivity) * 100}%`;

                      return (
                        <div key={item.day} className="space-y-2">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-medium">
                              {item.day}
                            </span>

                            <span className="text-xs text-muted-foreground">
                              {number(total)} total
                            </span>
                          </div>

                          <div className="h-8 w-full overflow-hidden rounded-lg bg-secondary">
                            <div
                              className="flex h-full overflow-hidden rounded-lg transition-all"
                              style={{
                                width: `${totalWidth}%`,
                              }}
                              aria-label={`${item.day}: ${total} total activities`}
                            >
                              {item.users > 0 ? (
                                <div
                                  className="h-full bg-primary"
                                  style={{
                                    width: getSegmentWidth(item.users),
                                  }}
                                  title={`Users: ${item.users}`}
                                />
                              ) : null}

                              {item.vendors > 0 ? (
                                <div
                                  className="h-full bg-primary/80"
                                  style={{
                                    width: getSegmentWidth(item.vendors),
                                  }}
                                  title={`Vendors: ${item.vendors}`}
                                />
                              ) : null}

                              {item.orders > 0 ? (
                                <div
                                  className="h-full bg-primary/70"
                                  style={{
                                    width: getSegmentWidth(item.orders),
                                  }}
                                  title={`Orders: ${item.orders}`}
                                />
                              ) : null}

                              {item.payments > 0 ? (
                                <div
                                  className="h-full bg-primary/60"
                                  style={{
                                    width: getSegmentWidth(item.payments),
                                  }}
                                  title={`Payments: ${item.payments}`}
                                />
                              ) : null}

                              {item.reports > 0 ? (
                                <div
                                  className="h-full bg-primary/50"
                                  style={{
                                    width: getSegmentWidth(item.reports),
                                  }}
                                  title={`Reports: ${item.reports}`}
                                />
                              ) : null}

                              {item.refunds > 0 ? (
                                <div
                                  className="h-full bg-primary/40"
                                  style={{
                                    width: getSegmentWidth(item.refunds),
                                  }}
                                  title={`Refunds: ${item.refunds}`}
                                />
                              ) : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-6">
                            <span>
                              Users: {number(item.users)}
                            </span>

                            <span>
                              Vendors: {number(item.vendors)}
                            </span>

                            <span>
                              Orders: {number(item.orders)}
                            </span>

                            <span>
                              Payments: {number(item.payments)}
                            </span>

                            <span>
                              Reports: {number(item.reports)}
                            </span>

                            <span>
                              Refunds: {number(item.refunds)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status breakdown */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardHeader>
                  <CardTitle>Order Status</CardTitle>

                  <CardDescription>
                    Orders grouped by their current persisted status.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {summary.orders.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No orders recorded for this period.
                    </p>
                  ) : (
                    summary.orders.map((order) => (
                      <div
                        key={order.currentStatus}
                        className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {order.currentStatus}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {currency(order.recordedOrderAmount)}
                          </p>
                        </div>

                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          {number(order.count)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-card-border/80 bg-card/90 shadow-sm">
                <CardHeader>
                  <CardTitle>Refund Status</CardTitle>

                  <CardDescription>
                    Refund requests grouped by their current status.
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {summary.refunds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No refunds recorded for this period.
                    </p>
                  ) : (
                    summary.refunds.map((refund) => (
                      <div
                        key={refund.currentStatus}
                        className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {refund.currentStatus}
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {currency(refund.requestedAmount)}
                          </p>
                        </div>

                        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                          {number(refund.count)}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}