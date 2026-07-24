import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/dates/date-time";

describe("date-time formatting", () => {
  it("formats instants in the product timezone", () => {
    expect(
      formatDateTime("2027-01-15T02:30:00.000Z", "en-CA", "America/Toronto"),
    ).toContain("Jan 14, 2027");
  });

  it("rejects invalid timestamps", () => {
    expect(() => formatDateTime("not-a-time")).toThrow(
      "Timestamp formatting requires a valid date-time value.",
    );
  });
});
