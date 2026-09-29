import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reportProblem, type PasabuyRequestDetail } from "./pasabuy-api";

const QUICK_REASONS = [
  "Order was not delivered",
  "Wrong order",
  "Missing item",
  "Other issue",
];

/** Calls the real `POST /pasabuy/requests/:id/report` endpoint — it takes a free-text `description`, not a reason enum. The quick-pick buttons just seed the text field. */
export function PasabuyDisputeDialog({
  open,
  onOpenChange,
  request,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PasabuyRequestDetail;
  onReported?: () => void;
}) {
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDescription("");
    setIsSubmitting(false);
    setSubmitted(false);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!description.trim() || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await reportProblem(request.id, description.trim());
      setSubmitted(true);
      onReported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report this problem.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent>
        {!submitted ? (
          <>
            <DialogHeader>
              <DialogTitle>Report a problem</DialogTitle>
              <DialogDescription>
                What happened with Pasabuy #{request.id.slice(0, 8).toUpperCase()}?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {QUICK_REASONS.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors",
                    description === option ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="pasabuy-dispute-reason"
                    value={option}
                    checked={description === option}
                    onChange={() => setDescription(option)}
                    className="mt-0.5"
                  />
                  <span>{option}</span>
                </label>
              ))}
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={2000}
                placeholder="Describe what happened..."
                rows={3}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={!description.trim() || isSubmitting} className="rounded-full">
                {isSubmitting ? "Submitting..." : "Submit"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Problem reported</DialogTitle>
              <DialogDescription>
                Our team will review this Pasabuy request. We'll follow the existing refund/dispute
                process for anything that needs it.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  reset();
                }}
                className="rounded-full"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
