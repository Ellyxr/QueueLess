import { BadRequestException } from '@nestjs/common';
import { Weekday } from '@prisma/client';

// All schedule times are Asia/Manila wall-clock "HH:mm" (UTC+8, no DST),
// whatever timezone the server runs in.
export const MANILA_TZ = 'Asia/Manila';

// US-055: upper bound on preorder pickup windows per weekday.
export const MAX_WINDOWS_PER_DAY = 4;

// Full calendar week, Sunday first, matching Intl's weekday names. The
// Weekday enum has no SUNDAY value - vendors never operate that day - so it
// is represented here only as a lookup placeholder, never as a Prisma value.
type DayName = Weekday | 'SUNDAY';
const FULL_WEEK: DayName[] = [
  'SUNDAY',
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

export interface AvailabilityDay {
  dayOfWeek: Weekday;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface AvailabilityStatus {
  isOpenNow: boolean;
  nextAvailableLabel: string | null;
}

interface DayScheduleEntry {
  dayOfWeek: Weekday;
  isEnabled: boolean;
  openTime?: string;
  closeTime?: string;
}

function assertWindowTimes(day: DayScheduleEntry): void {
  if (!day.openTime || !day.closeTime) {
    throw new BadRequestException(
      `${day.dayOfWeek} is enabled but is missing an open or close time`,
    );
  }

  if (parseTimeToMinutes(day.openTime) >= parseTimeToMinutes(day.closeTime)) {
    throw new BadRequestException(
      `${day.dayOfWeek}'s close time must be after its open time`,
    );
  }
}

/**
 * Validates a weekday schedule payload: no day listed twice, and every
 * enabled day has an open/close time with close strictly after open.
 * Used for store hours (one window per day).
 */
export function validateDaySchedule(days: DayScheduleEntry[]): void {
  const seenDays = new Set<Weekday>();

  for (const day of days) {
    if (seenDays.has(day.dayOfWeek)) {
      throw new BadRequestException(`${day.dayOfWeek} was listed more than once`);
    }
    seenDays.add(day.dayOfWeek);

    if (day.isEnabled) assertWindowTimes(day);
  }
}

/**
 * US-055: validates preorder pickup windows. A weekday is either listed once
 * as disabled, or as one or more enabled windows (up to MAX_WINDOWS_PER_DAY)
 * where each closes after it opens (same day, no overnight windows) and no
 * two windows overlap. Windows that only touch (10:00-12:00, 12:00-14:00)
 * are allowed.
 */
export function validatePickupWindows(days: DayScheduleEntry[]): void {
  const byDay = new Map<Weekday, DayScheduleEntry[]>();
  for (const day of days) {
    byDay.set(day.dayOfWeek, [...(byDay.get(day.dayOfWeek) ?? []), day]);
  }

  for (const [dayOfWeek, entries] of byDay) {
    if (entries.some((entry) => !entry.isEnabled)) {
      if (entries.length > 1) {
        throw new BadRequestException(
          `${dayOfWeek} is listed as unavailable and also has other entries`,
        );
      }
      continue;
    }

    if (entries.length > MAX_WINDOWS_PER_DAY) {
      throw new BadRequestException(
        `${dayOfWeek} has more than ${MAX_WINDOWS_PER_DAY} pickup windows`,
      );
    }

    entries.forEach(assertWindowTimes);

    const sorted = [...entries].sort(
      (a, b) => parseTimeToMinutes(a.openTime!) - parseTimeToMinutes(b.openTime!),
    );
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (parseTimeToMinutes(current.openTime!) < parseTimeToMinutes(previous.closeTime!)) {
        throw new BadRequestException(
          `${dayOfWeek} pickup windows ${previous.openTime}-${previous.closeTime} and ` +
            `${current.openTime}-${current.closeTime} overlap`,
        );
      }
    }
  }
}

function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

function formatTimeLabel(time: string): string {
  const minutes = parseTimeToMinutes(time);
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute.toString().padStart(2, '0')} ${period}`;
}

function capitalize(weekday: string): string {
  return weekday.charAt(0) + weekday.slice(1).toLowerCase();
}

/** The Manila weekday and minutes since Manila midnight for an instant. */
export function getManilaClock(now: Date = new Date()): { dayOfWeek: DayName; timeMinutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MANILA_TZ,
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const dayOfWeek = (parts.find((part) => part.type === 'weekday')?.value ?? '').toUpperCase() as DayName;
  let hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value ?? '0', 10);
  const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value ?? '0', 10);

  // Some ICU builds render midnight as "24" with hour12: false.
  if (hour === 24) hour = 0;

  return { dayOfWeek, timeMinutes: hour * 60 + minute };
}

/**
 * Computes whether a vendor is currently open and, if not, when it next
 * opens, based on its configured Mon-Sat windows in Asia/Manila time. A day
 * may have several windows. A vendor with no configured days at all is
 * treated as always open (so vendors who haven't set up hours yet aren't
 * retroactively locked out).
 */
export function computeAvailabilityStatus(
  days: AvailabilityDay[],
  now: Date = new Date(),
): AvailabilityStatus {
  if (days.length === 0) {
    return { isOpenNow: true, nextAvailableLabel: null };
  }

  const windowsFor = (dayOfWeek: DayName) =>
    days
      .filter((day) => day.dayOfWeek === dayOfWeek && day.isOpen && day.openTime && day.closeTime)
      .map((day) => ({ open: day.openTime!, close: day.closeTime! }))
      .sort((a, b) => parseTimeToMinutes(a.open) - parseTimeToMinutes(b.open));

  const { dayOfWeek, timeMinutes } = getManilaClock(now);
  const today = dayOfWeek === 'SUNDAY' ? [] : windowsFor(dayOfWeek);

  if (today.some((w) => timeMinutes >= parseTimeToMinutes(w.open) && timeMinutes < parseTimeToMinutes(w.close))) {
    return { isOpenNow: true, nextAvailableLabel: null };
  }

  const laterToday = today.find((w) => timeMinutes < parseTimeToMinutes(w.open));
  if (laterToday) {
    return { isOpenNow: false, nextAvailableLabel: `today at ${formatTimeLabel(laterToday.open)}` };
  }

  const todayIndex = FULL_WEEK.indexOf(dayOfWeek);

  for (let offset = 1; offset <= 7; offset += 1) {
    const candidateName = FULL_WEEK[(todayIndex + offset) % 7];
    if (candidateName === 'SUNDAY') continue;

    const [first] = windowsFor(candidateName);
    if (first) {
      const label = offset === 7 ? `next ${capitalize(candidateName)}` : capitalize(candidateName);
      return { isOpenNow: false, nextAvailableLabel: `${label} at ${formatTimeLabel(first.open)}` };
    }
  }

  return { isOpenNow: false, nextAvailableLabel: null };
}

export interface PreorderWindow {
  dayOfWeek: Weekday;
  isEnabled: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface PreorderScheduleSource {
  preorderSameAsStoreHours: boolean;
  preorderAvailability: PreorderWindow[];
  availability: AvailabilityDay[];
}

/** Monday-first, then by opening time, so windows read in week order. */
export function sortWindows<T extends { dayOfWeek: Weekday; openTime: string | null }>(windows: T[]): T[] {
  return [...windows].sort(
    (a, b) =>
      FULL_WEEK.indexOf(a.dayOfWeek) - FULL_WEEK.indexOf(b.dayOfWeek) ||
      (a.openTime ? parseTimeToMinutes(a.openTime) : -1) - (b.openTime ? parseTimeToMinutes(b.openTime) : -1),
  );
}

/** The pickup windows in force: store hours when "same as store hours" is on. */
export function resolvePreorderWindows(vendor: PreorderScheduleSource): PreorderWindow[] {
  return sortWindows(
    vendor.preorderSameAsStoreHours
      ? vendor.availability.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          isEnabled: day.isOpen,
          openTime: day.openTime,
          closeTime: day.closeTime,
        }))
      : vendor.preorderAvailability,
  );
}

export function hasPickupWindows(windows: PreorderWindow[]): boolean {
  return windows.some((window) => window.isEnabled && window.openTime && window.closeTime);
}

/**
 * Whether a vendor's pickup window is open at `now` (Asia/Manila). Vendors
 * with no enabled pickup window are not restricted, so orders placed before
 * hours were configured can still be fulfilled. Whether *new* preorders are
 * accepted (preorderEnabled) is checked separately when ordering.
 */
export function preorderPickupStatus(
  vendor: PreorderScheduleSource,
  now: Date = new Date(),
): AvailabilityStatus & { hasPickupWindows: boolean } {
  const windows = resolvePreorderWindows(vendor);
  if (!hasPickupWindows(windows)) {
    return { isOpenNow: true, nextAvailableLabel: null, hasPickupWindows: false };
  }
  const status = computeAvailabilityStatus(
    windows.map((window) => ({
      dayOfWeek: window.dayOfWeek,
      isOpen: window.isEnabled,
      openTime: window.openTime,
      closeTime: window.closeTime,
    })),
    now,
  );
  return { ...status, hasPickupWindows: true };
}
