import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminShell } from "./admin-shell";
import { listAdminRefunds, updateAdminRefundStatus, type AdminRefundRow } from "@/features/auth/api";

type RefundStatus = AdminRefundRow["status"];

const currency = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;

const STATUS_BADGE_CLASS: Record<RefundStatus, string> = {
  REQUESTED: "bg-amber-500/10 text-amber-600",
  APPROVED: "bg-blue-500/10 text-blue-600",
  PROCESSED: "bg-emerald-500/10 text-emerald-600",
  DENIED: "bg-destructive/10 text-destructive",
};

const FILTERS: Array<{ label: string; value: RefundStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Requested", value: "REQUESTED" },
  { label: "Approved", value: "APPROVED" },
  { label: "Processed", value: "PROCESSED" },
  { label: "Denied", value: "DENIED" },
];

export default function AdminRefundsPage() {
  const [refunds, setRefunds] = useState<AdminRefundRow[]>([]);
  const [filter, setFilter] = useState<RefundStatus | "ALL">("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const detailRefund = refunds.find((refund) => refund.id === detailId) ?? null;

  useEffect(() => {
    setIsLoading(true);
    listAdminRefunds(filter)
      .then(setRefunds)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load refunds."))
      .finally(() => setIsLoading(false));
  }, [filter]);

  const updateStatus = async (id: string, status: RefundStatus) => {
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await updateAdminRefundStatus(id, status as "APPROVED" | "DENIED" | "PROCESSED");
      setRefunds((prev) =>
        prev.map((refund) => (refund.id === id ? { ...refund, ...updated } : refund)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update this refund.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <AdminShell>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              filter === value
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-xs text-destructive">
          {error}
        </div>
      )}

      <Card className="border-card-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tighter">Refund requests</CardTitle>
          <CardDescription>Requests submitted by students and vendors.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading refunds...</p>
          ) : refunds.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No refund requests here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Requested by</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {refunds.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{refund.requesterName}</p>
                      <p className="text-xs text-muted-foreground">{refund.requesterEmail ?? "—"}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {refund.orderId ? refund.orderId.slice(0, 8) : "—"}
                    </TableCell>
                    <TableCell>{refund.vendorName ?? "—"}</TableCell>
                    <TableCell className="font-medium">{currency(refund.amount)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={refund.reason}>
                      {refund.category ? `${refund.category}: ` : ""}
                      {refund.reason || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_BADGE_CLASS[refund.status]}>
                        {refund.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(refund.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="rounded-full"
                        aria-label="View more"
                        onClick={() => setDetailId(refund.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      {refund.status === "REQUESTED" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            disabled={updatingId === refund.id}
                            onClick={() => updateStatus(refund.id, "APPROVED")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive hover:bg-destructive/10"
                            disabled={updatingId === refund.id}
                            onClick={() => updateStatus(refund.id, "DENIED")}
                          >
                            Deny
                          </Button>
                        </div>
                      ) : refund.status === "APPROVED" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={updatingId === refund.id}
                          onClick={() => updateStatus(refund.id, "PROCESSED")}
                        >
                          Mark processed
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailRefund !== null} onOpenChange={(open) => !open && setDetailId(null)}>
        <DialogContent>
          {detailRefund && (
            <>
              <DialogHeader>
                <DialogTitle>Refund case details</DialogTitle>
                <DialogDescription>{detailRefund.requesterName}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Complainant email</span>
                  <span className="font-medium text-foreground">
                    {detailRefund.requesterEmail ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium text-foreground">
                    {detailRefund.vendorName ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Order reference</span>
                  <span className="font-mono text-xs text-foreground">
                    {detailRefund.orderId ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Group order</span>
                  <span className="font-medium text-foreground">
                    {detailRefund.isGroupOrder ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Order placed</span>
                  <span className="font-medium text-foreground">
                    {detailRefund.orderedAt
                      ? new Date(detailRefund.orderedAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Complaint filed</span>
                  <span className="font-medium text-foreground">
                    {new Date(detailRefund.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium text-foreground">
                    {currency(detailRefund.amount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="secondary" className={STATUS_BADGE_CLASS[detailRefund.status]}>
                    {detailRefund.status}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <span className="text-muted-foreground">Comments</span>
                  <p className="rounded-[14px] border border-border bg-secondary/30 p-3 text-foreground">
                    {detailRefund.category ? `${detailRefund.category}: ` : ""}
                    {detailRefund.reason || "No additional comments provided."}
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" className="rounded-full" onClick={() => setDetailId(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
