import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { getVendorPreorderSlots, type VendorPreorderSlots } from "@/features/auth/api";
import {
  formatSlotLabel,
  formatSlotTime,
  groupSlotsByDay,
} from "@/features/orders/preorder-format";

export type OrderTiming = "NOW" | "PREORDER";

interface PreorderPickerProps {
  vendorId: string | undefined;
  /** Pre-orders are pickup-only, so they can't be combined with Pasabuy delivery. */
  deliverySelected: boolean;
  /** Pre-orders are placed with a single vendor at a time. */
  multiVendor: boolean;
  timing: OrderTiming;
  pickupAt: string | null;
  onTimingChange: (timing: OrderTiming) => void;
  onPickupAtChange: (pickupAt: string | null) => void;
  disabled?: boolean;
}

/** "Order now" vs "Pre-order for pickup" choice with a pickup date/time slot picker. */
export function PreorderPicker({
  vendorId,
  deliverySelected,
  multiVendor,
  timing,
  pickupAt,
  onTimingChange,
  onPickupAtChange,
  disabled = false,
}: PreorderPickerProps) {
  const [info, setInfo] = useState<VendorPreorderSlots | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    if (!vendorId || multiVendor) {
      setInfo(null);
      return;
    }
    let cancelled = false;
    setLoadFailed(false);
    getVendorPreorderSlots(vendorId)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch(() => {
        if (!cancelled) {
          setInfo(null);
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, multiVendor]);

  const days = useMemo(() => groupSlotsByDay(info?.slots ?? []), [info]);
  const activeDay = days.find((day) => day.day === selectedDay) ?? days[0];

  // Drop a picked slot that is no longer offered (e.g. after a refresh).
  useEffect(() => {
    if (pickupAt && info && !info.slots.includes(pickupAt)) onPickupAtChange(null);
  }, [info, pickupAt, onPickupAtChange]);

  // Hide entirely for vendors that don't take pre-orders.
  if (!multiVendor && !loadFailed && info && !info.preorderEnabled) return null;
  if (!vendorId && !multiVendor) return null;

  let unavailableReason: string | null = null;
  if (multiVendor) unavailableReason = "Pre-orders are available when ordering from one store at a time.";
  else if (deliverySelected) unavailableReason = "Pre-orders are pickup only — turn off Pasabuy to schedule one.";
  else if (loadFailed) unavailableReason = "Couldn't load pre-order times. Try again shortly.";
  else if (info && info.slots.length === 0)
    unavailableReason = "This store has no pre-order times open right now.";
  const canPreorder = !unavailableReason && Boolean(info);

  return (
    <div className="rounded-[20px] border border-border bg-card p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="h-4 w-4 text-primary" /> When do you want it?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onTimingChange("NOW");
            onPickupAtChange(null);
          }}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
            timing === "NOW" ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
          }`}
        >
          Order now
        </button>
        <button
          type="button"
          disabled={disabled || !canPreorder}
          onClick={() => onTimingChange("PREORDER")}
          className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            timing === "PREORDER" ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
          }`}
        >
          Pre-order for pickup
        </button>
      </div>

      {unavailableReason ? (
        <p className="mt-3 text-xs text-muted-foreground">{unavailableReason}</p>
      ) : timing === "PREORDER" && info ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {days.map((day) => (
              <button
                key={day.day}
                type="button"
                disabled={disabled}
                onClick={() => {
                  setSelectedDay(day.day);
                  onPickupAtChange(null);
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activeDay?.day === day.day ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
                }`}
              >
                {day.day}
              </button>
            ))}
          </div>
          <div className="grid max-h-40 grid-cols-3 gap-1.5 overflow-y-auto pr-1">
            {activeDay?.slots.map((slot) => (
              <button
                key={slot}
                type="button"
                disabled={disabled}
                onClick={() => onPickupAtChange(slot)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
                  pickupAt === slot ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                }`}
              >
                {formatSlotTime(slot)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {pickupAt
              ? `Pickup ${formatSlotLabel(pickupAt)}. You'll pay now to reserve this slot.`
              : "Pick a pickup time. You'll pay now to reserve it."}
          </p>
        </div>
      ) : info?.nextAvailableAt ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Next pre-order pickup: {formatSlotLabel(info.nextAvailableAt)}
        </p>
      ) : null}
    </div>
  );
}
