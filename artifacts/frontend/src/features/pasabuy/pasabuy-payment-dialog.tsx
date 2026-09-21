import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  markPasabuyPaymentFailed,
  payPasabuyFee,
  type PasabuyRequestRecord,
} from "./pasabuy-mock-store";

/**
 * Simulated Pasabuy-fee-only checkout. There is no real endpoint for this yet —
 * `createPaymentCheckout` only charges an existing order `PaymentShare`, and the
 * food order has already been paid separately (see AddressMe.md). This dialog
 * only calls `payPasabuyFee` / `markPasabuyPaymentFailed` from the mock store,
 * so swapping in the real PayMongo flow later only touches those two functions.
 */
export function PasabuyPaymentDialog({
  open,
  onOpenChange,
  request,
  onResolved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PasabuyRequestRecord;
  onResolved?: (request: PasabuyRequestRecord) => void;
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [outcome, setOutcome] = useState<"success" | "failed" | null>(null);

  const reset = () => {
    setIsProcessing(false);
    setOutcome(null);
  };

  const runPayment = (succeed: boolean) => {
    setIsProcessing(true);
    window.setTimeout(() => {
      try {
        const updated = succeed ? payPasabuyFee(request.id) : markPasabuyPaymentFailed(request.id);
        setOutcome(succeed ? "success" : "failed");
        onResolved?.(updated);
      } catch {
        setOutcome("failed");
      } finally {
        setIsProcessing(false);
      }
    }, 700);
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
        {outcome === "success" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Pasabuy confirmed
              </DialogTitle>
              <DialogDescription>
                {request.delivererName} will pick up and deliver your order.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="rounded-full" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : outcome === "failed" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Payment unsuccessful
              </DialogTitle>
              <DialogDescription>
                Your Pasabuy payment wasn't completed. The deliverer has not been confirmed for
                delivery.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="rounded-full" onClick={() => setOutcome(null)}>
                Try Again
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pay Pasabuy fee</DialogTitle>
              <DialogDescription>
                Your food order is already paid. This only charges the Pasabuy delivery fee.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Deliverer</span>
                <span className="text-xs font-medium text-foreground">{request.delivererName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pasabuy fee</span>
                <span className="text-sm font-semibold text-foreground">₱{request.fee}</span>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Demo checkout — swap for the real PayMongo flow once a Pasabuy-fee-only payment
              endpoint exists.
            </p>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={isProcessing}
                onClick={() => runPayment(false)}
              >
                Simulate failure
              </Button>
              <Button className="rounded-full" disabled={isProcessing} onClick={() => runPayment(true)}>
                {isProcessing ? "Processing..." : `Pay ₱${request.fee}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
