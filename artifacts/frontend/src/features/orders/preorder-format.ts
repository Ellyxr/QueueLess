const MANILA_TZ = "Asia/Manila";
const STEP_MINUTES = 15;
/** Client-side hint only: the server enforces the real lead time (the larger of its floor and the slowest item's prep time). */
export const LEAD_TIME_HINT_MINUTES = 30;

export function formatSlotDay(iso: string, now: Date = new Date()): string {
  const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(d);
  const slot = new Date(iso);
  if (dayKey(slot) === dayKey(now)) return "Today";
  if (dayKey(slot) === dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, weekday: "short", month: "short", day: "numeric" }).format(slot);
}

export function formatSlotTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "Today, 11:15 AM" */
export function formatSlotLabel(iso: string, now: Date = new Date()): string {
  return `${formatSlotDay(iso, now)}, ${formatSlotTime(iso)}`;
}

/** "mm:ss" until a deadline, or null once it has passed. */
export function formatCountdown(deadlineIso: string, now: number): string | null {
  const remaining = new Date(deadlineIso).getTime() - now;
  if (remaining <= 0) return null;
  const total = Math.ceil(remaining / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/**
 * 15-minute pickup times inside a vendor pickup window (close time exclusive),
 * no earlier than now + the lead-time hint.
 */
export function pickupTimesInWindow(
  window: { opensAt: string; closesAt: string },
  now: Date = new Date(),
): string[] {
  const step = STEP_MINUTES * 60_000;
  const earliest = Math.max(new Date(window.opensAt).getTime(), now.getTime() + LEAD_TIME_HINT_MINUTES * 60_000);
  const end = new Date(window.closesAt).getTime();
  const times: string[] = [];
  // Manila has no DST and its offset is whole hours, so 15-minute marks line up with UTC ones.
  for (let t = Math.ceil(earliest / step) * step; t < end; t += step) times.push(new Date(t).toISOString());
  return times;
}
