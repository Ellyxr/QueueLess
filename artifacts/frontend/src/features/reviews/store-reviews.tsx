import { useEffect, useState } from "react";
import { getVendorReviews, type VendorReviewsPage } from "@/features/auth/api";
import { formatRating, StarDisplay } from "@/features/reviews/star-rating";

const PAGE_SIZE = 5;

/** Reviews tab content for a vendor storefront. */
export function StoreReviews({ vendorId }: { vendorId: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<VendorReviewsPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
