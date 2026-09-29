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
import { acceptRequest, type PasabuyAvailableRequest } from "./pasabuy-api";
import { trackPasabuyRequest } from "./pasabuy-tracking";

export function PasabuyAcceptDialog({
  open,
  onOpenChange,
  request,
  onAccepted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PasabuyAvailableRequest;
  onAccepted?: (requestId: string) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = await acceptRequest(request.id);
      trackPasabuyRequest(updated.id);
      onAccepted?.(updated.id);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not accept this request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept this Pasabuy?</DialogTitle>
          <DialogDescription>
            You'll pick up the order from the vendor and deliver it to the requester.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-2xl border border-border/80 bg-secondary/30 p-3 text-sm">
          <Row label="Order reference" value={request.id.slice(0, 8).toUpperCase()} />
          <Row label="Food/items" value={request.itemDescription} />
          <Row label="Vendor" value={request.relatedOrder.vendor.businessName || "Vendor"} />
          <Row label="Pickup location" value={request.pickupLocation} />
          <Row label="Pasabuy fee" value={`₱${request.convenienceFee}`} />
        </div>

        <p className="text-xs text-muted-foreground">
          The requester will be asked to pay the Pasabuy fee now. Delivery only proceeds once
          that payment succeeds.
        </p>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter>
          <Button onClick={handleAccept} disabled={isSubmitting} className="rounded-full">
            {isSubmitting ? "Accepting..." : "Accept Pasabuy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}
