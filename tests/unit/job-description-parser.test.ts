import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isDateOnly } from "@/lib/dates/date-only";
import { parseJobDescription } from "@/lib/job-description-parser";
import { mapToFormValues } from "@/lib/job-description-parser/map-to-form";
import { normalizeDocument } from "@/lib/job-description-parser/normalize";
import { findDates } from "@/lib/job-description-parser/parse-date";
import { confidenceFromScore, resolveField } from "@/lib/job-description-parser/score";

/** Fixed anchor so year inference and fixtures stay deterministic. */
const TODAY = new Date("2026-06-01T00:00:00Z");

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/job-descriptions");

function loadFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.txt`), "utf8");
}

function parseFixture(name: string) {
  return parseJobDescription(loadFixture(name), { today: TODAY });
}

describe("normalizeDocument", () => {
  it("drops blank lines and indexes the remainder in order", () => {
    const document = normalizeDocument("First\n\n\n  Second  \n\nThird");
    expect(document.lines.map((line) => line.original)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
    expect(document.lines.map((line) => line.index)).toEqual([0, 1, 2]);
  });

  it("strips bullet glyphs but preserves the original text", () => {
    const document = normalizeDocument("• Build campaigns\n- Maintain dashboards");
    expect(document.lines[0].original).toBe("Build campaigns");
    expect(document.lines[1].original).toBe("Maintain dashboards");
  });

  it("normalizes smart quotes and non-breaking spaces", () => {
    const document = normalizeDocument("We’re hiring now");
    expect(document.lines[0].original).toBe("We're hiring now");
  });

  it("recognizes headings without treating prose as one", () => {
    const document = normalizeDocument(
      "Responsibilities:\nYou will build and maintain reporting dashboards for the team.",
    );
    expect(document.lines[0].isHeadingLike).toBe(true);
    expect(document.lines[1].isHeadingLike).toBe(false);
  });
});

describe("findDates", () => {
  it("parses month-first, day-first, and ISO forms to YYYY-MM-DD", () => {
    expect(findDates("July 17, 2026", TODAY)[0].value).toBe("2026-07-17");
    expect(findDates("17 July 2026", TODAY)[0].value).toBe("2026-07-17");
    expect(findDates("2026-07-17", TODAY)[0].value).toBe("2026-07-17");
  });

  it("emits values that satisfy the app's date-only validator", () => {
    for (const text of ["March 3, 2027", "2027-01-09", "9 December 2026"]) {
      expect(isDateOnly(findDates(text, TODAY)[0].value)).toBe(true);
    }
  });

  it("does not shift the day across timezones", () => {
    // A naive Date round-trip in a negative-offset zone yields 2026-12-31.
    expect(findDates("January 1, 2027", TODAY)[0].value).toBe("2027-01-01");
  });

  it("infers the next occurrence when the year is omitted", () => {
    const future = findDates("December 5", TODAY)[0];
    expect(future.value).toBe("2026-12-05");
    expect(future.yearInferred).toBe(true);

    // Already past on the 2026-06-01 anchor, so it rolls to the next year.
    expect(findDates("March 5", TODAY)[0].value).toBe("2027-03-05");
  });

  it("resolves numeric dates when only one ordering is possible", () => {
    const match = findDates("15/03/2027", TODAY)[0];
    expect(match.value).toBe("2027-03-15");
    expect(match.ambiguousOrder).toBe(false);
  });

  it("flags numeric dates that are genuinely ambiguous", () => {
    const match = findDates("03/04/2027", TODAY)[0];
    expect(match.ambiguousOrder).toBe(true);
  });

  it("does not read a bare month-year as a day", () => {
    // "May 2026" must not become May 20th, which is what an unguarded
    // day group would produce by consuming the first two digits of the year.
    expect(findDates("May 2026", TODAY)).toHaveLength(0);
    expect(findDates("Starting September 2027", TODAY)).toHaveLength(0);
  });

  it("rejects impossible calendar dates", () => {
    expect(findDates("February 30, 2027", TODAY)).toHaveLength(0);
    expect(findDates("2027-13-01", TODAY)).toHaveLength(0);
  });

  it("returns every date on a line, in order", () => {
    const matches = findDates("Apply by July 17, 2026. Start date August 3, 2026.", TODAY);
    expect(matches.map((match) => match.value)).toEqual([
      "2026-07-17",
      "2026-08-03",
    ]);
  });
});

describe("resolveField", () => {
  it("reports nothing found when there are no candidates", () => {
    const field = resolveField<string>([]);
    expect(field.value).toBeNull();
    expect(field.confidence).toBeNull();
  });

  it("downgrades confidence when two different values nearly tie", () => {
    const field = resolveField([
      { value: "A", score: 100, evidence: "a", ruleId: "r1" },
      { value: "B", score: 95, evidence: "b", ruleId: "r2" },
    ]);
    expect(field.value).toBe("A");
    expect(field.confidence).toBe("Medium");
    expect(field.warnings).toContain("Multiple similarly likely values were found.");
  });

  it("treats two rules agreeing on one value as corroboration, not conflict", () => {
    const field = resolveField([
      { value: "A", score: 100, evidence: "a", ruleId: "r1" },
      { value: "A", score: 98, evidence: "a2", ruleId: "r2" },
    ]);
    expect(field.confidence).toBe("High");
    expect(field.warnings).toHaveLength(0);
  });

  it("withholds a value whose score is below the low threshold", () => {
    const field = resolveField([
      { value: "A", score: 10, evidence: "a", ruleId: "r1" },
    ]);
    expect(field.value).toBeNull();
    // The candidate is retained for debugging even though it was not used.
    expect(field.candidates).toHaveLength(1);
  });

  it("surfaces only the winning candidate's warnings", () => {
    const field = resolveField([
      { value: "A", score: 100, evidence: "a", ruleId: "r1", warnings: ["kept"] },
      { value: "B", score: 40, evidence: "b", ruleId: "r2", warnings: ["dropped"] },
    ]);
    expect(field.warnings).toEqual(["kept"]);
  });

  it("maps scores to the app's existing confidence union", () => {
    expect(confidenceFromScore(95)).toBe("High");
    expect(confidenceFromScore(60)).toBe("Medium");
    expect(confidenceFromScore(30)).toBe("Low");
    expect(confidenceFromScore(5)).toBeNull();
  });
});

describe("fully labelled posting", () => {
  const parsed = parseFixture("labelled-marketing-student");

  it("extracts the labelled title and company", () => {
    expect(parsed.originalJobTitle.value).toBe("Digital Campaign Marketing Student");
    expect(parsed.originalJobTitle.confidence).toBe("High");
    expect(parsed.companyName.value).toBe("Northline Technologies");
  });

  it("extracts location, arrangement, term, duration, and salary", () => {
    expect(parsed.location.value).toBe("Ottawa, ON");
    expect(parsed.workArrangement.value).toBe("Hybrid");
    expect(parsed.workTermSeason.value).toBe("Fall 2026");
    expect(parsed.workTermDuration.value).toBe("4 months");
    expect(parsed.salary.value).toBe("$24.50 - $28.00 per hour");
  });

  it("extracts the deadline as a date-only string", () => {
    expect(parsed.applicationDeadline.value).toBe("2026-07-17");
    expect(parsed.applicationDeadline.confidence).toBe("High");
    expect(isDateOnly(parsed.applicationDeadline.value ?? "")).toBe(true);
  });

  it("keeps the evidence line for the deadline", () => {
    expect(parsed.applicationDeadline.evidence).toContain("Application Deadline");
  });
});

describe("prose posting with an inline deadline", () => {
  const parsed = parseFixture("bank-business-analyst");

  it("picks the applied-by date over the interview date on the same line", () => {
    expect(parsed.applicationDeadline.value).toBe("2026-12-05");
  });

  it("reads the title from the leading line", () => {
    expect(parsed.originalJobTitle.value).toBe("Business Analyst Co-op");
  });

  it("identifies the employer from the 'is seeking' construction", () => {
    expect(parsed.companyName.value).toBe("Meridian Trust Bank");
  });

  it("classifies from the title rather than stray body keywords", () => {
    expect(parsed.normalizedJobCategory.value).toBe("Business Analysis");
  });

  it("resolves the province name to a code", () => {
    expect(parsed.location.value).toBe("Toronto, ON");
  });

  it("reads an inline duration", () => {
    expect(parsed.workTermDuration.value).toBe("8 months");
  });
});

describe("posting containing many competing dates", () => {
  const parsed = parseFixture("multiple-dates");

  it("selects the labelled deadline and not the start, posted, or interview dates", () => {
    expect(parsed.applicationDeadline.value).toBe("2026-06-30");
  });

  it("does not mistake a founding year for a date", () => {
    expect(parsed.applicationDeadline.value).not.toBe("1998-01-01");
  });

  it("derives duration from a month range", () => {
    expect(parsed.workTermDuration.value).toBe("4 months");
  });

  it("detects a remote arrangement", () => {
    expect(parsed.workArrangement.value).toBe("Remote");
  });
});

describe("posting with no deadline", () => {
  const parsed = parseFixture("missing-deadline");

  it("returns nothing rather than inventing a date", () => {
    expect(parsed.applicationDeadline.value).toBeNull();
    expect(parsed.applicationDeadline.confidence).toBeNull();
  });

  it("strips the introductory verb from the company name", () => {
    // "Join Brightpath Systems" must yield the name alone, and must not
    // compete with the intro-phrase rule to create a false ambiguity.
    expect(parsed.companyName.value).toBe("Brightpath Systems");
    expect(parsed.companyName.confidence).toBe("High");
    expect(parsed.companyName.warnings).toHaveLength(0);
  });

  it("still extracts the fields that are present", () => {
    expect(parsed.workArrangement.value).toBe("On-site");
    expect(parsed.workTermDuration.value).toBe("4 months");
    expect(parsed.location.value).toBe("Calgary, AB");
    expect(parsed.normalizedJobCategory.value).toBe("Software Engineering");
  });
});

describe("board-style posting", () => {
  const parsed = parseFixture("linkedin-style-posting");

  it("extracts an ISO closing date", () => {
    expect(parsed.applicationDeadline.value).toBe("2027-02-28");
  });

  it("prefers the specific category over the generic one", () => {
    expect(parsed.normalizedJobCategory.value).toBe("Revenue Operations");
  });

  it("reads the hybrid arrangement", () => {
    expect(parsed.workArrangement.value).toBe("Hybrid");
  });

  it("does not take a company name from equal-opportunity boilerplate", () => {
    expect(parsed.companyName.value).toBe("Fernwood Software");
  });
});

describe("form-style posting with a numeric date", () => {
  const parsed = parseFixture("workday-style-posting");

  it("resolves an unambiguous day-first numeric date", () => {
    expect(parsed.applicationDeadline.value).toBe("2027-03-15");
  });

  it("extracts the labelled title without the label", () => {
    expect(parsed.originalJobTitle.value).toBe("Financial Analyst Intern");
  });

  it("keeps the period that belongs to a legal abbreviation", () => {
    expect(parsed.companyName.value).toBe("Cavendish Grove Holdings Inc.");
  });

  it("ignores company revenue figures when reading salary", () => {
    expect(parsed.salary.value).toBe("$23.75 per hour");
  });

  it("classifies as Finance", () => {
    expect(parsed.normalizedJobCategory.value).toBe("Finance");
  });

  it("reads the on-site arrangement", () => {
    expect(parsed.workArrangement.value).toBe("On-site");
  });
});

describe("posting with no identifiable title", () => {
  const parsed = parseFixture("ambiguous-title");

  it("does not present a section heading as the job title", () => {
    const value = parsed.originalJobTitle.value?.toLowerCase() ?? "";
    expect(["overview", "about us", "the opportunity", "what you bring"]).not.toContain(
      value,
    );
  });

  it("falls back to Other rather than guessing a category", () => {
    expect(parsed.normalizedJobCategory.value).toBe("Other");
    expect(parsed.normalizedJobCategory.confidence).toBeNull();
  });

  it("still finds the labelled location", () => {
    expect(parsed.location.value).toBe("Kingston, ON");
  });
});

describe("bilingual posting", () => {
  const parsed = parseFixture("bilingual-posting");

  it("reads a French deadline label and month name", () => {
    expect(parsed.applicationDeadline.value).toBe("2026-11-30");
  });

  it("reads a French location label", () => {
    expect(parsed.location.value).toBe("Gatineau, QC");
  });

  it("classifies a bilingual title as project management", () => {
    expect(parsed.normalizedJobCategory.value).toBe("Project Management");
  });
});

describe("mapToFormValues", () => {
  it("produces values assignable to the application form", () => {
    const parsed = parseFixture("labelled-marketing-student");
    const { values } = mapToFormValues(parsed);

    expect(values.companyName).toBe("Northline Technologies");
    expect(values.originalJobTitle).toBe("Digital Campaign Marketing Student");
    expect(values.location).toBe("Ottawa, ON");
    expect(values.workArrangement).toBe("Hybrid");
    expect(values.applicationDeadline).toBe("2026-07-17");
  });

  it("always carries the pasted description through verbatim", () => {
    const text = loadFixture("missing-deadline");
    const { values } = mapToFormValues(parseJobDescription(text, { today: TODAY }));
    expect(values.jobDescription).toBe(text);
  });

  it("withholds low-confidence values but still reports them", () => {
    const parsed = parseFixture("ambiguous-title");
    const { values, decisions } = mapToFormValues(parsed);

    expect(values.normalizedJobCategory).toBeUndefined();
    const category = decisions.find(
      (decision) => decision.field === "normalizedJobCategory",
    );
    expect(category?.applied).toBe(false);
  });

  it("reports a decision for every prefillable field", () => {
    const { decisions } = mapToFormValues(parseFixture("labelled-marketing-student"));
    expect(decisions).toHaveLength(9);
    expect(decisions.every((decision) => decision.label.length > 0)).toBe(true);
  });

  it("never emits a value the creation schema would reject for length", () => {
    const parsed = parseFixture("labelled-marketing-student");
    const { values } = mapToFormValues(parsed);

    expect((values.companyName ?? "").length).toBeLessThanOrEqual(160);
    expect((values.originalJobTitle ?? "").length).toBeLessThanOrEqual(200);
    expect((values.location ?? "").length).toBeLessThanOrEqual(200);
    expect((values.salary ?? "").length).toBeLessThanOrEqual(100);
    expect((values.workTermDuration ?? "").length).toBeLessThanOrEqual(80);
  });
});
