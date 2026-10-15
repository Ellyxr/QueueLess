import { Star } from "lucide-react";

/** Read-only row of stars (supports fractional fill by rounding to the nearest whole star). */
export function StarDisplay({ value, className = "h-4 w-4" }: { value: number; className?: string }) {
  const filled = Math.round(value);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${n <= filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}

export function formatRating(value: number | null | undefined): string {
  return value === null || value === undefined ? "New" : value.toFixed(1);
}
