import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Lock } from "lucide-react";
import {
  cancelPreorder,
  getPreorderView,
  reschedulePreorder,
  type PreorderView,
} from "@/features/auth/api";
import { PickupTimePicker } from "@/features/orders/pickup-time-picker";
import { formatSlotLabel } from "@/features/orders/preorder-format";

type Mode = "idle" | "reschedule" | "confirm-cancel";

/** Pre-order details with reschedule / cancel before the cutoff, and an explanation once changes are closed. */
export function PreorderManage({ orderId, status, onChanged }: { orderId: string; status: string; onChanged: () => void }) {
  const [view, setView] = useState<PreorderView | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [selected, setSelected] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getPreorderView(orderId).then(setView).catch(() => setView(null));
  }, [orderId]);

  // Reload when the order's status moves (paid, released, cancelled).
  useEffect(load, [load, status]);

  if (!view || !view.scheduledPickupAt) return null;
  const isTerminal = status === "COMPLETED" || status === "CANCELLED" || status === "UNCOLLECTED";

  const run = async (action: () => Promise<unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await action();
      setMode("idle");
      setSelected(null);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const canChange = view.canReschedule || view.canCancel;

  return (
    <div className="mt-3 rounded-xl border border-border/80 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <CalendarClock className="h-3.5 w-3.5 text-primary" /> Pre-order details
      </p>
      <p className="mt-1 text-muted-foreground">Pickup: {formatSlotLabel(view.scheduledPickupAt)}</p>
      {view.changeCutoffAt && !isTerminal && (
        <p className="text-muted-foreground">Changes close: {formatSlotLabel(view.changeCutoffAt)}</p>
      )}

      {!isTerminal && canChange && mode === "idle" && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!view.canReschedule}
            onClick={() => setMode("reschedule")}
            className="rounded-full border border-border py-1.5 font-semibold hover:bg-secondary disabled:opacity-50"
          >
            Reschedule
          </button>
          <button
            type="button"
            disabled={!view.canCancel}
            onClick={() => setMode("confirm-cancel")}
            className="rounded-full border border-destructive/40 py-1.5 font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {!isTerminal && !canChange && (
        <p className="mt-2 flex gap-1.5 text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          <span>Changes closed: your pre-order is already with the vendor, or its cutoff has passed. Contact the vendor if you need help.</span>
        </p>
      )}

      {mode === "reschedule" && (
        <div className="mt-2 space-y-2">
          <PickupTimePicker windows={view.rescheduleWindows} value={selected} onChange={setSelected} disabled={isBusy} compact />
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={isBusy} onClick={() => setMode("idle")} className="rounded-full border border-border py-1.5 font-semibold hover:bg-secondary disabled:opacity-60">
              Back
            </button>
            <button
              type="button"
              disabled={!selected || isBusy}
              onClick={() => run(() => reschedulePreorder(orderId, selected!))}
              className="rounded-full bg-primary py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isBusy ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {mode === "confirm-cancel" && (
        <div className="mt-2 space-y-1.5">
          <p className="text-muted-foreground">Cancel this pre-order?{view.refundOnCancel ? " Your payment will be refunded." : ""}</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={isBusy} onClick={() => setMode("idle")} className="rounded-full border border-border py-1.5 font-semibold hover:bg-secondary disabled:opacity-60">
              Keep it
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => run(() => cancelPreorder(orderId))}
              className="rounded-full bg-destructive py-1.5 font-semibold text-destructive-foreground disabled:opacity-60"
            >
              {isBusy ? "Cancelling..." : "Yes, cancel"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
