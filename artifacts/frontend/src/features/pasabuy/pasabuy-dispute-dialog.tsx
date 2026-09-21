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
import { reportProblem, type PasabuyRequestRecord } from "./pasabuy-mock-store";

const REASONS = [
  "Order was not delivered",
  "Wrong order",
  "Missing item",
  "Other issue",
];

export function PasabuyDisputeDialog({
  open,
  onOpenChange,
  request,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PasabuyRequestRecord;
  onReported?: (request: PasabuyRequestRecord) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setReason(null);
    setSubmitted(false);
    setError(null);
  };

  const handleSubmit = () => {
    if (!reason) return;
    setError(null);
    try {
      const updated = reportProblem(request.id, reason);
      setSubmitted(true);
      onReported?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report this problem.");
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
              <DialogDescription>What happened with Pasabuy #{request.reference}?</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              {REASONS.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition-colors",
                    reason === option ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <input
                    type="radio"
                    name="pasabuy-dispute-reason"
                    value={option}
                    checked={reason === option}
                    onChange={() => setReason(option)}
                    className="mt-0.5"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <DialogFooter>
              <Button onClick={handleSubmit} disabled={!reason} className="rounded-full">
                Submit
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
