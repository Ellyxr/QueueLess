// US-064: shared by the vendor reviews list and the storefront.

// US-066: every public listing and rating aggregate uses this, so a review an
// admin hid never shows up or counts anywhere.
export const VISIBLE_REVIEW = { hiddenAt: null } as const;

export interface RatingSummary {
  averageRating: number | null;
  totalReviews: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

/**
 * Builds the rating summary from `orderReview.groupBy({ by: ['rating'] })`.
 * The average is exact (from the per-star counts) and rounded to 1 decimal;
 * null when there are no reviews.
 */
export function summarizeRatings(groups: { rating: number; _count: { _all: number } }[]): RatingSummary {
  const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  let total = 0;
  let sum = 0;
  for (const group of groups) {
    const key = String(group.rating) as keyof typeof distribution;
    if (!(key in distribution)) continue;
    distribution[key] += group._count._all;
    total += group._count._all;
    sum += group.rating * group._count._all;
  }
  return {
    averageRating: total ? Math.round((sum / total) * 10) / 10 : null,
    totalReviews: total,
    distribution,
  };
}

/** Public reviewer label: first name and last initial ("Juan D."). */
export function reviewerDisplayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Student';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}
