export function formatDateTime(
  value: string,
  locale = "en-CA",
  timeZone = "America/Toronto",
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
