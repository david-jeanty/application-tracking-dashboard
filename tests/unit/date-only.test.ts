import { describe, expect, it } from "vitest";
import {
  compareDateOnly,
  dateOnlyFromTimestamp,
  differenceInCalendarDays,
  formatDateOnly,
  isDateOnly,
  isDueToday,
  isOverdueDate,
  startOfWeek,
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

describe("calendar-day differences do not shift across zones or clock changes", () => {
  it("counts whole days forward and backward", () => {
    expect(differenceInCalendarDays("2026-08-24", "2026-08-26")).toBe(2);
    expect(differenceInCalendarDays("2026-08-26", "2026-08-24")).toBe(-2);
    expect(differenceInCalendarDays("2026-08-24", "2026-08-24")).toBe(0);
  });

  it("crosses a spring daylight-saving change without losing a day", () => {
    // North American clocks jump forward on 2026-03-08. Diffing these two
    // dates in local time is exactly the bug this helper exists to avoid.
    expect(differenceInCalendarDays("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("crosses an autumn daylight-saving change without gaining a day", () => {
    expect(differenceInCalendarDays("2026-11-01", "2026-11-02")).toBe(1);
  });

  it("crosses month and year boundaries", () => {
    expect(differenceInCalendarDays("2026-08-31", "2026-09-01")).toBe(1);
    expect(differenceInCalendarDays("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("handles a leap day", () => {
    expect(differenceInCalendarDays("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("rejects anything that is not a calendar date", () => {
    expect(() => differenceInCalendarDays("2026-02-30", "2026-03-01")).toThrow();
    expect(() => differenceInCalendarDays("today", "2026-03-01")).toThrow();
  });
});

describe("the week starts on Monday", () => {
  it("returns the same day when given a Monday", () => {
    expect(startOfWeek("2026-08-24")).toBe("2026-08-24");
  });

  it("walks back from midweek", () => {
    expect(startOfWeek("2026-08-26")).toBe("2026-08-24");
  });

  it("treats Sunday as the last day of its week, not the first of the next", () => {
    // A search week that reset mid-weekend would read as losing the week's work.
    expect(startOfWeek("2026-08-30")).toBe("2026-08-24");
  });

  it("crosses a month boundary", () => {
    expect(startOfWeek("2026-09-02")).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    expect(startOfWeek("2027-01-01")).toBe("2026-12-28");
  });

  it("rejects anything that is not a calendar date", () => {
    expect(() => startOfWeek("2026-13-01")).toThrow();
  });
});

describe("timestamps become calendar days only through a named zone", () => {
  it("uses the zone to decide which day an instant fell on", () => {
    const evening = "2026-07-24T02:30:00.000Z";

    expect(dateOnlyFromTimestamp(evening, "America/Toronto")).toBe("2026-07-23");
    expect(dateOnlyFromTimestamp(evening, "Asia/Tokyo")).toBe("2026-07-24");
  });

  it("rejects a value that is not a timestamp", () => {
    expect(() => dateOnlyFromTimestamp("not a time", "UTC")).toThrow();
  });
});
