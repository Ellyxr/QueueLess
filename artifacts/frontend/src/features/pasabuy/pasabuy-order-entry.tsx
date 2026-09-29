import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PasabuyRequestDialog } from "./pasabuy-request-dialog";
import { PasabuyPaymentStatusBadge } from "./pasabuy-status-badge";
import { getRequest, type PasabuyOrderInfo, type PasabuyRequestDetail } from "./pasabuy-api";
import { getTrackedRequestIdForOrder } from "./pasabuy-tracking";

const NOT_ELIGIBLE_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

/**
 * "Request Pasabuy" entry point for an order. Reused wherever an order shows
 * its status (order tracking widget, order history). `isPreorder` should now
 * be sourced from the real order data (`Order.isPreorder` — see
 * `CustomerOrder`/`OrderStatusResponse` in `@/features/auth/api`) by the
 * caller; this component just respects whatever it's given.
 *
 * There is no backend endpoint to look up "the Pasabuy request for order X"
 * from the buyer's side (only `orderId`'s own `isPasabuyRequest` flag says
 * one exists) — this uses the locally-tracked order→request mapping set when
 * the request was created on this device (see `pasabuy-tracking.ts`). If
 * that mapping is missing (e.g. a different device), it falls back to a
 * plain "Pasabuy requested" note without a deep link.
 */
export function PasabuyOrderEntry({
  order,
  orderStatus,
  isPasabuyRequest = false,
  isPreorder = false,
  fullWidth = false,
}: {
  order: PasabuyOrderInfo;
  orderStatus: string;
  isPasabuyRequest?: boolean;
  isPreorder?: boolean;
  fullWidth?: boolean;
}) {
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<PasabuyRequestDetail | null>(null);
  const trackedRequestId = getTrackedRequestIdForOrder(order.orderId);

  useEffect(() => {
    if (!isPasabuyRequest || !trackedRequestId) {
      setActiveRequest(null);
      return;
    }
    let cancelled = false;
    getRequest(trackedRequestId)
      .then((data) => {
        if (!cancelled) setActiveRequest(data);
      })
      .catch(() => {
        if (!cancelled) setActiveRequest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isPasabuyRequest, trackedRequestId]);

  if (NOT_ELIGIBLE_STATUSES.has(orderStatus)) return null;

  if (isPasabuyRequest) {
    if (activeRequest) {
      return (
        <div className={cn("flex items-center gap-2", fullWidth && "w-full flex-col items-stretch")}>
          <Button
            variant="outline"
            size="sm"
            className={cn("rounded-full", fullWidth && "w-full")}
            onClick={() => setLocation(`/pasabuy/${activeRequest.id}`)}
          >
            View Pasabuy Request
          </Button>
          <PasabuyPaymentStatusBadge status={activeRequest.paymentStatus} className={fullWidth ? "self-center" : undefined} />
        </div>
      );
    }
    return <p className="text-[11px] text-muted-foreground">Pasabuy requested for this order.</p>;
  }

  if (isPreorder) {
    return (
      <p className="text-[11px] text-muted-foreground">Pasabuy isn't available for preorders.</p>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={cn("rounded-full", fullWidth && "w-full")}
        onClick={() => setIsDialogOpen(true)}
      >
        Request Pasabuy
      </Button>
      <PasabuyRequestDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        order={order}
        onViewRequest={(id) => setLocation(`/pasabuy/${id}`)}
      />
    </>
  );
}
