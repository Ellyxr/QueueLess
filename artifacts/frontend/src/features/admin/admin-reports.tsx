import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { AdminShell } from "./admin-shell";
import {
  getAdminReport,
  listAdminReports,
  updateAdminReportStatus,
  type AdminReport,
  type AdminReportDetail,
  type AdminReportStatus,
  type AdminReportTargetType,
} from "@/features/auth/api";

const STATUSES: AdminReportStatus[] = [
  "OPEN",
  "IN_REVIEW",
  "RESOLVED",
  "DISMISSED",
];

const TARGET_TYPES: AdminReportTargetType[] = [
  "VENDOR",
  "USER",
  "ORDER",
  "TRANSACTION",
  "PRODUCT",
  "PASABUY",
];

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function getTargetType(
  report: AdminReport,
): AdminReportTargetType | undefined {
  if (report.reportedVendorId) return "VENDOR";
  if (report.reportedUserId) return "USER";
  if (report.reportedOrderId) return "ORDER";
  if (report.reportedPaymentId) return "TRANSACTION";
  if (report.reportedProductId) return "PRODUCT";
  if (report.reportedPasabuyId) return "PASABUY";
  return undefined;
}

function formatTargetType(value?: AdminReportTargetType) {
  if (!value) return "Unknown";
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatStatus(value: AdminReportStatus) {
  return value.replace("_", " ");
}

function statusVariant(
  status: AdminReportStatus,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "OPEN") return "destructive";
  if (status === "IN_REVIEW") return "default";
  if (status === "RESOLVED") return "secondary";
  return "outline";
}

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [status, setStatus] = useState<AdminReportStatus | "ALL">("ALL");
  const [targetType, setTargetType] = useState<
    AdminReportTargetType | "ALL"
  >("ALL");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedReport, setSelectedReport] =
    useState<AdminReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [resolutionStatus, setResolutionStatus] = useState<
    "IN_REVIEW" | "RESOLVED" | "DISMISSED"
  >("IN_REVIEW");
  const [resolutionNote, setResolutionNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setLoading(true);
      setError(null);

      try {
        const response = await listAdminReports({
          status: status === "ALL" ? undefined : status,
          targetType: targetType === "ALL" ? undefined : targetType,
          page,
          limit: 20,
        });

        if (cancelled) return;

        setReports(response.items);
        setTotalPages(response.totalPages);
        setTotal(response.total);
      } catch (err) {
        if (cancelled) return;

        setError(
          err instanceof Error ? err.message : "Failed to load reports.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      cancelled = true;
    };
  }, [status, targetType, page]);

  function handleStatusChange(value: string) {
    setStatus(value as AdminReportStatus | "ALL");
    setPage(1);
  }

  function handleTargetTypeChange(value: string) {
    setTargetType(value as AdminReportTargetType | "ALL");
    setPage(1);
  }

  async function handleViewReport(reportId: string) {
    setDetailLoading(true);

    try {
      const detail = await getAdminReport(reportId);
      setSelectedReport(detail);
      setResolutionStatus(
        detail.status === "OPEN" ? "IN_REVIEW" : "RESOLVED",
      );
      setResolutionNote("");
      setStatusError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load report details.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleUpdateStatus() {
    if (!selectedReport) return;

    if (
      (resolutionStatus === "RESOLVED" ||
        resolutionStatus === "DISMISSED") &&
      !resolutionNote.trim()
    ) {
      setStatusError("A note is required when resolving or dismissing a report.");
      return;
    }

    setUpdatingStatus(true);
    setError(null);
    setStatusError(null);

    try {
      const updatedReport = await updateAdminReportStatus(
        selectedReport.id,
        resolutionStatus,
        resolutionNote,
      );

      setSelectedReport(updatedReport);

      const response = await listAdminReports({
        status: status === "ALL" ? undefined : status,
        targetType: targetType === "ALL" ? undefined : targetType,
        page,
        limit: 20,
      });

      setReports(response.items);
      setTotalPages(response.totalPages);
      setTotal(response.total);
      setResolutionNote("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update report status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <AdminShell>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Reports</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Review platform reports submitted by users.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Select value={status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  {STATUSES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {formatStatus(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={targetType}
                onValueChange={handleTargetTypeChange}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Target type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All targets</SelectItem>
                  {TARGET_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {formatTargetType(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading reports...
            </p>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">
              {error}
            </p>
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No reports found.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Reporter</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {reports.map((report) => (
                      <TableRow key={report.id}>
                        <TableCell>
                          <div className="font-medium">{report.category}</div>
                          <div className="max-w-[300px] truncate text-sm text-muted-foreground">
                            {report.description}
                          </div>
                        </TableCell>

                        <TableCell>
                          {formatTargetType(getTargetType(report))}
                        </TableCell>

                        <TableCell>
                          <div>{report.reporter.fullName}</div>
                          <div className="text-sm text-muted-foreground">
                            {report.reporter.email ?? "No email"}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge variant={statusVariant(report.status)}>
                            {formatStatus(report.status)}
                          </Badge>
                        </TableCell>

                        <TableCell>{formatDate(report.createdAt)}</TableCell>

                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleViewReport(report.id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <p className="text-sm text-muted-foreground">
                  {total} total report{total === 1 ? "" : "s"}
                </p>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    Previous
                  </Button>

                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={selectedReport !== null || detailLoading}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedReport(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Report details</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading report details...
            </p>
          ) : selectedReport ? (
            <div className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Category
                  </p>
                  <p className="mt-1 font-medium">
                    {selectedReport.category}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Status
                  </p>
                  <div className="mt-1">
                    <Badge variant={statusVariant(selectedReport.status)}>
                      {formatStatus(selectedReport.status)}
                    </Badge>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Target type
                  </p>
                  <p className="mt-1 text-sm">
                    {formatTargetType(getTargetType(selectedReport))}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Created
                  </p>
                  <p className="mt-1 text-sm">
                    {formatDate(selectedReport.createdAt)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </p>
                <div className="mt-2 rounded-lg border border-border bg-muted/20 p-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {selectedReport.description}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reporter
                </p>
                <div className="mt-2 rounded-lg border border-border p-4">
                  <p className="text-sm font-medium">
                    {selectedReport.reporter.fullName}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selectedReport.reporter.email ?? "No email"}
                  </p>
                </div>
              </div>

              {selectedReport.status !== "RESOLVED" &&
                selectedReport.status !== "DISMISSED" && (
                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <div>
                      <p className="text-sm font-semibold">
                        Update report status
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Move this report through the review process.
                      </p>
                      {statusError && (
                        <p className="text-sm text-destructive">{statusError}</p>
                      )}
                    </div>

                    <Select
                      value={resolutionStatus}
                      onValueChange={(value) =>
                        setResolutionStatus(
                          value as
                            | "IN_REVIEW"
                            | "RESOLVED"
                            | "DISMISSED",
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedReport.status === "OPEN" && (
                          <SelectItem value="IN_REVIEW">In review</SelectItem>
                        )}

                        {selectedReport.status === "IN_REVIEW" && (
                          <>
                            <SelectItem value="RESOLVED">Resolved</SelectItem>
                            <SelectItem value="DISMISSED">Dismissed</SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>

                    <Textarea
                      value={resolutionNote}
                      onChange={(event) =>
                        setResolutionNote(event.target.value)
                      }
                      placeholder="Add a note about this status change..."
                      rows={4}
                      className="resize-none"
                    />

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        onClick={() => void handleUpdateStatus()}
                        disabled={updatingStatus}
                      >
                        {updatingStatus
                          ? "Updating..."
                          : "Update status"}
                      </Button>
                    </div>
                  </div>
                )}

              {selectedReport.attachment && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Attachment
                  </p>

                  <div className="mt-2 flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {selectedReport.attachment.fileName}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {selectedReport.attachment.mimeType ??
                          "Unknown file type"}
                      </p>
                    </div>

                    <a
                      href={selectedReport.attachment.adminUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-sm font-medium text-primary hover:underline"
                    >
                      Open attachment
                    </a>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Status history
                </p>

                {selectedReport.statusHistory.length === 0 ? (
                  <div className="mt-2 rounded-lg border border-dashed border-border p-4">
                    <p className="text-sm text-muted-foreground">
                      No status history.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    {selectedReport.statusHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="rounded-lg border border-border p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant={statusVariant(entry.status)}>
                            {formatStatus(entry.status)}
                          </Badge>

                          <span className="text-xs text-muted-foreground">
                            {formatDate(entry.changedAt)}
                          </span>
                        </div>

                        {entry.note && (
                          <p className="mt-3 text-sm leading-5">
                            {entry.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}