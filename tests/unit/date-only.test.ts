import { describe, expect, it } from "vitest";
import {
  compareDateOnly,
  formatDateOnly,
  isDateOnly,
  isDueToday,
  isOverdueDate,
  todayInTimeZone,
} from "@/lib/dates/date-only";

describe("date-only utilities", () => {
  it.each([
    ["2028-02-29", true],
    ["2027-02-29", false],
    ["2026-13-01", false],
    ["2026-12-32", false],
    ["07/24/2026", false],
  ])("validates %s", (value, expected) => {
    expect(isDateOnly(value)).toBe(expected);
  });

  it("formats without shifting the calendar date", () => {
    expect(formatDateOnly("2026-07-24", "en-CA")).toBe("Jul 24, 2026");
  });

  it("compares dates across month and year boundaries", () => {
    expect(compareDateOnly("2026-12-31", "2027-01-01")).toBeLessThan(0);
    expect(compareDateOnly("2027-01-01", "2026-12-31")).toBeGreaterThan(0);
  });

  it("handles missing, overdue, and due-today values", () => {
    expect(isOverdueDate(undefined, "2026-07-24")).toBe(false);
    expect(isOverdueDate("2026-07-23", "2026-07-24")).toBe(true);
    expect(isOverdueDate("2026-07-24", "2026-07-24")).toBe(false);
    expect(isDueToday("2026-07-24", "2026-07-24")).toBe(true);
    expect(isDueToday(null, "2026-07-24")).toBe(false);
  });

  it("derives today in the requested timezone around midnight", () => {
    const instant = new Date("2026-07-24T02:30:00.000Z");
    expect(todayInTimeZone(instant, "America/Toronto")).toBe("2026-07-23");
    expect(todayInTimeZone(instant, "Asia/Tokyo")).toBe("2026-07-24");
  });

  it("does not shift dates across daylight-saving transitions", () => {
    expect(
      todayInTimeZone(
        new Date("2026-03-08T06:59:59.000Z"),
        "America/Toronto",
      ),
    ).toBe("2026-03-08");
    expect(
      todayInTimeZone(
        new Date("2026-11-01T06:30:00.000Z"),
        "America/Toronto",
      ),
    ).toBe("2026-11-01");
  });
});
