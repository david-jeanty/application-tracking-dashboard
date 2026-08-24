const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateOnly(value: string): boolean {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function todayInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function compareDateOnly(left: string, right: string): number {
  if (!isDateOnly(left) || !isDateOnly(right)) {
    throw new Error("Date-only comparisons require valid YYYY-MM-DD values.");
  }
  return left.localeCompare(right);
}

export function isOverdueDate(
  dueDate: string | null | undefined,
  today: string,
): boolean {
  return Boolean(dueDate && compareDateOnly(dueDate, today) < 0);
}

export function isDueToday(
  dueDate: string | null | undefined,
  today: string,
): boolean {
  return Boolean(dueDate && compareDateOnly(dueDate, today) === 0);
}

export function formatDateOnly(
  value: string,
  locale = "en-CA",
): string {
  if (!isDateOnly(value)) {
    throw new Error("Date-only formatting requires a valid YYYY-MM-DD value.");
  }

  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * Whole calendar days from `from` to `to`, negative when `to` is earlier.
 *
 * Both sides are built at UTC midnight from their own year/month/day, so the
 * subtraction is between two fixed noon-free instants that differ by an exact
 * multiple of 24 hours. Nothing here ever sees a local zone, which is what
 * makes the result stable across daylight-saving boundaries — parsing either
 * string with `new Date("2026-03-08")` and diffing in local time is precisely
 * the bug this avoids.
 */
export function differenceInCalendarDays(from: string, to: string): number {
  if (!isDateOnly(from) || !isDateOnly(to)) {
    throw new Error("Date-only differences require valid YYYY-MM-DD values.");
  }

  const utc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };

  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * The Monday of the calendar week containing `value`.
 *
 * Monday rather than Sunday: a student's search week runs with the working
 * week, and "applications this week" resetting mid-weekend would read as a
 * loss. Computed in UTC for the same reason as the difference above.
 */
export function startOfWeek(value: string): string {
  if (!isDateOnly(value)) {
    throw new Error("Week boundaries require a valid YYYY-MM-DD value.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // getUTCDay is 0 for Sunday, so Sunday is six days into its Monday week.
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  return date.toISOString().slice(0, 10);
}

/**
 * The calendar day a timestamp falls on, in the given zone.
 *
 * Timestamps and date-only values are different concepts, and this is the one
 * sanctioned bridge between them: an instant becomes a calendar day only by
 * naming the zone that decides which day it was.
 */
export function dateOnlyFromTimestamp(
  timestamp: string,
  timeZone: string,
): string {
  const instant = new Date(timestamp);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("A calendar day requires a valid timestamp.");
  }

  return todayInTimeZone(instant, timeZone);
}
