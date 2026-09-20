import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Crown, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  finalizeGroupOrder,
  getGroupOrder,
  lockGroupOrder,
  pingGroupOrder,
  setGroupOrderPaymentSplit,
  type GroupOrderResponse,
} from "@/features/auth/api";
import { startOrderTracking } from "@/features/orders/order-tracking";
import {
  clearGroupOrderSession,
  setGroupOrderSession,
  GROUP_ORDER_SESSION_CHANGED_EVENT,
  type GroupOrderSession,
} from "@/features/group-orders/group-order-session";

const POLL_INTERVAL_MS = 3000;
const currency = (amount: string | number) =>
  `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

type SplitMode = "EQUAL" | "CUSTOM";
type Stage = "building" | "confirming-split" | "placed";

export function GroupOrderCartView({ session }: { session: GroupOrderSession }) {
  const [groupOrder, setGroupOrder] = useState<GroupOrderResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isPinging, setIsPinging] = useState(false);
  const [pingSent, setPingSent] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("EQUAL");
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<Stage>("building");
  const hasTrackedFinalOrder = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      getGroupOrder(session.groupOrderId)
        .then((data) => {
          if (cancelled) return;
          setGroupOrder(data);
          setLoadError(null);

          if (data.vendor && data.vendor.id !== session.vendorId) {
            setGroupOrderSession({
              ...session,
              vendorId: data.vendor.id,
              vendorName: data.vendor.name,
            });
          }

          if (data.authoritativeOrder && !hasTrackedFinalOrder.current) {
            hasTrackedFinalOrder.current = true;
            startOrderTracking(data.authoritativeOrder.id);
            setStage("placed");
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setLoadError(error instanceof Error ? error.message : "Could not load group order.");
        });
    };

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    window.addEventListener(GROUP_ORDER_SESSION_CHANGED_EVENT, poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(GROUP_ORDER_SESSION_CHANGED_EVENT, poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.groupOrderId]);

  const joinedParticipants = useMemo(
    () => groupOrder?.participants.filter((p) => p.status === "JOINED") ?? [],
    [groupOrder],
  );

  const groupTotal = useMemo(
    () => joinedParticipants.reduce((sum, p) => sum + Number(p.subtotal), 0),
    [joinedParticipants],
  );

  const hasAnyItems = joinedParticipants.some((p) => p.items.length > 0);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(session.code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  const handlePing = async () => {
    if (isPinging) return;
    setIsPinging(true);
    setActionError(null);
    try {
      await pingGroupOrder(session.groupOrderId);
      setPingSent(true);
      window.setTimeout(() => setPingSent(false), 4000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not ping the owner.");
    } finally {
      setIsPinging(false);
    }
  };

  const handlePlaceOrder = async () => {
    if (isPlacing || !groupOrder) return;
    setActionError(null);
    setIsPlacing(true);
    try {
      await lockGroupOrder(session.groupOrderId);
      const result = await finalizeGroupOrder(session.groupOrderId);

      if (splitMode === "EQUAL") {
        await setGroupOrderPaymentSplit(session.groupOrderId, { mode: "EQUAL" });
        startOrderTracking(result.authoritativeOrder.id);
        hasTrackedFinalOrder.current = true;
        clearGroupOrderSession();
        setStage("placed");
      } else {
        const equalShare = (
          Number(result.authoritativeOrder.totalAmount) / joinedParticipants.length
        ).toFixed(2);
        setCustomAmounts(
          Object.fromEntries(joinedParticipants.map((p) => [p.participantId, equalShare])),
        );
        setStage("confirming-split");
      }

      const refreshed = await getGroupOrder(session.groupOrderId);
      setGroupOrder(refreshed);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not place the group order.");
    } finally {
      setIsPlacing(false);
    }
  };

  const customTotal = Object.values(customAmounts).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const finalTotal = Number(groupOrder?.authoritativeOrder?.totalAmount ?? 0);
  const customTotalMatches = Math.abs(customTotal - finalTotal) < 0.005;

  const handleConfirmCustomSplit = async () => {
    if (!groupOrder || isPlacing) return;
    setActionError(null);
    setIsPlacing(true);
    try {
      const result = await setGroupOrderPaymentSplit(session.groupOrderId, {
        mode: "CUSTOM",
        customShares: Object.entries(customAmounts).map(([participantId, amount]) => ({
          participantId,
          amount: Number(amount),
        })),
      });
      if (groupOrder.authoritativeOrder) {
        startOrderTracking(groupOrder.authoritativeOrder.id);
      }
      hasTrackedFinalOrder.current = true;
      clearGroupOrderSession();
      setStage("placed");
      void result;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save the payment split.");
    } finally {
      setIsPlacing(false);
    }
  };

  if (loadError && !groupOrder) {
    return (
      <main className="mx-auto flex min-h-[50dvh] w-full max-w-2xl items-center justify-center px-4 py-12 text-center text-sm text-muted-foreground">
        {loadError}
      </main>
    );
  }

  if (!groupOrder) {
    return (
      <main className="mx-auto flex min-h-[50dvh] w-full max-w-2xl items-center justify-center px-4 py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
            Group order
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] text-foreground">
            {groupOrder.vendor ? groupOrder.vendor.name : "Choose a vendor to begin"}
          </h1>
        </div>
        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold"
        >
          {codeCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          Code: {groupOrder.code}
        </button>
      </div>

      {!groupOrder.vendor && (
        <div className="mb-6 rounded-2xl border border-dashed border-border bg-card/70 p-5 text-sm text-muted-foreground">
          Browse shops and add an item — the first product added sets this group order's vendor.
        </div>
      )}

      {stage === "placed" ? (
        <section className="rounded-3xl border border-emerald-500/30 bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-xl font-semibold">Group order placed</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Check the order status widget for live updates.
          </p>
        </section>
      ) : stage === "confirming-split" && groupOrder.authoritativeOrder ? (
        <section className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Set each person's amount</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Total order amount: {currency(groupOrder.authoritativeOrder.totalAmount)}
          </p>
          <div className="mt-4 space-y-3">
            {joinedParticipants.map((participant) => (
              <div key={participant.participantId} className="flex items-center justify-between gap-3">
                <span className="text-sm">{participant.user.fullName}</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-muted-foreground">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={customAmounts[participant.participantId] ?? ""}
                    onChange={(event) =>
                      setCustomAmounts((current) => ({
                        ...current,
                        [participant.participantId]: event.target.value,
                      }))
                    }
                    className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Entered total</span>
            <span className={customTotalMatches ? "text-emerald-600" : "text-destructive"}>
              {currency(customTotal)} / {currency(finalTotal)}
            </span>
          </div>
          {actionError && <p className="mt-2 text-xs text-destructive">{actionError}</p>}
          <Button
            className="mt-4 w-full rounded-full"
            disabled={!customTotalMatches || isPlacing}
            onClick={handleConfirmCustomSplit}
          >
            {isPlacing ? "Saving..." : "Confirm split"}
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold">
                <Users className="h-4 w-4" /> Members ({groupOrder.participantCount})
              </h2>
              <span className="text-sm font-semibold">{currency(groupTotal)}</span>
            </div>
            <div className="divide-y divide-border/70">
              {joinedParticipants.map((participant) => (
                <div key={participant.participantId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-sm font-semibold">
                      {participant.isOwner && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                      {participant.user.fullName}
                    </span>
                    <span className="text-sm text-muted-foreground">{currency(participant.subtotal)}</span>
                  </div>
                  {participant.items.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {participant.items.map((item) => (
                        <li key={item.id} className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {item.name} x{item.quantity}
                          </span>
                          <span>{currency(item.subtotal)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">No items yet</p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {session.isOwner ? (
            <section className="mt-4 rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
              <h2 className="font-semibold">Payment split</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSplitMode("EQUAL")}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${
                    splitMode === "EQUAL"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background"
                  }`}
                >
                  Equal split
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("CUSTOM")}
                  className={`rounded-full px-3 py-2 text-sm font-semibold ${
                    splitMode === "CUSTOM"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background"
                  }`}
                >
                  Custom amounts
                </button>
              </div>
              {actionError && <p className="mt-3 text-xs text-destructive">{actionError}</p>}
              <Button
                className="mt-4 w-full rounded-full"
                disabled={isPlacing || !hasAnyItems || !groupOrder.vendor}
                onClick={handlePlaceOrder}
              >
                {isPlacing ? "Placing..." : "Place Group Order"}
              </Button>
            </section>
          ) : (
            <section className="mt-4 rounded-3xl border border-border/80 bg-card p-5 text-center shadow-sm">
              <p className="text-sm text-muted-foreground">
                Waiting for {groupOrder.initiator.fullName} to place the group order.
              </p>
              {actionError && <p className="mt-2 text-xs text-destructive">{actionError}</p>}
              <Button
                variant="outline"
                className="mt-3 rounded-full"
                disabled={isPinging}
                onClick={handlePing}
              >
                {pingSent ? "Owner notified" : isPinging ? "Pinging..." : "Ping owner"}
              </Button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
