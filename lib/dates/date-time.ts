import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";

export function formatDateTime(
  value: string,
  locale = "en-CA",
  timeZone = DEFAULT_TIME_ZONE,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Timestamp formatting requires a valid date-time value.");
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}
