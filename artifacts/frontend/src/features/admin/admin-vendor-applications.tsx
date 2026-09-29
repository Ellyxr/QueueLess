import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminShell } from "./admin-shell";
import {
  VENDOR_PLANS,
  approveVendorApplication,
  isContractOverdue,
  listVendorApplications,
  rejectSignedContract,
  rejectVendorApplication,
  verifyContractAndCharge,
  type VendorApplicationState,
  type VendorApplicationStatus,
} from "@/features/profile/vendor-application";

const STATUS_LABEL: Record<VendorApplicationStatus, string> = {
  not_applied: "Not applied",
  pending_review: "Pending review",
  rejected: "Rejected",
  awaiting_contract: "Awaiting contract",
  contract_submitted: "Contract submitted",
  contract_rejected: "Contract rejected",
  payment_processing: "Payment processing",
  payment_failed: "Payment failed",
  active: "Active",
};

const STATUS_BADGE_CLASS: Record<VendorApplicationStatus, string> = {
  not_applied: "bg-slate-500/10 text-slate-600",
  pending_review: "bg-amber-500/10 text-amber-600",
  rejected: "bg-destructive/10 text-destructive",
  awaiting_contract: "bg-blue-500/10 text-blue-600",
  contract_submitted: "bg-amber-500/10 text-amber-600",
  contract_rejected: "bg-destructive/10 text-destructive",
  payment_processing: "bg-blue-500/10 text-blue-600",
  payment_failed: "bg-destructive/10 text-destructive",
  active: "bg-emerald-500/10 text-emerald-600",
};

const FILTERS: Array<{ label: string; value: VendorApplicationStatus | "ALL" }> = [
  { label: "All", value: "ALL" },
  { label: "Pending review", value: "pending_review" },
  { label: "Awaiting contract", value: "awaiting_contract" },
  { label: "Contract submitted", value: "contract_submitted" },
  { label: "Payment processing", value: "payment_processing" },
  { label: "Payment failed", value: "payment_failed" },
  { label: "Active", value: "active" },
  { label: "Rejected", value: "rejected" },
];

export default function AdminVendorApplicationsPage() {
  const [applications, setApplications] = useState<VendorApplicationState[]>([]);
  const [filter, setFilter] = useState<VendorApplicationStatus | "ALL">("ALL");
  const [detailUserId, setDetailUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState<"application" | "contract" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => setApplications(listVendorApplications());

  useEffect(() => {
    refresh();
    // Mock-only: no push channel from the (nonexistent) backend, so poll for
    // payment_processing -> active/payment_failed transitions triggered from
    // the student side.
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const filtered = applications.filter(
    (application) => filter === "ALL" || application.status === filter,
  );

  const detail = applications.find((application) => application.userId === detailUserId) ?? null;

  const openDetail = (userId: string) => {
    setError(null);
    setShowRejectForm(null);
    setRejectReason("");
    setDetailUserId(userId);
  };

  const handleApprove = (userId: string) => {
    approveVendorApplication(userId);
    refresh();
    setDetailUserId(null);
  };

  const handleReject = (userId: string) => {
    if (!rejectReason.trim()) {
      setError("Enter a reason for the student.");
      return;
    }
    rejectVendorApplication(userId, rejectReason.trim());
    refresh();
    setDetailUserId(null);
  };

  const handleVerifyContract = (userId: string) => {
    verifyContractAndCharge(userId);
    refresh();
    setDetailUserId(null);
  };

  const handleRejectContract = (userId: string) => {
    if (!rejectReason.trim()) {
      setError("Enter a reason for the student.");
      return;
    }
    rejectSignedContract(userId, rejectReason.trim());
    refresh();
    setDetailUserId(null);
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

      <Card className="border-card-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tighter">Vendor applications</CardTitle>
          <CardDescription>
            Review student vendor applications, verify signed contracts, and confirm subscription
            billing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No applications match this filter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((application) => (
                  <TableRow key={application.userId}>
                    <TableCell>
                      <p className="font-medium text-foreground">{application.studentName}</p>
                      <p className="text-xs text-muted-foreground">{application.studentEmail}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{application.businessName}</p>
                      <p className="text-xs text-muted-foreground">{application.foodCategory}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {application.planId ? VENDOR_PLANS[application.planId].label : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary" className={STATUS_BADGE_CLASS[application.status]}>
                          {STATUS_LABEL[application.status]}
                        </Badge>
                        {application.status === "payment_processing" && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        )}
                        {isContractOverdue(application) && (
                          <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                            Overdue
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {application.submittedAt
                        ? new Date(application.submittedAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => openDetail(application.userId)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetailUserId(null)}>
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.businessName}</DialogTitle>
                <DialogDescription>
                  {detail.studentName} · {detail.studentEmail}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={STATUS_BADGE_CLASS[detail.status]}>
                    {STATUS_LABEL[detail.status]}
                  </Badge>
                  {isContractOverdue(detail) && (
                    <Badge variant="secondary" className="bg-destructive/10 text-destructive">
                      Contract window overdue
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Sells</p>
                    <p className="font-medium">{detail.foodCategory}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="font-medium">
                      {detail.planId
                        ? `${VENDOR_PLANS[detail.planId].label} · ₱${VENDOR_PLANS[detail.planId].price}`
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Bank account</p>
                    <p className="font-medium">{detail.bankAccountNumber}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Account holder</p>
                    <p className="font-medium">{detail.bankAccountHolderName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Valid ID</p>
                    {detail.validIdPhoto ? (
                      <img
                        src={detail.validIdPhoto}
                        alt="Submitted valid ID"
                        className="h-24 w-full rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                        Not submitted
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Holding ID selfie</p>
                    {detail.idSelfiePhoto ? (
                      <img
                        src={detail.idSelfiePhoto}
                        alt="Submitted selfie holding ID"
                        className="h-24 w-full rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                        Not submitted
                      </div>
                    )}
                  </div>
                </div>

                {(detail.status === "contract_submitted" ||
                  detail.status === "payment_processing" ||
                  detail.status === "payment_failed" ||
                  detail.status === "active") && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Signed contract scan</p>
                    {detail.signedContractPhoto ? (
                      <img
                        src={detail.signedContractPhoto}
                        alt="Signed contract scan"
                        className="h-32 w-full rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                        Not submitted
                      </div>
                    )}
                  </div>
                )}

                {detail.status === "payment_failed" && detail.paymentFailureReason && (
                  <p className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                    {detail.paymentFailureReason}
                  </p>
                )}

                {showRejectForm && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      Reason for the student
                    </label>
                    <Textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={3}
                      placeholder="Explain what needs fixing or why this can't be approved."
                    />
                  </div>
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>

              <DialogFooter className="flex-wrap gap-2">
                {detail.status === "pending_review" && !showRejectForm && (
                  <>
                    <Button
                      variant="outline"
                      className="rounded-full text-destructive hover:bg-destructive/10"
                      onClick={() => setShowRejectForm("application")}
                    >
                      Reject
                    </Button>
                    <Button className="rounded-full" onClick={() => handleApprove(detail.userId)}>
                      Approve — start contract window
                    </Button>
                  </>
                )}

                {detail.status === "pending_review" && showRejectForm === "application" && (
                  <>
                    <Button variant="outline" className="rounded-full" onClick={() => setShowRejectForm(null)}>
                      Back
                    </Button>
                    <Button
                      className="rounded-full"
                      variant="destructive"
                      onClick={() => handleReject(detail.userId)}
                    >
                      Confirm rejection
                    </Button>
                  </>
                )}

                {detail.status === "contract_submitted" && !showRejectForm && (
                  <>
                    <Button
                      variant="outline"
                      className="rounded-full text-destructive hover:bg-destructive/10"
                      onClick={() => setShowRejectForm("contract")}
                    >
                      Reject scan
                    </Button>
                    <Button className="rounded-full" onClick={() => handleVerifyContract(detail.userId)}>
                      Verify &amp; charge subscription
                    </Button>
                  </>
                )}

                {detail.status === "contract_submitted" && showRejectForm === "contract" && (
                  <>
                    <Button variant="outline" className="rounded-full" onClick={() => setShowRejectForm(null)}>
                      Back
                    </Button>
                    <Button
                      className="rounded-full"
                      variant="destructive"
                      onClick={() => handleRejectContract(detail.userId)}
                    >
                      Confirm rejection
                    </Button>
                  </>
                )}

                <Button variant="ghost" className="rounded-full" onClick={() => setDetailUserId(null)}>
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
