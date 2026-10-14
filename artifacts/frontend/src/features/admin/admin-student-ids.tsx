import { useEffect, useState } from "react";
import { Check, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AdminShell } from "./admin-shell";
import {
  listPendingStudentIds,
  refreshStudentIdPhotoUrl,
  reviewStudentId,
  type PendingStudentIdReview,
} from "@/features/pasabuy/pasabuy-api";

export default function AdminStudentIdsPage() {
  const [submissions, setSubmissions] = useState<PendingStudentIdReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setLoading(true);
      setError(null);
      setSubmissions(await listPendingStudentIds());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load student ID submissions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleReview = async (userId: string, decision: "APPROVE" | "REJECT") => {
    setBusyUserId(userId);
    setError(null);
    try {
      await reviewStudentId(userId, decision);
      setSubmissions((current) => current.filter((item) => item.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the review.");
    } finally {
      setBusyUserId(null);
    }
  };

  // Photo links expire after 5 minutes; fetch a fresh one if the image fails to load.
  const handlePhotoError = async (userId: string) => {
    try {
      const { photoUrl } = await refreshStudentIdPhotoUrl(userId);
      setSubmissions((current) =>
        current.map((item) => (item.userId === userId ? { ...item, photoUrl } : item)),
      );
    } catch {
      // leave as-is; the admin can use Refresh
    }
  };

  return (
    <AdminShell>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Student ID verification</CardTitle>
            <CardDescription>
              Students must have an approved ID before they can deliver Pasabuy orders.
              Rejecting removes the photo so the student can resubmit.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
          {loading && !submissions.length ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !submissions.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No student IDs are waiting for review.
            </p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {submissions.map((item) => (
                <li key={item.userId} className="rounded-2xl border border-border p-4">
                  <a href={item.photoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={item.photoUrl}
                      alt={`Student ID of ${item.fullName}`}
                      onError={() => handlePhotoError(item.userId)}
                      className="h-48 w-full rounded-xl border border-border bg-secondary/30 object-contain"
                    />
                  </a>
                  <p className="mt-3 text-sm font-semibold text-foreground">{item.fullName}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    ID no. {item.studentId}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Submitted {new Date(item.updatedAt).toLocaleString()}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyUserId === item.userId}
                      onClick={() => handleReview(item.userId, "APPROVE")}
                    >
                      <Check className="mr-1.5 h-4 w-4" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyUserId === item.userId}
                      onClick={() => handleReview(item.userId, "REJECT")}
                    >
                      <X className="mr-1.5 h-4 w-4" /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
