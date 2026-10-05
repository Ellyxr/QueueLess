import { useEffect, useState } from "react";
import {
  Eye,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  User,
  CreditCard,
  ShoppingBag,
} from "lucide-react";

import {
  getAdminTransaction,
  getAdminTransactionSummary,
  listAdminTransactions,
  type AdminTransactionDetail,
  type AdminTransactionPurpose,
  type AdminTransactionProvider,
  type AdminTransactionRow,
  type AdminTransactionStatus,
} from "@/features/auth/api";

import { AdminShell } from "./admin-shell";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_OPTIONS: Array<{
  value: AdminTransactionStatus | "ALL";
  label: string;
}> = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "SUCCEEDED", label: "Succeeded" },
  { value: "FAILED", label: "Failed" },
];

const PURPOSE_OPTIONS: Array<{
  value: AdminTransactionPurpose | "ALL";
  label: string;
}> = [
  { value: "ALL", label: "All purposes" },
  { value: "WALLET_TOPUP", label: "Wallet top-up" },
  { value: "ORDER_SHARE", label: "Order share" },
  { value: "PASABUY", label: "Pasabuy" },
  { value: "SUBSCRIPTION", label: "Subscription" },
  { value: "FEATURED_LISTING", label: "Featured listing" },
];

const PROVIDER_OPTIONS: Array<{
  value: AdminTransactionProvider | "ALL";
  label: string;
}> = [
  { value: "ALL", label: "All providers" },
  { value: "PAYMONGO", label: "PayMongo" },
  { value: "WALLET", label: "Wallet" },
];

const STATUS_BADGE_CLASS: Record<AdminTransactionStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SUCCEEDED: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAmount(amount: number | string, currency: string) {
  const numericAmount = Number(amount);

  if (Number.isNaN(numericAmount)) {
    return `${currency} ${amount}`;
  }

  return `${currency} ${numericAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(
  value: Record<string, unknown>,
  key: string,
): string | null {
  const result = value[key];

  return typeof result === "string" ? result : null;
}

function getNumberOrString(
  value: Record<string, unknown>,
  key: string,
): number | string | null {
  const result = value[key];

  if (typeof result === "number" || typeof result === "string") {
    return result;
  }

  return null;
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<AdminTransactionRow[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] =
    useState<AdminTransactionStatus | "ALL">("ALL");

  const [purpose, setPurpose] =
    useState<AdminTransactionPurpose | "ALL">("ALL");

  const [provider, setProvider] =
    useState<AdminTransactionProvider | "ALL">("ALL");

  const [orderId, setOrderId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [detail, setDetail] =
    useState<AdminTransactionDetail | null>(null);

  const limit = 20;

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);

      const filters = {
        status: status === "ALL" ? undefined : status,
        purpose: purpose === "ALL" ? undefined : purpose,
        provider: provider === "ALL" ? undefined : provider,
        orderId: orderId.trim() || undefined,
        vendorId: vendorId.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        limit,
      };

      const [listResponse, summaryResponse] = await Promise.all([
        listAdminTransactions(filters),
        getAdminTransactionSummary(filters),
      ]);

      setTransactions(listResponse.items);
      setTotalPages(Math.max(1, listResponse.totalPages));
      setSummaryTotal(summaryResponse.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load transactions.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [
    status,
    purpose,
    provider,
    orderId,
    vendorId,
    from,
    to,
    page,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    status,
    purpose,
    provider,
    orderId,
    vendorId,
    from,
    to,
  ]);

  const openDetail = async (transactionId: string) => {
    try {
      setDetailLoading(true);
      setError(null);

      const data = await getAdminTransaction(transactionId);
      setDetail(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load transaction details.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setDetailLoading(false);
  };

  const payer = isRecord(detail?.payer)
    ? detail.payer
    : null;

  const paymentShares = Array.isArray(detail?.paymentShares)
    ? detail.paymentShares
    : [];

  return (
    <AdminShell>
      <section className="space-y-6">
        {/* Page heading */}
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-amber-600">
            Transactions
          </p>

          <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">
            Transaction monitoring
          </h2>

          <p className="mt-1 text-sm text-muted-foreground">
            Monitor payments and investigate transaction-related issues.
          </p>
        </div>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-1">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              Total transactions
            </p>

            <p className="mt-2 text-3xl font-bold">
              {summaryTotal}
            </p>
          </div>

        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Status */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Status
              </label>

              <div className="relative">
                <select
                    value={status}
                    onChange={(event) =>
                        setStatus(
                            event.target.value as
                            | AdminTransactionStatus
                            | "ALL",
                        )
                    }
                    className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-10 text-sm"
                >
                    {STATUS_OPTIONS.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Purpose */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Purpose
              </label>

              <div className="relative">
                <select
                    value={purpose}
                    onChange={(event) =>
                        setPurpose(
                            event.target.value as
                            | AdminTransactionPurpose
                            | "ALL",
                        )
                    }
                    className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-10 text-sm"
                >
                    {PURPOSE_OPTIONS.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                  ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Provider */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Provider
              </label>

              <div className="relative">
                <select
                    value={provider}
                    onChange={(event) =>
                        setProvider(
                            event.target.value as
                                | AdminTransactionProvider
                                | "ALL",
                        )
                    }
                    className="h-10 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-10 text-sm"
                >
                    {PROVIDER_OPTIONS.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            {/* Order ID */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Order ID
              </label>

              <input
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                placeholder="Search order ID"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>

            {/* Vendor ID */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                Vendor ID
              </label>

              <input
                value={vendorId}
                onChange={(event) => setVendorId(event.target.value)}
                placeholder="Search vendor ID"
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>

            {/* From */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                From
              </label>

              <input
                type="datetime-local"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>

            {/* To */}
            <div>
              <label className="mb-2 block text-sm font-semibold">
                To
              </label>

              <input
                type="datetime-local"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Error */}
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {/* Transactions table */}
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border bg-secondary/40">
                <tr>
                  <th className="px-5 py-4 text-left font-semibold">
                    Transaction
                  </th>

                  <th className="px-5 py-4 text-left font-semibold">
                    Purpose
                  </th>

                  <th className="px-5 py-4 text-left font-semibold">
                    Status
                  </th>

                  <th className="px-5 py-4 text-left font-semibold">
                    Amount
                  </th>

                  <th className="px-5 py-4 text-left font-semibold">
                    Provider
                  </th>

                  <th className="px-5 py-4 text-left font-semibold">
                    Date
                  </th>

                  <th className="px-5 py-4 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center"
                    >
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />

                      <p className="mt-2 text-sm text-muted-foreground">
                        Loading transactions...
                      </p>
                    </td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-muted-foreground"
                    >
                      No transactions found.
                    </td>
                  </tr>
                ) : (
                  transactions.map((transaction) => (
                    <tr
                      key={transaction.id}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-5 py-4">
                        <p className="font-mono text-xs">
                          {transaction.id}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {formatLabel(transaction.purpose)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                            STATUS_BADGE_CLASS[transaction.status]
                          }`}
                        >
                          {formatLabel(transaction.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-semibold">
                        {formatAmount(
                          transaction.amount,
                          transaction.currency,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        {formatLabel(transaction.provider)}
                      </td>

                      <td className="px-5 py-4 text-muted-foreground">
                        {formatDate(transaction.createdAt)}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            void openDetail(transaction.id)
                          }
                          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-secondary"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {!loading && transactions.length > 0 ? (
            <div className="flex items-center justify-between border-t border-border px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    setPage((current) => Math.max(1, current - 1))
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(totalPages, current + 1),
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Transaction Detail Dialog */}
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeDetail();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {detailLoading ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : detail ? (
            <>
              <DialogHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <CreditCard className="h-5 w-5 text-primary" />
                  </div>

                  <div className="min-w-0">
                    <DialogTitle className="text-xl">
                      {formatLabel(detail.purpose)}
                    </DialogTitle>

                    <DialogDescription className="mt-1 break-all font-mono text-xs">
                      {detail.id}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Transaction Information */}
                <section className="rounded-2xl border border-border p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />

                    <h3 className="font-semibold">
                      Transaction Information
                    </h3>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Transaction ID
                      </p>

                      <p className="mt-1 break-all font-mono text-sm">
                        {detail.id}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Purpose
                      </p>

                      <p className="mt-1 font-medium">
                        {formatLabel(detail.purpose)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Status
                      </p>

                      <span
                        className={`mt-1 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                          STATUS_BADGE_CLASS[detail.status]
                        }`}
                      >
                        {formatLabel(detail.status)}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Amount
                      </p>

                      <p className="mt-1 font-semibold">
                        {formatAmount(
                          detail.amount,
                          detail.currency,
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Currency
                      </p>

                      <p className="mt-1 font-medium">
                        {detail.currency}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Provider
                      </p>

                      <p className="mt-1 font-medium">
                        {formatLabel(detail.provider)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Created
                      </p>

                      <p className="mt-1 text-sm">
                        {formatDate(detail.createdAt)}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">
                        Updated
                      </p>

                      <p className="mt-1 text-sm">
                        {formatDate(detail.updatedAt)}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Payer */}
                {payer ? (
                  <section className="rounded-2xl border border-border p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />

                      <h3 className="font-semibold">
                        Payer
                      </h3>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Name
                        </p>

                        <p className="mt-1 font-medium">
                          {getString(payer, "fullName") ??
                            getString(payer, "name") ??
                            "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs text-muted-foreground">
                          User ID
                        </p>

                        <p className="mt-1 break-all font-mono text-xs">
                          {getString(payer, "id") ?? "—"}
                        </p>
                      </div>
                    </div>
                  </section>
                ) : null}

                {/* Payment Shares */}
                {paymentShares.length > 0 ? (
                  <section className="rounded-2xl border border-border p-5">
                    <div className="mb-4 flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-muted-foreground" />

                      <h3 className="font-semibold">
                        Payment Shares
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {paymentShares.map((share, index) => {
                        if (!isRecord(share)) {
                          return null;
                        }

                        const shareId =
                          getString(share, "id");

                        const shareStatus =
                          getString(share, "status");

                        const amountDue =
                          getNumberOrString(
                            share,
                            "amountDue",
                          );

                        const order = isRecord(
                          share.order,
                        )
                          ? share.order
                          : null;

                        const orderId = order
                          ? getString(order, "id")
                          : null;

                        const orderStatus = order
                          ? getString(order, "status")
                          : null;

                        const vendor = order?.vendor;
                        const vendorRecord = isRecord(vendor)
                          ? vendor
                          : null;

                        const vendorName = vendorRecord
                          ? getString(vendorRecord, "name")
                          : null;

                        return (
                          <div
                            key={shareId ?? index}
                            className="rounded-xl border border-border bg-secondary/20 p-4"
                          >
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Share ID
                                </p>

                                <p className="mt-1 break-all font-mono text-xs">
                                  {shareId ?? "—"}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Status
                                </p>

                                <p className="mt-1 font-medium">
                                  {shareStatus
                                    ? formatLabel(shareStatus)
                                    : "—"}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Amount Due
                                </p>

                                <p className="mt-1 font-semibold">
                                  {amountDue !== null
                                    ? formatAmount(
                                        amountDue,
                                        detail.currency,
                                      )
                                    : "—"}
                                </p>
                              </div>

                              {orderId ? (
                                <div>
                                  <p className="text-xs text-muted-foreground">
                                    Order ID
                                  </p>

                                  <p className="mt-1 break-all font-mono text-xs">
                                    {orderId}
                                  </p>
                                </div>
                              ) : null}

                              {orderStatus ? (
                                <div>
                                  <p className="text-xs text-muted-foreground">
                                    Order Status
                                  </p>

                                  <p className="mt-1 font-medium">
                                    {formatLabel(orderStatus)}
                                  </p>
                                </div>
                              ) : null}

                              {vendorName ? (
                                <div>
                                  <p className="text-xs text-muted-foreground">
                                    Vendor
                                  </p>

                                  <p className="mt-1 font-medium">
                                    {vendorName}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ) : null}

                {/* Other linked information */}
                {Object.entries(detail).map(([key, value]) => {
                  if (
                    [
                      "id",
                      "purpose",
                      "status",
                      "amount",
                      "currency",
                      "provider",
                      "createdAt",
                      "updatedAt",
                      "payer",
                      "paymentShares",
                    ].includes(key)
                  ) {
                    return null;
                  }

                  if (
                    value === null ||
                    value === undefined
                  ) {
                    return null;
                  }

                  if (
                    key === "order" ||
                    key === "vendor"
                  ) {
                    return null;
                  }

                  if (
                    typeof value === "string" ||
                    typeof value === "number" ||
                    typeof value === "boolean"
                  ) {
                    return (
                      <section
                        key={key}
                        className="rounded-2xl border border-border p-5"
                      >
                        <p className="text-xs text-muted-foreground">
                          {formatLabel(key)}
                        </p>

                        <p className="mt-1 break-words text-sm font-medium">
                          {String(value)}
                        </p>
                      </section>
                    );
                  }

                  return null;
                })}
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={closeDetail}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
                >
                  <X className="h-4 w-4" />
                  Close
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}