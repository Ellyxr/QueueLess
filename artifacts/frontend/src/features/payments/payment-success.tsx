import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { getOrderPaymentStatus, type OrderPaymentStatusResponse } from "@/features/auth/api";

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
  const startedAt = useRef(Date.now());

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

        <Button className="mt-6 w-full rounded-full" onClick={() => (window.location.href = "/")}>
          Continue browsing
        </Button>
      </section>
    </main>
  );
}
