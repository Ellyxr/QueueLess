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
import { acceptRequest, type PasabuyRequestRecord } from "./pasabuy-mock-store";

export function PasabuyAcceptDialog({
  open,
  onOpenChange,
  request,
  onAccepted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PasabuyRequestRecord;
  onAccepted?: (request: PasabuyRequestRecord) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const updated = acceptRequest(request.id);
      onAccepted?.(updated);
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
          <Row label="Order reference" value={request.reference} />
          <Row label="Food/items" value={request.order.items} />
          <Row label="Vendor" value={request.order.vendorName} />
          <Row label="Pickup location" value={request.order.pickupLocation} />
          <Row label="Delivery location" value={request.deliveryLocation} />
          <Row label="Requester" value={request.requesterName} />
          <Row label="Pasabuy fee" value={`₱${request.fee}`} />
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
