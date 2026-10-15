import { useState } from "react";
import { Star } from "lucide-react";
import { submitOrderReview } from "@/features/auth/api";

const MAX_COMMENT = 500;

/** Post-pickup review form: star rating (required) and optional comment. Parent hides it once `onSubmitted` fires. */
export function ReviewPrompt({ orderId, onSubmitted }: { orderId: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (isSubmitting) return;
    if (rating < 1) {
      setError("Please choose a star rating.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await submitOrderReview(orderId, { rating, comment: comment.trim() || undefined });
      setDone(true);
      window.setTimeout(onSubmitted, 1800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not submit your review.";
      // Already reviewed (e.g. from another device): treat as done.
      if (/already reviewed/i.test(message)) onSubmitted();
      else setError(message);
      setIsSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-3 text-center text-xs font-medium text-emerald-600">
        Thanks for your review!
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border/80 p-3">
      <p className="text-center text-xs font-semibold text-foreground">How was your order?</p>
      <div className="mt-2 flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={isSubmitting}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => {
              setRating(n);
              setError(null);
            }}
          >
            <Star
              className={`h-6 w-6 transition-colors ${
                n <= (hover || rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        maxLength={MAX_COMMENT}
        disabled={isSubmitting}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Add a comment (optional)"
        rows={2}
        className="mt-2 w-full resize-none rounded-lg border border-border bg-background p-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <p className="text-right text-[10px] text-muted-foreground">
        {comment.length}/{MAX_COMMENT}
      </p>
      {error && <p className="mt-1 text-center text-[11px] text-destructive">{error}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting}
        className="mt-2 w-full rounded-full bg-primary py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isSubmitting ? "Submitting..." : "Submit review"}
      </button>
    </div>
  );
}
