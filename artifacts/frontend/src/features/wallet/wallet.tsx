import { useEffect, useRef, useState } from "react";
import { createPaymentCheckout, fetchWithAuth } from "@/features/auth/api";
import { Button } from "@/components/ui/button";

type Entry = {
  id: string;
  type: string;
  amount: string;
  balanceAfter: string;
  createdAt: string;
};
export default function WalletPage() {
  const [balance, setBalance] = useState("0.00");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [amount, setAmount] = useState("100.00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const topupKey = useRef({ amount: "", key: "" });
  const purchaseKey = useRef(crypto.randomUUID());
  const [purchase, setPurchase] = useState<{
    amount: string;
    status: string;
    orderStatus: string;
  } | null>(null);
  const userId = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") ?? "{}").id ?? "anonymous";
    } catch {
      return "anonymous";
    }
  })();
  const pendingKey = `queueless-wallet-purchase:${userId}`;
  const params = new URLSearchParams(window.location.search);
  const topupId = params.get("walletTopupId");
  const [pending] = useState(() => {
    if (params.get("paymentShareId"))
      return {
        shareId: params.get("paymentShareId"),
        orderId: params.get("orderId"),
      };
    try {
      return JSON.parse(sessionStorage.getItem(pendingKey) ?? "null") as {
        shareId: string;
        orderId: string;
      } | null;
    } catch {
      return null;
    }
  });
  const shareId = pending?.shareId;
  const orderId = pending?.orderId;
  useEffect(() => {
    if (pending) sessionStorage.setItem(pendingKey, JSON.stringify(pending));
  }, [pending, pendingKey]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [wallet, history] = await Promise.all([
          fetchWithAuth("/wallet") as Promise<{ balance: string }>,
          fetchWithAuth(`/wallet/entries?page=${page}`) as Promise<{
            items: Entry[];
            total: number;
          }>,
        ]);
        if (cancelled) return;
        setBalance(wallet.balance);
        setEntries(history.items);
        setTotal(history.total);
        setLoadError("");
        if (shareId) {
          const due = (await fetchWithAuth(`/wallet/purchases/${shareId}`)) as {
            amount: string;
            status: string;
            orderStatus: string;
          };
          if (!cancelled) {
            setPurchase(due);
            if (due.status === "PAID" || due.orderStatus !== "PENDING")
              sessionStorage.removeItem(pendingKey);
          }
        }
        if (topupId) {
          const topup = (await fetchWithAuth(`/wallet/topups/${topupId}`)) as {
            status: string;
          };
          if (!cancelled)
            setMessage(
              topup.status === "SUCCEEDED"
                ? "Cash-in confirmed. Your wallet balance has been updated."
                : "Cash-in is awaiting payment confirmation. Returning here does not add funds.",
            );
        }
      } catch (err) {
        if (!cancelled)
          setLoadError(
            err instanceof Error
              ? err.message
              : "Unable to load wallet. Please sign in.",
          );
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [page, topupId, shareId, pendingKey]);

  const cashIn = async () => {
    setBusy(true);
    setError("");
    try {
      if (topupKey.current.amount !== amount)
        topupKey.current = { amount, key: crypto.randomUUID() };
      const result = (await fetchWithAuth("/wallet/topups", {
        method: "POST",
        headers: { "Idempotency-Key": topupKey.current.key },
        body: JSON.stringify({ amount }),
      })) as { checkoutUrl: string };
      if (!result.checkoutUrl.startsWith("https://checkout.paymongo.com/"))
        throw new Error("Invalid cash-in checkout URL");
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cash-in failed");
      setBusy(false);
    }
  };
  const pay = async () => {
    setBusy(true);
    setError("");
    try {
      const result = (await fetchWithAuth("/wallet/pay", {
        method: "POST",
        headers: { "Idempotency-Key": purchaseKey.current },
        body: JSON.stringify({ paymentShareId: shareId }),
      })) as { orderId: string };
      sessionStorage.removeItem(pendingKey);
      window.location.href = `/payment/success?orderId=${encodeURIComponent(result.orderId)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet payment failed");
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-8 space-y-6">
      <a href="/profile" className="text-sm text-primary">
        Back to profile
      </a>
      <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
        <h1 className="text-2xl font-bold">QueueLess wallet</h1>
        <p className="text-sm text-muted-foreground">
          Sandbox demo — test funds only. Cash in using card, GCash, QR Ph, or
          another supported payment method.
        </p>
        <p className="text-4xl font-bold">₱{balance}</p>
        <label htmlFor="cash-in-amount" className="block font-medium">
          Cash-in amount (PHP)
        </label>
        <input
          id="cash-in-amount"
          type="number"
          min="20"
          max="10000"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-border bg-background p-3"
        />
        <Button disabled={busy || !amount} onClick={cashIn} className="w-full">
          {busy ? "Please wait…" : "Cash in"}
        </Button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {(error || loadError) && (
          <p role="alert" className="text-sm text-destructive">
            {error || loadError}
          </p>
        )}
      </section>
      {shareId &&
        purchase?.status === "PENDING" &&
        purchase.orderStatus === "PENDING" && (
          <section className="rounded-3xl border border-border p-6 space-y-3">
            <h2 className="font-bold">Complete your pending food purchase</h2>
            <p className="text-sm break-all">Order {orderId}</p>
            <p className="font-bold">Amount due: ₱{purchase.amount}</p>
            <Button disabled={busy} onClick={pay}>
              Pay ₱{purchase.amount} with wallet
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const checkout = await createPaymentCheckout(shareId);
                  window.location.href = checkout.checkoutUrl;
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Checkout failed",
                  );
                  setBusy(false);
                }
              }}
            >
              Use card / GCash / QR Ph instead
            </Button>
            <p className="text-sm text-muted-foreground">
              The server checks the amount due and balance before payment.
            </p>
          </section>
        )}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Wallet history</h2>
        {entries.length === 0 && <p>No wallet transactions yet.</p>}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl border border-border p-4 flex justify-between gap-3"
          >
            <div>
              <p className="font-semibold">{entry.type}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p>₱{entry.amount}</p>
              <p className="text-xs">Balance: ₱{entry.balanceAfter}</p>
            </div>
          </div>
        ))}
        <div className="flex justify-between">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>Page {page}</span>
          <Button
            disabled={page * 20 >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </section>
    </main>
  );
}
