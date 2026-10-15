import { useCallback, useEffect, useState } from "react";
import { getMyVendorReviewSummary, type VendorReviewSummary } from "@/features/auth/api";
import { formatRating, StarDisplay } from "@/features/reviews/star-rating";

/** Vendor dashboard panel: average rating, star distribution, last-30-days figure and the latest reviews. */
export function VendorRatingPanel() {
  const [data, setData] = useState<VendorReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getMyVendorReviewSummary()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load reviews."));
  }, []);

  useEffect(load, [load]);

  return (
    <section id="vendor-ratings-section" className="mt-10">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Feedback</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">Ratings & Reviews</h2>

      <div className="mt-4 rounded-2xl border border-card-border/80 bg-card/90 p-5 shadow-sm">
        {error ? (
          <div className="text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button type="button" onClick={load} className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-secondary">Try again</button>
          </div>
        ) : !data ? (
          <p className="text-center text-sm text-muted-foreground">Loading ratings...</p>
        ) : data.summary.totalReviews === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No reviews yet. Students can review an order after confirming pickup.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[220px_1fr]">
            <div>
              <p className="text-4xl font-bold tracking-tight text-foreground">{formatRating(data.summary.averageRating)}</p>
              <StarDisplay value={data.summary.averageRating ?? 0} className="h-5 w-5" />
              <p className="mt-1 text-xs text-muted-foreground">
                {data.summary.totalReviews} ratings · last 30 days: {formatRating(data.last30Days.averageRating)} ({data.last30Days.totalReviews})
              </p>
              <div className="mt-3 space-y-1">
                {(["5", "4", "3", "2", "1"] as const).map((star) => (
                  <div key={star} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="w-3">{star}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${(data.summary.distribution[star] / data.summary.totalReviews) * 100}%` }} />
                    </div>
                    <span className="w-6 text-right">{data.summary.distribution[star]}</span>
                  </div>
                ))}
              </div>
            </div>
            <ul className="space-y-3">
              {data.recentReviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-border/80 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <StarDisplay value={review.rating} className="h-3.5 w-3.5" />
                    <span className="text-[11px] text-muted-foreground">
                      #{review.orderReference} · {review.reviewer.displayName} · {new Date(review.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {review.comment && <p className="mt-1.5 text-sm text-foreground/90">{review.comment}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
