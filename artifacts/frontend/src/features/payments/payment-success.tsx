import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { getOrderPaymentStatus, type OrderPaymentStatusResponse } from "@/features/auth/api";
import { getCartItems, saveCartItems } from "@/features/cart/cart";
import {
  createOrderForVendorItems,
  getCheckoutQueue,
  setCheckoutQueue,
  type CheckoutQueueState,
} from "@/features/cart/checkout";
import { canTrackNewOrder, MAX_TRACKED_ORDERS } from "@/features/orders/order-tracking";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 20000;

const currency = (amount: string) => `₱${Number(amount).toLocaleString("en-PH")}`;

function getOrderIdFromQuery(): string | null {
  return new URLSearchParams(window.location.search).get("orderId");
}

export default function PaymentSuccessPage() {
  const [orderId] = useState(getOrderIdFromQuery);
  const [status, setStatus] = useState<OrderPaymentStatusResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const hasAdvancedRef = useRef(false);

  useEffect(() => {
    if (!orderId) {
      setError("Missing order reference.");
      return;
    }

    let cancelled = false;

    const poll = () => {
      getOrderPaymentStatus(orderId)
        .then((result) => {
          if (cancelled) return;
          setStatus(result);
          if (result.payment?.status === "SUCCEEDED") {
            window.clearInterval(timer);
            return;
          }
          if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
            setTimedOut(true);
            window.clearInterval(timer);
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "Unable to confirm payment status.");
          window.clearInterval(timer);
        });
    };

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [orderId]);

  const confirmed = status?.payment?.status === "SUCCEEDED";

  const advanceQueue = async (queue: CheckoutQueueState) => {
    const [nextVendorId, ...restVendorIds] = queue.vendorIds;
    const cartItems = getCartItems();
    const nextItems = cartItems.filter((item) => (item.vendorId || "unknown") === nextVendorId);

    if (nextItems.length === 0) {
      // Nothing left for this vendor (e.g. removed from cart elsewhere) — skip it.
      if (restVendorIds.length > 0) {
        await advanceQueue({ ...queue, vendorIds: restVendorIds });
      } else {
        setCheckoutQueue(null);
        setIsAdvancing(false);
      }
      return;
    }

    if (!canTrackNewOrder()) {
      setAdvanceError(
        `You've reached the ${MAX_TRACKED_ORDERS}-order tracking limit. The rest of your cart is saved — check out again once an order completes.`,
      );
      setIsAdvancing(false);
      return;
    }

    try {
      const productItems = nextItems.map((item) => ({ productId: item.id, quantity: item.quantity }));
      const { checkoutUrl } = await createOrderForVendorItems(productItems, queue.isPasabuyRequest);

      const remainingCartItems = cartItems.filter(
        (item) => (item.vendorId || "unknown") !== nextVendorId,
      );
      saveCartItems(remainingCartItems);
      setCheckoutQueue(restVendorIds.length > 0 ? { ...queue, vendorIds: restVendorIds } : null);
      window.location.href = checkoutUrl;
    } catch (err) {
      setAdvanceError(err instanceof Error ? err.message : "Could not start the next order.");
      setIsAdvancing(false);
    }
  };

  useEffect(() => {
    if (!confirmed || hasAdvancedRef.current) return;
    const queue = getCheckoutQueue();
    if (!queue || queue.vendorIds.length === 0) return;

    hasAdvancedRef.current = true;
    setIsAdvancing(true);
    void advanceQueue(queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmed]);

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-lg flex-col justify-center px-4 py-10">
      <section className="rounded-[28px] border border-border/80 bg-card p-6 text-center shadow-md sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Payment
          </p>
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> PayMongo Sandbox
          </Badge>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-foreground">Something went wrong</p>
            <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
          </div>
        ) : confirmed ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-foreground">Payment successful</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {status?.totalAmount ? `${currency(status.totalAmount)} paid. ` : ""}
              Your order has been marked as paid — the vendor can now start preparing it.
            </p>
            {isAdvancing && !advanceError && (
              <div className="mt-2 flex flex-col items-center gap-2">
                <Spinner className="h-5 w-5 text-primary" />
                <p className="text-xs text-muted-foreground">
                  Starting your next order from another store...
                </p>
              </div>
            )}
            {advanceError && (
              <p className="mt-2 max-w-xs text-xs text-destructive">{advanceError}</p>
            )}
          </div>
        ) : timedOut ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-foreground">Still confirming your payment</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              PayMongo hasn't notified us yet. This can take a little longer — check your order
              status shortly; it will update automatically once confirmed.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-6">
            <Spinner className="h-8 w-8 text-primary" />
            <p className="font-semibold text-foreground">Confirming your payment…</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Waiting for PayMongo to notify QueueLess. This usually takes a few seconds.
            </p>
          </div>
        )}

        {!isAdvancing && (
          <Button className="mt-6 w-full rounded-full" onClick={() => (window.location.href = "/")}>
            Continue browsing
          </Button>
        )}
      </section>
    </main>
  );
}
