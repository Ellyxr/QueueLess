import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CreditCard,
  Loader2,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { SavedPaymentMethod, SavedPaymentMethodType } from "@/features/payments/payment-method";

export type PaymentStatus = "idle" | "processing" | "succeeded" | "failed";

export interface PaymentResult {
  status: Exclude<PaymentStatus, "idle" | "processing">;
  method: SavedPaymentMethodType;
  referenceId: string;
}

interface PaymentStepProps {
  orderId: string;
  storeName: string;
  amount: number;
  savedMethod: SavedPaymentMethod;
  onDone: (result: PaymentResult) => void;
}

const currency = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;

// Last 4 digits of PayMongo Sandbox decline test cards
// (https://developers.paymongo.com/docs/testing) — used to make the
// simulated outcome deterministic for QA/demo purposes.
const DECLINE_TEST_LAST4 = new Set(["0075", "0037"]);

const METHOD_ICON: Record<SavedPaymentMethodType, typeof CreditCard> = {
  card: CreditCard,
  gcash: Smartphone,
  grab_pay: Wallet,
};

function generateReferenceId() {
  return `sandbox_${Math.random().toString(36).slice(2, 10)}`;
}

export function PaymentStep({ orderId, storeName, amount, savedMethod, onDone }: PaymentStepProps) {
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PaymentResult | null>(null);

  const MethodIcon = METHOD_ICON[savedMethod.type];

  const startPayment = () => {
    if (status === "processing") return;
    setStatus("processing");
    setFailureReason(null);

    const willDecline = savedMethod.type === "card" && !!savedMethod.last4 && DECLINE_TEST_LAST4.has(savedMethod.last4);

    window.setTimeout(() => {
      const result: PaymentResult = {
        status: willDecline ? "failed" : "succeeded",
        method: savedMethod.type,
        referenceId: generateReferenceId(),
      };
      setLastResult(result);
      if (willDecline) {
        setFailureReason("Your card was declined by the issuing bank.");
        setStatus("failed");
      } else {
        setStatus("succeeded");
      }
    }, 1600);
  };

  const retry = () => {
    setStatus("idle");
    setFailureReason(null);
    setLastResult(null);
  };

  return (
    <main className="mx-auto flex min-h-[70dvh] w-full max-w-lg flex-col justify-center px-4 py-10">
      <section className="rounded-[28px] border border-border/80 bg-card p-6 shadow-md sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Payment
          </p>
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> PayMongo Sandbox
          </Badge>
        </div>

        <h1 className="text-2xl font-bold tracking-[-0.05em] text-foreground">
          Pay for your order
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {storeName} • Order #{orderId.slice(0, 8)}
        </p>

        <div className="mt-6 flex items-center justify-between rounded-2xl bg-secondary/60 p-4">
          <span className="text-sm text-muted-foreground">Amount to pay</span>
          <span className="text-2xl font-bold tracking-[-0.04em]">{currency(amount)}</span>
        </div>

        {status === "idle" && (
          <>
            <div className="mt-5 flex items-center gap-3 rounded-2xl border border-border p-4">
              <MethodIcon className="h-5 w-5 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Paying with</p>
                <p className="truncate text-sm font-semibold text-foreground">{savedMethod.label}</p>
              </div>
              <a href="/profile" className="text-xs font-semibold text-primary hover:underline">
                Change
              </a>
            </div>

            <Button className="mt-6 w-full rounded-full" onClick={startPayment}>
              Pay {currency(amount)}
            </Button>
          </>
        )}

        {status === "processing" && (
          <div className="mt-10 flex flex-col items-center gap-3 py-6 text-center">
            <Spinner className="h-8 w-8 text-primary" />
            <p className="font-semibold text-foreground">Processing payment…</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Confirming your payment with PayMongo. This usually takes a few seconds.
            </p>
          </div>
        )}

        {status === "succeeded" && lastResult && (
          <div className="mt-10 flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-foreground">Payment successful</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Reference {lastResult.referenceId} • {currency(amount)} paid via {savedMethod.label}
            </p>
            <Button className="mt-4 w-full rounded-full" onClick={() => onDone(lastResult)}>
              Continue browsing
            </Button>
          </div>
        )}

        {status === "failed" && (
          <div className="mt-10 flex flex-col items-center gap-3 py-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-foreground">Payment failed</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {failureReason ?? "Something went wrong while processing your payment."}
            </p>
            <div className="mt-4 flex w-full gap-3">
              <Button variant="outline" className="w-full rounded-full" onClick={retry}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Try again
              </Button>
              <Button
                variant="secondary"
                className="w-full rounded-full"
                onClick={() =>
                  onDone(
                    lastResult ?? {
                      status: "failed",
                      method: savedMethod.type,
                      referenceId: generateReferenceId(),
                    },
                  )
                }
              >
                Continue browsing
              </Button>
            </div>
          </div>
        )}
      </section>

      {status === "processing" && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Do not close this page
        </p>
      )}
    </main>
  );
}
