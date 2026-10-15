import { Weekday } from '@prisma/client';

export const PREORDER_SLOT_MINUTES = 15;
export const PREORDER_MAX_DAYS_AHEAD = 7;
// Asia/Manila has no DST, so a fixed UTC+8 offset is exact.
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

const WEEKDAY_BY_UTC_DAY: Array<Weekday | null> = [
  null, // Sunday: vendors never operate
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

export interface PreorderDay {
  dayOfWeek: Weekday;
  isEnabled: boolean;
  openTime: string | null;
  closeTime: string | null;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map((part) => Number.parseInt(part, 10));
  return h * 60 + m;
}

/**
 * Lists bookable pickup times (UTC instants) for the next
 * PREORDER_MAX_DAYS_AHEAD days. A slot must start no earlier than
 * `now + minLeadTimeMinutes` and end within the day's open window.
 */
export function generatePreorderSlots(
  days: PreorderDay[],
  minLeadTimeMinutes: number,
  now: Date = new Date(),
): Date[] {
  const byDay = new Map(days.map((day) => [day.dayOfWeek, day]));
  const earliest = now.getTime() + minLeadTimeMinutes * 60_000;
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const slots: Date[] = [];

  for (let offset = 0; offset <= PREORDER_MAX_DAYS_AHEAD; offset += 1) {
    const dayStartManila = Date.UTC(
      manilaNow.getUTCFullYear(),
      manilaNow.getUTCMonth(),
      manilaNow.getUTCDate() + offset,
    );
    const weekday = WEEKDAY_BY_UTC_DAY[new Date(dayStartManila).getUTCDay()];
    const day = weekday ? byDay.get(weekday) : undefined;
    if (!day?.isEnabled || !day.openTime || !day.closeTime) continue;

    const open = toMinutes(day.openTime);
    const close = toMinutes(day.closeTime);

    for (let minute = open; minute + PREORDER_SLOT_MINUTES <= close; minute += PREORDER_SLOT_MINUTES) {
      const instant = dayStartManila + minute * 60_000 - MANILA_OFFSET_MS;
      if (instant < earliest) continue;
      if (instant > now.getTime() + PREORDER_MAX_DAYS_AHEAD * 24 * 60 * 60_000) continue;
      slots.push(new Date(instant));
    }
  }

  return slots;
}

export function isBookablePreorderSlot(
  days: PreorderDay[],
  minLeadTimeMinutes: number,
  pickupAt: Date,
  now: Date = new Date(),
): boolean {
  return generatePreorderSlots(days, minLeadTimeMinutes, now).some(
    (slot) => slot.getTime() === pickupAt.getTime(),
  );
}
