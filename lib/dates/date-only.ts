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
