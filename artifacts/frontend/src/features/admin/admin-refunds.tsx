import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminShell } from "./admin-shell";
import { MOCK_REFUNDS, type RefundRequest, type RefundStatus } from "./admin-data";

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
  const [refunds, setRefunds] = useState<RefundRequest[]>(MOCK_REFUNDS);
  const [filter, setFilter] = useState<RefundStatus | "ALL">("ALL");

  const updateStatus = (id: string, status: RefundStatus) => {
    setRefunds((prev) => prev.map((refund) => (refund.id === id ? { ...refund, status } : refund)));
  };

  const visible = filter === "ALL" ? refunds : refunds.filter((refund) => refund.status === filter);

  return (
    <AdminShell>
      <div className="mb-6 rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        Showing placeholder data — approve/deny here don't persist anywhere yet. See AddressMe.md.
      </div>

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

      <Card className="border-card-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tighter">Refund requests</CardTitle>
          <CardDescription>Requests submitted by students and vendors.</CardDescription>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((refund) => (
                  <TableRow key={refund.id}>
                    <TableCell>
                      <p className="font-medium text-foreground">{refund.requesterName}</p>
                      <p className="text-xs text-muted-foreground">{refund.requesterEmail}</p>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{refund.orderId.slice(0, 8)}</TableCell>
                    <TableCell>{refund.vendorName}</TableCell>
                    <TableCell className="font-medium">{currency(refund.amount)}</TableCell>
                    <TableCell className="max-w-[220px] truncate" title={refund.reason}>
                      {refund.reason}
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
                      {refund.status === "REQUESTED" ? (
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-full"
                            onClick={() => updateStatus(refund.id, "APPROVED")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive hover:bg-destructive/10"
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
    </AdminShell>
  );
}
