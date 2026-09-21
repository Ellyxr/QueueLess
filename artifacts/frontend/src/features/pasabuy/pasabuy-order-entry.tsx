import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PasabuyRequestDialog } from "./pasabuy-request-dialog";
import { PasabuyPaymentStatusBadge } from "./pasabuy-status-badge";
import {
  getActiveRequestForOrder,
  subscribeToPasabuyChanges,
  type PasabuyOrderInfo,
  type PasabuyRequestRecord,
} from "./pasabuy-mock-store";

const NOT_ELIGIBLE_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

/**
 * "Request Pasabuy" entry point for an order. Reused wherever an order shows
 * its status (order tracking widget, order history). `isPreorder` has no real
 * data source yet — `Order` has no preorder flag today (see
 * artifacts/api-server/AddressMe.md) — so callers that can't determine it
 * should simply omit the prop rather than guessing.
 */
export function PasabuyOrderEntry({
  order,
  orderStatus,
  isPreorder = false,
  fullWidth = false,
}: {
  order: PasabuyOrderInfo;
  orderStatus: string;
  isPreorder?: boolean;
  fullWidth?: boolean;
}) {
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<PasabuyRequestRecord | null>(
    () => getActiveRequestForOrder(order.orderId),
  );

  useEffect(() => {
    const refresh = () => setActiveRequest(getActiveRequestForOrder(order.orderId));
    refresh();
    return subscribeToPasabuyChanges(refresh);
  }, [order.orderId]);

  if (NOT_ELIGIBLE_STATUSES.has(orderStatus)) return null;

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

