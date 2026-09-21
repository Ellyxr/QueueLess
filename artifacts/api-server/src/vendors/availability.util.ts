import { BadRequestException } from '@nestjs/common';
import { Weekday } from '@prisma/client';

const MANILA_TZ = 'Asia/Manila';

// Full calendar week, Sunday first, matching Intl's weekday names. The
// Weekday enum has no SUNDAY value — vendors never operate that day — so it
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

/**
 * Validates a weekday schedule payload: no day listed twice, and every
 * enabled day has an open/close time with close strictly after open.
 * Throws a plain Error with a user-facing message on the first violation.
 */
export function validateDaySchedule(days: DayScheduleEntry[]): void {
  const seenDays = new Set<Weekday>();

  for (const day of days) {
    if (seenDays.has(day.dayOfWeek)) {
      throw new BadRequestException(`${day.dayOfWeek} was listed more than once`);
    }
    seenDays.add(day.dayOfWeek);

    if (day.isEnabled) {
      if (!day.openTime || !day.closeTime) {
        throw new BadRequestException(
          `${day.dayOfWeek} is enabled but is missing an open or close time`,
        );
      }

      if (day.openTime >= day.closeTime) {
        throw new BadRequestException(
          `${day.dayOfWeek}'s close time must be after its open time`,
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

function getManilaNow(): { dayOfWeek: DayName; timeMinutes: number } {
  const now = new Date();
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
 * opens, based on its configured Mon-Sat availability windows (Asia/Manila
 * time). A vendor with no configured days at all is treated as always open
 * (so vendors who haven't set up hours yet aren't retroactively locked out).
 */
export function computeAvailabilityStatus(days: AvailabilityDay[]): AvailabilityStatus {
  if (days.length === 0) {
    return { isOpenNow: true, nextAvailableLabel: null };
  }

  const byDay = new Map(days.map((day) => [day.dayOfWeek, day]));
  const { dayOfWeek, timeMinutes } = getManilaNow();

  const today = dayOfWeek === 'SUNDAY' ? undefined : byDay.get(dayOfWeek);

  if (
    today?.isOpen &&
    today.openTime &&
    today.closeTime &&
    timeMinutes >= parseTimeToMinutes(today.openTime) &&
    timeMinutes < parseTimeToMinutes(today.closeTime)
  ) {
    return { isOpenNow: true, nextAvailableLabel: null };
  }

  if (today?.isOpen && today.openTime && timeMinutes < parseTimeToMinutes(today.openTime)) {
    return { isOpenNow: false, nextAvailableLabel: `today at ${formatTimeLabel(today.openTime)}` };
  }

  const todayIndex = FULL_WEEK.indexOf(dayOfWeek);

  for (let offset = 1; offset <= 6; offset += 1) {
    const candidateName = FULL_WEEK[(todayIndex + offset) % 7];
    if (candidateName === 'SUNDAY') continue;

    const candidate = byDay.get(candidateName);
    if (candidate?.isOpen && candidate.openTime) {
      return {
        isOpenNow: false,
        nextAvailableLabel: `${capitalize(candidateName)} at ${formatTimeLabel(candidate.openTime)}`,
      };
    }
  }

  return { isOpenNow: false, nextAvailableLabel: null };
}
