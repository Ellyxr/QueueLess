import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createFeeCheckout, type PasabuyRequestDetail } from "./pasabuy-api";

/**
 * Real fee-only PayMongo checkout. There is no synchronous "pay now" action
 * anymore — this creates/reuses a checkout session and redirects the browser
 * to `checkoutUrl`. The actual PAID transition happens asynchronously via
 * PayMongo's webhook; the flow panel's polling picks up the new status once
 * the student returns from checkout (mirrors how `order-status-widget.tsx`
 * redirects for `createPaymentCheckout`).
 */
export function PasabuyPaymentDialog({
  open,
  onOpenChange,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PasabuyRequestDetail;
}) {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (isRedirecting) return;
    setIsRedirecting(true);
    setError(null);
    try {
      const checkout = await createFeeCheckout(request.id);
      if (checkout.status === "SUCCEEDED") {
        // A webhook already confirmed payment before this call landed.
        onOpenChange(false);
        return;
      }
      if (!checkout.checkoutUrl) {
        throw new Error("Could not start checkout.");
      }
      window.location.href = checkout.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setIsRedirecting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isRedirecting) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay Pasabuy fee</DialogTitle>
          <DialogDescription>
            Your food order is already paid. This only charges the Pasabuy delivery fee via
            PayMongo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Pasabuy fee</span>
            <span className="text-sm font-semibold text-foreground">₱{request.convenienceFee}</span>
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}

        <DialogFooter>
          <Button className="rounded-full" disabled={isRedirecting} onClick={handlePay}>
            {isRedirecting ? "Redirecting to checkout..." : `Pay ₱${request.convenienceFee}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
