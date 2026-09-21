import { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PasabuyPaymentStatusBadge, PasabuyStatusBadge } from "./pasabuy-status-badge";
import { PasabuyDevControls } from "./pasabuy-dev-controls";
import { PasabuyDisputeDialog } from "./pasabuy-dispute-dialog";
import { PasabuyPaymentDialog } from "./pasabuy-payment-dialog";
import {
  cancelByDeliverer,
  cancelByRequester,
  confirmReceipt,
  getCurrentUserId,
  getRequest,
  markDelivered,
  markPickedUp,
  subscribeToPasabuyChanges,
  type PasabuyRequestRecord,
} from "./pasabuy-mock-store";

function useCountdown(target: string | null): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      setLabel(null);
      return;
    }
    const tick = () => {
      const msLeft = new Date(target).getTime() - Date.now();
      if (msLeft <= 0) {
        setLabel("Expiring...");
        return;
      }
      const totalSeconds = Math.ceil(msLeft / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setLabel(`${minutes}:${String(seconds).padStart(2, "0")}`);
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  return label;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

export function PasabuyFlowPanel({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<PasabuyRequestRecord | null>(() => getRequest(requestId));
  const [isDisputeOpen, setIsDisputeOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expiresLabel = useCountdown(request?.status === "OPEN" ? request.expiresAt : null);
  const paymentDeadlineLabel = useCountdown(
    request?.status === "AWAITING_PAYMENT" ? request.paymentDeadline : null,
  );
  const currentUserId = getCurrentUserId();

  useEffect(() => {
    setRequest(getRequest(requestId));
    return subscribeToPasabuyChanges(() => setRequest(getRequest(requestId)));
  }, [requestId]);

  if (!request) {
    return (
      <Card className="border-border/80 bg-card/90">
        <CardContent className="p-6 text-sm text-muted-foreground">Pasabuy request not found.</CardContent>
      </Card>
    );
  }

  const isRequester = currentUserId === request.requesterUserId;
  const isDeliverer = currentUserId !== null && currentUserId === request.delivererUserId;
  const canDispute = ["AWAITING_PAYMENT", "PAID", "PICKUP_READY", "PICKED_UP", "DELIVERED"].includes(request.status);

  const run = (action: () => PasabuyRequestRecord) => {
    setError(null);
    try {
      setRequest(action());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Pasabuy #{request.reference}
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{request.order.items}</p>
            <p className="text-xs text-muted-foreground">{request.order.vendorName}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PasabuyStatusBadge status={request.status} />
            {request.status === "OPEN" && expiresLabel && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock3 className="h-3 w-3" /> Expires in {expiresLabel}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3">
          <Row label="Pickup" value={request.order.pickupLocation} />
          <Row label="Delivery" value={request.deliveryLocation} />
          <Row label="Requester" value={request.requesterName} />
          <Row label="Deliverer" value={request.delivererName || "Unassigned"} />
        </div>

        <div className="space-y-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pasabuy payment
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Delivery fee</span>
            <span className="text-sm font-semibold text-foreground">₱{request.fee}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Payment status</span>
            <PasabuyPaymentStatusBadge status={request.paymentStatus} />
          </div>
          {request.status === "AWAITING_PAYMENT" && paymentDeadlineLabel && (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock3 className="h-3 w-3" /> Payment deadline {paymentDeadlineLabel}
            </p>
          )}
        </div>

        {isDeliverer && ["PICKUP_READY", "PICKED_UP"].includes(request.status) && (
          <div className="rounded-2xl border border-border/80 bg-secondary/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Pickup code
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tracking-[0.1em] text-foreground">
              {request.pickupCode}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">Show this code to the vendor.</p>
          </div>
        )}

        {isDeliverer && request.status === "AWAITING_PAYMENT" && (
          <p className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-orange-800">
            You've accepted this Pasabuy. The requester must complete payment before the delivery
            can proceed.
          </p>
        )}

        {isRequester && request.status === "OPEN" && (
          <p className="text-xs text-muted-foreground">
            You haven't been charged for Pasabuy — you'll only pay if a student accepts your
            request.
          </p>
        )}

        {request.status === "EXPIRED" && isRequester && (
          <p className="rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground">
            No student accepted your Pasabuy request. Your food order remains unchanged — Pasabuy
            charged ₱0.
          </p>
        )}

        {request.status === "CANCELLED" && request.paymentStatus === "PAYMENT_EXPIRED" && (
          <p className="rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground">
            Your Pasabuy payment wasn't completed in time. The deliverer's assignment has ended —
            no Pasabuy fee was charged.
          </p>
        )}

        {request.status === "DISPUTED" && request.disputeReason && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Reported: {request.disputeReason}
          </p>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {isRequester && request.status === "AWAITING_PAYMENT" && (
            <Button className="rounded-full" onClick={() => setIsPaymentOpen(true)}>
              Pay ₱{request.fee}
            </Button>
          )}
          {isDeliverer && request.status === "PICKUP_READY" && (
            <Button className="rounded-full" onClick={() => run(() => markPickedUp(request.id))}>
              I've Picked Up the Order
            </Button>
          )}
          {isDeliverer && request.status === "PICKED_UP" && (
            <Button className="rounded-full" onClick={() => run(() => markDelivered(request.id))}>
              I've Delivered the Order
            </Button>
          )}
          {isRequester && request.status === "DELIVERED" && (
            <Button className="rounded-full" onClick={() => run(() => confirmReceipt(request.id))}>
              Confirm Receipt
            </Button>
          )}

          {isRequester && ["OPEN", "ACCEPTED", "AWAITING_PAYMENT", "PAID"].includes(request.status) && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (window.confirm("Are you sure you want to cancel this Pasabuy request?")) {
                  run(() => cancelByRequester(request.id));
                }
              }}
            >
              Cancel Pasabuy
            </Button>
          )}

          {isDeliverer && ["ACCEPTED", "AWAITING_PAYMENT"].includes(request.status) && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                if (window.confirm("Are you sure you want to stop delivering this Pasabuy?")) {
                  run(() => cancelByDeliverer(request.id));
                }
              }}
            >
              Cancel Delivery
            </Button>
          )}

          {(isRequester || isDeliverer) && canDispute && (
            <Button variant="ghost" className="rounded-full" onClick={() => setIsDisputeOpen(true)}>
              Report a Problem
            </Button>
          )}
        </div>

        {(isRequester || isDeliverer) && (
          <PasabuyDevControls request={request} onAdvanced={setRequest} />
        )}

        {request.status === "DELIVERED" && isRequester && (
          <p className="text-sm font-medium text-foreground">Your Pasabuy is here!</p>
        )}
      </CardContent>

      <PasabuyDisputeDialog
        open={isDisputeOpen}
        onOpenChange={setIsDisputeOpen}
        request={request}
        onReported={setRequest}
      />

      <PasabuyPaymentDialog
        open={isPaymentOpen}
        onOpenChange={setIsPaymentOpen}
        request={request}
        onResolved={setRequest}
      />
    </Card>
  );
}
