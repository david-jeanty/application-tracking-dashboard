import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARSER_VERSION } from "@/lib/job-description-parser";
import {
  collectDefects,
  evaluateCorpus,
  renderReport,
  summarizeCorpus,
} from "@/lib/job-description-parser/evaluation";
import {
  CORPUS_TAGS,
  EVALUATION_FIXTURES,
  EVALUATION_TODAY,
} from "@/tests/fixtures/job-descriptions/corpus";

const evaluations = evaluateCorpus(EVALUATION_FIXTURES, EVALUATION_TODAY);
const metrics = summarizeCorpus(evaluations);
const defects = collectDefects(evaluations);

/**
 * Regenerates the committed report:
 *   WRITE_PARSER_REPORT=1 npm run test
 * Printing is opt-in so an ordinary test run stays quiet.
 */
if (process.env.WRITE_PARSER_REPORT) {
  const report = renderReport(evaluations, {
    today: EVALUATION_TODAY,
    parserVersion: PARSER_VERSION,
  });
  writeFileSync(join(process.cwd(), "docs/parser-evaluation.md"), report, "utf8");

  console.log(
    `\nFixtures: ${metrics.fixtureCount} — fully correct ${metrics.fullyCorrect}, ` +
      `usable ${metrics.usable}, unusable ${metrics.unusable}\n`,
  );
  for (const defect of defects) {
    console.log(
      `P${defect.priority} ${defect.fixture} / ${defect.outcome.field}: ` +
        `expected ${JSON.stringify(defect.outcome.expected)} got ` +
        `${JSON.stringify(defect.outcome.extracted)} (${defect.outcome.confidence ?? "none"})`,
    );
  }
}

describe("parser evaluation corpus", () => {
  it("covers at least 25 fixtures", () => {
    expect(EVALUATION_FIXTURES.length).toBeGreaterThanOrEqual(25);
  });

  it("has a unique name and complete expectations per fixture", () => {
    const names = EVALUATION_FIXTURES.map((fixture) => fixture.name);
    expect(new Set(names).size).toBe(names.length);

    for (const fixture of EVALUATION_FIXTURES) {
      expect(fixture.text.trim().length).toBeGreaterThan(0);
      expect(fixture.tags.length).toBeGreaterThan(0);
    }
  });

  it("represents every posting format, term length, and hazard the parser targets", () => {
    for (const tag of [
      "format:linkedin",
      "format:workday",
      "format:dayforce",
      "format:coop-portal",
      "format:careers-page",
      "format:bilingual",
      "format:minimal",
      "term:4-month",
      "term:8-month",
      "term:4-or-8-month",
      "term:weeks",
      "salary:range",
      "hazard:no-salary",
      "hazard:no-deadline",
      "hazard:distractor-dates",
      "hazard:multiple-locations",
      "hazard:remote-with-office-address",
      "hazard:misleading-headings",
      "hazard:company-in-prose",
      "hazard:title-after-boilerplate",
      "hazard:ambiguous-title",
      "hazard:ambiguous-company",
      "role:marketing",
      "role:business-analysis",
      "role:sales",
      "role:revenue-operations",
      "role:technology",
      "role:finance",
    ]) {
      expect(CORPUS_TAGS).toContain(tag);
    }
  });
});

describe("parser accuracy gates", () => {
  /**
   * The headline safety property: the parser must never invent a value for a
   * field the posting does not state. A fabricated value is information the
   * user never supplied and cannot spot by proofreading against the posting.
   */
  it("fabricates no values for fields the postings do not state", () => {
    const fabricated = evaluations.flatMap((evaluation) =>
      evaluation.outcomes
        .filter((outcome) => outcome.kind === "fabricated")
        .map((outcome) => `${evaluation.name}/${outcome.field}=${outcome.extracted}`),
    );
    expect(fabricated).toEqual([]);
  });

  it("reports no wrong value at High confidence", () => {
    const wrong = evaluations.flatMap((evaluation) =>
      evaluation.outcomes
        .filter(
          (outcome) =>
            (outcome.kind === "incorrect" || outcome.kind === "fabricated") &&
            outcome.confidence === "High",
        )
        .map(
          (outcome) =>
            `${evaluation.name}/${outcome.field}: expected ${outcome.expected}, got ${outcome.extracted}`,
        ),
    );
    expect(wrong).toEqual([]);
  });

  /**
   * Anything wrong that survives must stay below the prefill threshold, so the
   * user is never handed a populated field they did not verify.
   */
  it("never lets a wrong value reach the form", () => {
    const prefilled = evaluations.flatMap((evaluation) =>
      evaluation.outcomes
        .filter(
          (outcome) =>
            (outcome.kind === "incorrect" || outcome.kind === "fabricated") &&
            outcome.prefilled,
        )
        .map(
          (outcome) =>
            `${evaluation.name}/${outcome.field}: expected ${outcome.expected}, got ${outcome.extracted}`,
        ),
    );
    expect(prefilled).toEqual([]);
    expect(metrics.unusable).toBe(0);
  });

  it("extracts every deadline the postings state, and only those", () => {
    const deadline = metrics.fields.find(
      (field) => field.field === "applicationDeadline",
    );
    expect(deadline?.incorrect).toBe(0);
    expect(deadline?.fabricated).toBe(0);
    expect(deadline?.missing).toBe(0);
  });

  it("identifies the company and title on every posting that names them", () => {
    for (const name of ["companyName", "originalJobTitle"] as const) {
      const field = metrics.fields.find((one) => one.field === name);
      expect(field?.incorrect).toBe(0);
      expect(field?.fabricated).toBe(0);
    }
  });

  it("holds every field at or above its calibrated recall floor", () => {
    // Floors record what the parser is measured to achieve today. Raising one
    // is a deliberate improvement; lowering one is a regression to justify.
    const floors: Record<string, number> = {
      companyName: 1,
      originalJobTitle: 1,
      normalizedJobCategory: 1,
      location: 1,
      workArrangement: 1,
      applicationDeadline: 1,
      workTermSeason: 1,
      workTermDuration: 1,
      salary: 1,
    };

    for (const field of metrics.fields) {
      expect(
        field.recall,
        `${field.field} recall ${field.recall.toFixed(3)}`,
      ).toBeGreaterThanOrEqual(floors[field.field]);
    }
  });
});
