import { useState } from "react";
import { ArrowLeft, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createPaymentCheckout, getOrderPaymentStatus } from "@/features/auth/api";

function getOrderIdFromQuery(): string | null {
  return new URLSearchParams(window.location.search).get("orderId");
}

export default function PaymentCancelPage() {
  const [orderId] = useState(getOrderIdFromQuery);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retryPayment = async () => {
    if (!orderId || isRetrying) return;
    setIsRetrying(true);
    setError(null);
    try {
      const status = await getOrderPaymentStatus(orderId);
      const checkout = await createPaymentCheckout(status.paymentShare.id);
      window.location.href = checkout.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restart payment.");
      setIsRetrying(false);
    }
  };

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

        <div className="flex flex-col items-center gap-3 py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
            <XCircle className="h-7 w-7" />
          </div>
          <p className="text-lg font-bold text-foreground">Payment cancelled</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            Your order was placed but hasn't been paid yet, so the vendor hasn't started
            preparing it. You can try paying again anytime.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {orderId && (
            <Button className="w-full rounded-full" disabled={isRetrying} onClick={retryPayment}>
              {isRetrying ? "Redirecting to PayMongo..." : "Retry payment"}
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full gap-2 rounded-full"
            onClick={() => (window.location.href = "/")}
          >
            <ArrowLeft className="h-4 w-4" /> Continue browsing
          </Button>
        </div>
      </section>
    </main>
  );
}
