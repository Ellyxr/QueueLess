import { useEffect, useState } from "react";
import {
  createReport,
  getVendorReviews,
  type VendorReviewsPage,
} from "@/features/auth/api";
import { formatRating, StarDisplay } from "@/features/reviews/star-rating";

const PAGE_SIZE = 5;

/** Reviews tab content for a vendor storefront. */
export function StoreReviews({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorReviewsPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [reportingReviewId, setReportingReviewId] = useState<string | null>(null);
  const [reportCategory, setReportCategory] = useState("INAPPROPRIATE_CONTENT");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const handleReportReview = async (reviewId: string) => {
    if (reportDescription.trim().length < 3) {
      setReportError("Please provide a description of at least 3 characters.");
      return;
    }

    setReportSubmitting(true);
    setReportError(null);
    setReportMessage(null);

    try {
      await createReport({
        targetType: "REVIEW",
        targetId: reviewId,
        category: reportCategory,
        description: reportDescription.trim(),
      });

      setReportMessage("Review reported successfully. Thank you for letting us know.");
      setReportingReviewId(null);
      setReportDescription("");
      setReportCategory("INAPPROPRIATE_CONTENT");
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : "Could not submit the report.",
      );
    } finally {
      setReportSubmitting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getVendorReviews(vendorId, page, PAGE_SIZE)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load reviews.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, page, reloadKey]);

  if (error) {
    return (
      <div className="my-12 rounded-[24px] border border-destructive/30 bg-card/50 p-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="mt-4 rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">
          Try again
        </button>
      </div>
    );
  }

  if (!data) return <div className="my-12 text-center text-sm text-muted-foreground">Loading reviews...</div>;

  if (data.summary.totalReviews === 0) {
    return (
      <div className="my-12 rounded-[24px] border border-border/80 bg-card/50 py-16 text-center">
        <p className="text-lg font-medium text-foreground">No reviews yet</p>
        <p className="mt-2 text-sm text-muted-foreground">Be the first to share your experience after your order.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-8">
       {reportMessage && (
        <p
          role="status"
          className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground"
        >
          {reportMessage}
        </p>
       )}
      <div className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card/60 p-5">
        <p className="text-4xl font-bold tracking-tight text-foreground">{formatRating(data.summary.averageRating)}</p>
        <div>
          <StarDisplay value={data.summary.averageRating ?? 0} className="h-5 w-5" />
          <p className="mt-1 text-xs text-muted-foreground">{data.summary.totalReviews} rating{data.summary.totalReviews === 1 ? "" : "s"}</p>
        </div>
      </div>

      <ul className={`space-y-3 transition-opacity ${isLoading ? "opacity-50" : ""}`}>
       {data.items.map((review) => (
          <li key={review.id} className="rounded-2xl border border-border/80 bg-card/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">{review.reviewer.displayName}</p>
              <p className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="mt-1"><StarDisplay value={review.rating} /></div>
            {review.comment && <p className="mt-2 text-sm text-foreground/90">{review.comment}</p>}
            <div className="mt-3 border-t border-border/60 pt-3">
              {reportingReviewId !== review.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setReportingReviewId(review.id);
                    setReportCategory("INAPPROPRIATE_CONTENT");
                    setReportDescription("");
                    setReportError(null);
                    setReportMessage(null);
                  }}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Report review
                </button>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleReportReview(review.id);
                  }}
                  className="space-y-3"
                >
                  <div>
                    <label
                      htmlFor={`report-category-${review.id}`}
                      className="mb-1 block text-xs font-semibold text-foreground"
                    >
                      Reason for reporting
                    </label>
                    <select
                      id={`report-category-${review.id}`}
                      value={reportCategory}
                      onChange={(event) => setReportCategory(event.target.value)}
                      disabled={reportSubmitting}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    >
                      <option value="INAPPROPRIATE_CONTENT">Inappropriate content</option>
                      <option value="HARASSMENT">Harassment or abusive language</option>
                      <option value="SPAM">Spam or misleading content</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor={`report-description-${review.id}`}
                      className="mb-1 block text-xs font-semibold text-foreground"
                    >
                      Additional details
                    </label>
                    <textarea
                      id={`report-description-${review.id}`}
                      value={reportDescription}
                      onChange={(event) => setReportDescription(event.target.value)}
                      disabled={reportSubmitting}
                      maxLength={2000}
                      rows={3}
                      placeholder="Explain why this review should be reported..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      required
                    />
                  </div>

                  {reportError && (
                    <p role="alert" className="text-xs text-destructive">
                      {reportError}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={reportSubmitting || reportDescription.trim().length < 3}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      {reportSubmitting ? "Submitting..." : "Submit report"}
                    </button>
                    <button
                      type="button"
                      disabled={reportSubmitting}
                      onClick={() => {
                        setReportingReviewId(null);
                        setReportDescription("");
                        setReportError(null);
                      }}
                      className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-secondary disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </li>
        ))}
      </ul>

      {data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((c) => c - 1)} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
            Previous
          </button>
          <span className="text-xs text-muted-foreground">Page {data.page} of {data.totalPages}</span>
          <button type="button" disabled={page >= data.totalPages || isLoading} onClick={() => setPage((c) => c + 1)} className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
