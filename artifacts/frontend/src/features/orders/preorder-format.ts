const MANILA_TZ = "Asia/Manila";

/** Day heading for a slot, e.g. "Today", "Tomorrow", "Fri, Oct 16". */
export function formatSlotDay(iso: string, now: Date = new Date()): string {
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: MANILA_TZ }).format(d);
  const slot = new Date(iso);
  if (dayKey(slot) === dayKey(now)) return "Today";
  if (dayKey(slot) === dayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return "Tomorrow";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(slot);
}

export function formatSlotTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Today, 11:15 AM" */
export function formatSlotLabel(iso: string, now: Date = new Date()): string {
  return `${formatSlotDay(iso, now)}, ${formatSlotTime(iso)}`;
}

/** Groups slot instants by their Manila calendar day label, preserving order. */
export function groupSlotsByDay(slots: string[], now: Date = new Date()): Array<{ day: string; slots: string[] }> {
  const groups: Array<{ day: string; slots: string[] }> = [];
  for (const slot of slots) {
    const day = formatSlotDay(slot, now);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.slots.push(slot);
    else groups.push({ day, slots: [slot] });
  }
  return groups;
}

/** "mm:ss" until a deadline, or null once it has passed. */
export function formatCountdown(deadlineIso: string, now: number): string | null {
  const remaining = new Date(deadlineIso).getTime() - now;
  if (remaining <= 0) return null;
  const total = Math.ceil(remaining / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
