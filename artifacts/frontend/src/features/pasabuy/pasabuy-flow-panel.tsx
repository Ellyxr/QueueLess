import { useCallback, useEffect, useState } from "react";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PasabuyPaymentStatusBadge, PasabuyStatusBadge } from "./pasabuy-status-badge";
import { PasabuyDisputeDialog } from "./pasabuy-dispute-dialog";
import { PasabuyPaymentDialog } from "./pasabuy-payment-dialog";
import {
  cancelRequest,
  confirmReceipt,
  getCurrentUserId,
  getRequest,
  markDelivered,
  markPickedUp,
  PASABUY_POLL_INTERVAL_MS,
  type PasabuyRequestDetail,
} from "./pasabuy-api";

const CANCELLABLE_STATUSES = new Set(["PENDING", "AWAITING_PAYMENT", "PAID"]);
const DISPUTABLE_STATUSES = new Set(["PAID", "PICKUP_READY", "PICKED_UP", "DELIVERED", "COMPLETED"]);

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

/**
 * Live request detail view. There's no websocket/socket.io client anywhere
 * else in this frontend (checked), so this polls `GET /pasabuy/requests/:id`
 * on an interval — same pattern as `order-status-widget.tsx`. The server
 * also runs its own 30s expiry sweeps, so the client never needs its own TTL
 * logic beyond reflecting whatever status comes back.
 */
export function PasabuyFlowPanel({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<PasabuyRequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDisputeOpen, setIsDisputeOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const currentUserId = getCurrentUserId();

  const refresh = useCallback(async () => {
    try {
      const data = await getRequest(requestId);
      setRequest(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this Pasabuy request.");
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    refresh();
    const timer = window.setInterval(() => {
      if (!cancelled) refresh();
    }, PASABUY_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [refresh]);

  const expiresLabel = useCountdown(request?.status === "PENDING" ? request.expiresAt : null);
  const paymentDeadlineLabel = useCountdown(
    request?.status === "AWAITING_PAYMENT" ? request.paymentDeadline : null,
  );

  if (isLoading) {
    return (
      <Card className="border-border/80 bg-card/90">
        <CardContent className="p-6 text-sm text-muted-foreground">Loading Pasabuy request...</CardContent>
      </Card>
    );
  }

  if (!request) {
    return (
      <Card className="border-border/80 bg-card/90">
        <CardContent className="p-6 text-sm text-muted-foreground">
          {loadError || "Pasabuy request not found."}
        </CardContent>
      </Card>
    );
  }

  const isRequester = currentUserId === request.requesterUserId;
  const isDeliverer = currentUserId !== null && currentUserId === request.fulfillerUserId;
  const canDispute = (isRequester || isDeliverer) && DISPUTABLE_STATUSES.has(request.status);
  const canCancel = (isRequester || isDeliverer) && CANCELLABLE_STATUSES.has(request.status);
  const lastHistoryNote = [...request.statusHistory].reverse().find((h) => h.status === request.status)?.note;

  const run = async (action: () => Promise<unknown>) => {
    if (isActing) return;
    setIsActing(true);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsActing(false);
    }
  };

  const handleCancel = () => {
    const reason = window.prompt("Why are you cancelling this Pasabuy request?");
    if (!reason || !reason.trim()) return;
    run(() => cancelRequest(request.id, reason.trim()));
  };

  return (
    <Card className="border-border/80 bg-card/90 shadow-sm">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Pasabuy #{request.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">{request.itemDescription}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <PasabuyStatusBadge status={request.status} />
            {request.status === "PENDING" && expiresLabel && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock3 className="h-3 w-3" /> Expires in {expiresLabel}
              </span>
            )}
          </div>
        </div>

        <div className="grid gap-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3">
          <Row label="Pickup" value={request.pickupLocation} />
          <Row label="Delivery" value={request.dropoffLocation} />
        </div>

        <div className="space-y-1.5 rounded-2xl border border-border/80 bg-secondary/30 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Pasabuy payment
          </p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Delivery fee</span>
            <span className="text-sm font-semibold text-foreground">₱{request.convenienceFee}</span>
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

        {isDeliverer && request.pickupCode && (
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

        {isRequester && request.status === "PENDING" && (
          <p className="text-xs text-muted-foreground">
            You haven't been charged for Pasabuy — you'll only pay if a student accepts your
            request.
          </p>
        )}

        {(request.status === "EXPIRED" || request.status === "PAYMENT_EXPIRED") && (
          <p className="rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground">
            {request.status === "EXPIRED"
              ? "No student accepted your Pasabuy request. Your food order remains unchanged — Pasabuy charged ₱0."
              : "Your Pasabuy payment wasn't completed in time. The deliverer's assignment has ended."}
          </p>
        )}

        {request.status === "CANCELLED" && (
          <p className="rounded-2xl border border-border/80 bg-secondary/30 p-3 text-xs text-muted-foreground">
            {lastHistoryNote || "This Pasabuy request was cancelled."}
            {request.paymentStatus === "PAID" && " A refund has been requested for the fee already paid."}
          </p>
        )}

        {request.status === "DISPUTED" && (
          <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            Reported: {lastHistoryNote || "A problem was reported with this Pasabuy request."}
          </p>
        )}

        {actionError && <p className="text-xs text-destructive">{actionError}</p>}

        <div className="flex flex-wrap gap-2">
          {isRequester && request.status === "AWAITING_PAYMENT" && (
            <Button className="rounded-full" onClick={() => setIsPaymentOpen(true)}>
              Pay ₱{request.convenienceFee}
            </Button>
          )}
          {isDeliverer && request.status === "PICKUP_READY" && (
            <Button className="rounded-full" disabled={isActing} onClick={() => run(() => markPickedUp(request.id))}>
              I've Picked Up the Order
            </Button>
          )}
          {isDeliverer && request.status === "PICKED_UP" && (
            <Button className="rounded-full" disabled={isActing} onClick={() => run(() => markDelivered(request.id))}>
              I've Delivered the Order
            </Button>
          )}
          {isRequester && request.status === "DELIVERED" && (
            <Button className="rounded-full" disabled={isActing} onClick={() => run(() => confirmReceipt(request.id))}>
              Confirm Receipt
            </Button>
          )}

          {canCancel && (
            <Button variant="outline" className="rounded-full" disabled={isActing} onClick={handleCancel}>
              Cancel Pasabuy
            </Button>
          )}

          {canDispute && (
            <Button variant="ghost" className="rounded-full" onClick={() => setIsDisputeOpen(true)}>
              Report a Problem
            </Button>
          )}
        </div>

        {request.status === "DELIVERED" && isRequester && (
          <p className="text-sm font-medium text-foreground">Your Pasabuy is here!</p>
        )}
      </CardContent>

      <PasabuyDisputeDialog
        open={isDisputeOpen}
        onOpenChange={setIsDisputeOpen}
        request={request}
        onReported={() => refresh()}
      />

      <PasabuyPaymentDialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen} request={request} />
    </Card>
  );
}
