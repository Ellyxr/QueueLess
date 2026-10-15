import { useState } from "react";
import { CalendarClock, Lock } from "lucide-react";
import {
  cancelPreorder,
  getVendorPreorderSlots,
  reschedulePreorder,
  type OrderStatusResponse,
  type VendorPreorderSlots,
} from "@/features/auth/api";
import {
  formatSlotLabel,
  formatSlotTime,
  groupSlotsByDay,
} from "@/features/orders/preorder-format";

type Mode = "idle" | "reschedule" | "confirm-cancel";

/**
 * Pre-order details with reschedule / cancel actions while the order is still
 * before its cutoff, and an explanation once changes are closed.
 */
export function PreorderManage({
  order,
  onChanged,
}: {
  order: OrderStatusResponse;
  onChanged: (order: OrderStatusResponse) => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [slots, setSlots] = useState<VendorPreorderSlots | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!order.isPreorder || !order.pickupAt) return null;
  const isTerminal = order.status === "COMPLETED" || order.status === "CANCELLED";

  const openReschedule = async () => {
    setMode("reschedule");
    setError(null);
    setSelectedSlot(null);
    try {
      setSlots(await getVendorPreorderSlots(order.vendor.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pickup times.");
    }
  };

  const run = async (action: () => Promise<OrderStatusResponse>) => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      onChanged(await action());
      setMode("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const days = groupSlotsByDay((slots?.slots ?? []).filter((slot) => slot !== order.pickupAt));
  const activeDay = days.find((day) => day.day === selectedDay) ?? days[0];

  return (
    <div className="mt-3 rounded-xl border border-border/80 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-foreground">
        <CalendarClock className="h-3.5 w-3.5 text-primary" /> Pre-order details
      </p>
      <p className="mt-1 text-muted-foreground">Pickup: {formatSlotLabel(order.pickupAt)}</p>

      {!isTerminal && order.canModifyPreorder && mode === "idle" && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={openReschedule}
            className="rounded-full border border-border py-1.5 font-semibold hover:bg-secondary"
          >
            Reschedule
          </button>
          <button
            type="button"
            onClick={() => setMode("confirm-cancel")}
            className="rounded-full border border-destructive/40 py-1.5 font-semibold text-destructive hover:bg-destructive/10"
          >
            Cancel
          </button>
        </div>
      )}

      {!isTerminal && !order.canModifyPreorder && order.preorderLockedReason && (
        <p className="mt-2 flex gap-1.5 text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{order.preorderLockedReason}</span>
        </p>
      )}

      {mode === "reschedule" && (
        <div className="mt-2 space-y-2">
          {!slots && !error && <p className="text-muted-foreground">Loading pickup times...</p>}
          {slots && days.length === 0 && (
            <p className="text-muted-foreground">No other pickup times are open right now.</p>
          )}
          {days.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1">
                {days.map((day) => (
                  <button
                    key={day.day}
                    type="button"
                    onClick={() => {
                      setSelectedDay(day.day);
                      setSelectedSlot(null);
                    }}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      activeDay?.day === day.day ? "border-primary bg-primary/10 text-primary" : "border-border"
                    }`}
                  >
                    {day.day}
                  </button>
                ))}
              </div>
              <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto">
                {activeDay?.slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`rounded-lg border px-1.5 py-1 text-[11px] font-medium ${
                      selectedSlot === slot ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    }`}
                  >
                    {formatSlotTime(slot)}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setMode("idle")}
              className="rounded-full border border-border py-1.5 font-semibold hover:bg-secondary disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!selectedSlot || isBusy}
              onClick={() => run(() => reschedulePreorder(order.orderId, selectedSlot!))}
              className="rounded-full bg-primary py-1.5 font-semibold text-primary-foreground disabled:opacity-60"
            >
              {isBusy ? "Saving..." : "Confirm"}
            </button>
          </div>
        </div>
      )}

      {mode === "confirm-cancel" && (
        <div className="mt-2 space-y-1.5">
          <p className="text-muted-foreground">
            Cancel this pre-order?{order.status === "SCHEDULED" ? " Your payment will be refunded." : ""}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setMode("idle")}
              className="rounded-full border border-border py-1.5 font-semibold hover:bg-secondary disabled:opacity-60"
            >
              Keep it
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => run(() => cancelPreorder(order.orderId))}
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
