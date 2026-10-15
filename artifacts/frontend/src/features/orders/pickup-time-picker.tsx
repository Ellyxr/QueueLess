import { useState } from "react";
import type { PreorderWindowInstance } from "@/features/auth/api";
import { formatSlotTime, pickupTimesInWindow } from "@/features/orders/preorder-format";

/** Pick one of a vendor's upcoming pickup windows, then a 15-minute pickup time inside it. */
export function PickupTimePicker({
  windows,
  value,
  onChange,
  disabled = false,
  compact = false,
}: {
  windows: PreorderWindowInstance[];
  value: string | null;
  onChange: (iso: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const withTimes = windows
    .map((window) => ({ window, times: pickupTimesInWindow(window) }))
    .filter((entry) => entry.times.length > 0);
  const active = withTimes.find((entry) => entry.window.opensAt === windowKey) ?? withTimes[0];

  if (!active) {
    return <p className="text-xs text-muted-foreground">No pickup times are open right now.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {withTimes.map(({ window }) => (
          <button
            key={window.opensAt}
            type="button"
            disabled={disabled}
            onClick={() => {
              setWindowKey(window.opensAt);
              onChange(null);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              active.window.opensAt === window.opensAt ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
            }`}
          >
            {window.label}
          </button>
        ))}
      </div>
      <div className={`grid max-h-40 gap-1.5 overflow-y-auto pr-1 ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
        {active.times.map((time) => (
          <button
            key={time}
            type="button"
            disabled={disabled}
            onClick={() => onChange(time)}
            className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${
              value === time ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
            }`}
          >
            {formatSlotTime(time)}
          </button>
        ))}
      </div>
    </div>
  );
}
