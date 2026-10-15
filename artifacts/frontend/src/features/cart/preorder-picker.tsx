import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { getVendorStorefront, type VendorStorefront } from "@/features/auth/api";
import { PickupTimePicker } from "@/features/orders/pickup-time-picker";
import { formatSlotLabel } from "@/features/orders/preorder-format";

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

/** "Order now" vs "Pre-order for pickup", with the vendor's pickup windows and times. */
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
  const [vendor, setVendor] = useState<VendorStorefront | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!vendorId || multiVendor) {
      setVendor(null);
      return;
    }
    let cancelled = false;
    setLoadFailed(false);
    getVendorStorefront(vendorId)
      .then((result) => {
        if (!cancelled) setVendor(result);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [vendorId, multiVendor]);

  const preorder = vendor?.preorder;
  // Hide entirely for vendors that don't take pre-orders.
  if (!multiVendor && vendor && !preorder?.enabled) return null;
  if (!vendorId && !multiVendor) return null;

  let unavailableReason: string | null = null;
  if (multiVendor) unavailableReason = "Pre-orders are available when ordering from one store at a time.";
  else if (deliverySelected) unavailableReason = "Pre-orders are pickup only — turn off Pasabuy to schedule one.";
  else if (loadFailed) unavailableReason = "Couldn't load pre-order times. Try again shortly.";
  else if (preorder && !preorder.acceptingPreorders) unavailableReason = "This store has no pre-order pickup times set.";
  const canPreorder = !unavailableReason && Boolean(preorder);

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
      ) : timing === "PREORDER" && preorder ? (
        <div className="mt-3 space-y-3">
          <PickupTimePicker windows={preorder.nextPickupWindows} value={pickupAt} onChange={onPickupAtChange} disabled={disabled} />
          <p className="text-xs text-muted-foreground">
            {pickupAt
              ? `Pickup ${formatSlotLabel(pickupAt)}. You'll pay now to reserve this time; unpaid reservations are released.`
              : "Pick a pickup time. You'll pay now to reserve it."}
          </p>
        </div>
      ) : preorder?.nextPickupLabel ? (
        <p className="mt-3 text-xs text-muted-foreground">Next pre-order pickup: {preorder.nextPickupLabel}</p>
      ) : null}
    </div>
  );
}
