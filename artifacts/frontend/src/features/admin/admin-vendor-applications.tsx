import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  getAdminVendor,
  getAdminVendorAudit,
  listAdminVendors,
  updateAdminVendorStatus,
  type AdminVendorDetail,
  type AdminVendorRow,
  type AdminVendorStatus,
} from "@/features/auth/api";

const STATUS_LABEL: Record<AdminVendorStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

const STATUS_BADGE_CLASS: Record<AdminVendorStatus, string> = {
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-600",
  ACTIVE: "bg-emerald-500/10 text-emerald-600",
  SUSPENDED: "bg-destructive/10 text-destructive",
};

const FILTERS: Array<{
  label: string;
  value: AdminVendorStatus | "ALL";
}> = [
  { label: "All", value: "ALL" },
  { label: "Pending approval", value: "PENDING_APPROVAL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
];

export default function AdminVendorApplicationsPage() {
  const [vendors, setVendors] = useState<AdminVendorRow[]>([]);
  const [filter, setFilter] = useState<AdminVendorStatus | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<AdminVendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [nextStatus, setNextStatus] = useState<AdminVendorStatus | null>(null);
  const [reason, setReason] = useState("");
  const [auditCount, setAuditCount] = useState(0);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await listAdminVendors({
        search: search.trim() || undefined,
        status: filter === "ALL" ? undefined : filter,
      });

      setVendors(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load vendors.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
  void refresh();
  }, [filter, search]);

  const filtered = vendors;

  const openDetail = async (vendorId: string) => {
    try {
      setDetailLoading(true);
      setError(null);

      const [vendor, audit] = await Promise.all([
        getAdminVendor(vendorId),
        getAdminVendorAudit(vendorId, 1, 20),
      ]);

      setDetail(vendor);
      setAuditCount(audit.total);
      setShowStatusForm(false);
      setNextStatus(null);
      setReason("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load vendor details.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const openStatusChange = (status: AdminVendorStatus) => {
    setNextStatus(status);
    setReason("");
    setShowStatusForm(true);
    setError(null);
  };

  const handleStatusChange = async () => {
    if (!detail || !nextStatus) return;

    try {
      setActionLoading(true);
      setError(null);

      await updateAdminVendorStatus(
        detail.id,
        nextStatus,
        reason.trim() || undefined,
      );

      const refreshed = await getAdminVendor(detail.id);
      setDetail(refreshed);

      setShowStatusForm(false);
      setNextStatus(null);
      setReason("");

      await refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update vendor status.",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString();

  return (
  <AdminShell>
    <div className="space-y-4">

      {/* Filters - OUTSIDE the card */}
      <div className="flex flex-wrap gap-2">
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

      {/* Vendor management card */}
      <Card className="border-card-border/80 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl tracking-tighter">
            Vendor management
          </CardTitle>
          <CardDescription>
            View vendors, search accounts, and manage approved vendor status changes.
          </CardDescription>
        </CardHeader>

  

          <CardContent>

            <div className="mb-5">
              <Input
                className="max-w-md"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search vendor, business, or owner..."
              />
            </div>

            {error && (
              <p className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No vendors match this filter.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        <p className="font-medium text-foreground">
                          {vendor.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {vendor.id}
                        </p>
                      </TableCell>

                      <TableCell>
                        <p className="text-sm">{vendor.owner.fullName}</p>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={STATUS_BADGE_CLASS[vendor.status]}
                        >
                          {STATUS_LABEL[vendor.status]}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(vendor.createdAt)}
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full"
                          onClick={() => void openDetail(vendor.id)}
                          disabled={detailLoading}
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
      </div>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setShowStatusForm(false);
            setNextStatus(null);
            setReason("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>
                  Vendor account details and administrative controls.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={STATUS_BADGE_CLASS[detail.status]}
                  >
                    {STATUS_LABEL[detail.status]}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Business name
                    </p>
                    <p className="font-medium">
                      {detail.businessName ?? detail.name}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Vendor type
                    </p>
                    <p className="font-medium">{detail.vendorType}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Owner
                    </p>
                    <p className="font-medium">
                      {detail.owner.fullName}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Owner account
                    </p>
                    <p className="font-medium">
                      {detail.owner.isActive ? "Active" : "Inactive"}
                      {" · "}
                      {detail.owner.isArchived ? "Archived" : "Not archived"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Products
                    </p>
                    <p className="font-medium">{detail.productCount}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Orders
                    </p>
                    <p className="font-medium">{detail.orderCount}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Reports
                    </p>
                    <p className="font-medium">{detail.reportCount}</p>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">
                      Audit records
                    </p>
                    <p className="font-medium">{auditCount}</p>
                  </div>
                </div>

                {detail.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Description
                    </p>
                    <p className="text-sm">{detail.description}</p>
                  </div>
                )}

                {detail.campusLocation && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Campus location
                    </p>
                    <p className="text-sm">{detail.campusLocation}</p>
                  </div>
                )}

                {detail.pickupLocation && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Pickup location
                    </p>
                    <p className="text-sm">{detail.pickupLocation}</p>
                  </div>
                )}

                {showStatusForm && nextStatus && (
                  <div className="space-y-2 rounded-lg border border-border p-4">
                    <p className="text-sm font-medium">
                      Change status to{" "}
                      <span className="font-semibold">
                        {STATUS_LABEL[nextStatus]}
                      </span>
                    </p>

                    <Textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      rows={3}
                      placeholder="Optional reason for this status change."
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="flex-wrap gap-2">
                {!showStatusForm && (
                  <>
                    {detail.status !== "ACTIVE" && (
                      <Button
                        className="rounded-full"
                        onClick={() =>
                          openStatusChange("ACTIVE")
                        }
                      >
                        Activate
                      </Button>
                    )}

                    {detail.status !== "SUSPENDED" && (
                      <Button
                        variant="destructive"
                        className="rounded-full"
                        onClick={() =>
                          openStatusChange("SUSPENDED")
                        }
                      >
                        Suspend
                      </Button>
                    )}

                    {detail.status !== "PENDING_APPROVAL" && (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() =>
                          openStatusChange("PENDING_APPROVAL")
                        }
                      >
                        Set pending approval
                      </Button>
                    )}
                  </>
                )}

                {showStatusForm && (
                  <>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setShowStatusForm(false);
                        setNextStatus(null);
                        setReason("");
                      }}
                    >
                      Cancel
                    </Button>

                    <Button
                      className="rounded-full"
                      onClick={() => void handleStatusChange()}
                      disabled={actionLoading}
                    >
                      {actionLoading && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Confirm status change
                    </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setDetail(null)}
                >
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