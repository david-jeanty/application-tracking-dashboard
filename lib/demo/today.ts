import { todayInTimeZone } from "@/lib/dates/date-only";
import { DEFAULT_TIME_ZONE } from "@/lib/dates/time-zone";

/**
 * The day the demo is being viewed on.
 *
 * Resolved through the product's own timezone helper, exactly as the
 * authenticated dashboard and analytics pages resolve theirs, so a demo page
 * and a real page never disagree about what "today" is. Every demo surface
 * calls this once and passes the result down; nothing below reads a clock.
 */
export function demoToday(): string {
  return todayInTimeZone(new Date(), DEFAULT_TIME_ZONE);
}
