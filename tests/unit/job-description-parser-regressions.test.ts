import { describe, expect, it } from "vitest";
import { parseJobDescription } from "@/lib/job-description-parser";
import { mapToFormValues } from "@/lib/job-description-parser/map-to-form";

/** Same anchor the evaluation corpus uses, so year inference is deterministic. */
const TODAY = new Date("2026-06-01T00:00:00Z");

function parse(text: string) {
  return parseJobDescription(text, { today: TODAY });
}

/**
 * Each block below pins a defect found by the evaluation harness. The comment
 * records what the parser used to return, so a future change that reintroduces
 * the behaviour fails here with the original symptom rather than a bare diff.
 */

describe("company extraction regressions", () => {
  it("strips a careers-page lead-in instead of keeping it in the name", () => {
    // Returned "Careers at Ironwood Labs" at Medium, which populated the form.
    const parsed = parse(
      ["Careers at Ironwood Labs", "", "Backend Software Developer, Co-op"].join("\n"),
    );

    expect(parsed.companyName.value).toBe("Ironwood Labs");
    expect(parsed.companyName.confidence).toBe("High");
  });

  it("strips a banner lead-in verb from the employer name", () => {
    const parsed = parse(
      ["Software Developer Intern", "", "Join Brightpath Systems"].join("\n"),
    );

    expect(parsed.companyName.value).toBe("Brightpath Systems");
  });

  it("reads only the name segment of a composite header line", () => {
    // Returned the whole "Name · City · Arrangement" line as the employer.
    const parsed = parse(
      [
        "Cloud Infrastructure Intern",
        "Northwind Cloud Services · Edmonton, AB · On-site",
      ].join("\n"),
    );

    expect(parsed.companyName.value).toBe("Northwind Cloud Services");
    expect(parsed.location.value).toBe("Edmonton, AB");
  });

  it("recovers a bare employer line but keeps it below the prefill threshold", () => {
    // Returned nothing at all for a posting that names its employer on a line
    // of its own. Recovered as a positional guess, so it must stay Low: it is
    // inferred from placement rather than from any stated label or phrase.
    const parsed = parse(
      [
        "Operations Intern",
        "",
        "Redcliff Bindery",
        "",
        "We need an operations intern to help with day-to-day tasks.",
      ].join("\n"),
    );

    expect(parsed.companyName.value).toBe("Redcliff Bindery");
    expect(parsed.companyName.confidence).toBe("Low");

    const prefill = mapToFormValues(parsed);
    expect(prefill.values.companyName).toBeUndefined();
    expect(
      prefill.decisions.find((decision) => decision.field === "companyName")?.applied,
    ).toBe(false);
  });

  it("does not mistake a role line for a bare employer name", () => {
    const parsed = parse(
      ["Careers", "", "Marketing Coordinator", "", "Location: Ottawa, ON"].join("\n"),
    );

    expect(parsed.companyName.value).not.toBe("Marketing Coordinator");
  });
});

describe("work-term duration regressions", () => {
  it("reads a French duration label and unit", () => {
    // "Durée: 4 mois" produced no duration at all.
    const parsed = parse(
      ["Analyste de données junior", "", "Durée: 4 mois"].join("\n"),
    );

    expect(parsed.workTermDuration.value).toBe("4 months");
  });

  it("normalizes French week units to the English form", () => {
    const parsed = parse(["Stagiaire", "", "Durée: 16 semaines"].join("\n"));

    expect(parsed.workTermDuration.value).toBe("16 weeks");
  });

  it("still reads English durations unchanged", () => {
    expect(parse("Duration: 8 months").workTermDuration.value).toBe("8 months");
    expect(parse("Duration: 16 weeks").workTermDuration.value).toBe("16 weeks");
    expect(parse("Term Length: 4 or 8 months").workTermDuration.value).toBe(
      "4 or 8 months",
    );
  });
});

describe("confidence calibration regressions", () => {
  it("never reports an ambiguous day/month deadline at High confidence", () => {
    // A labelled 05/04/2028 scored 95 and prefilled at High, even though the
    // posting does not settle whether it means 5 April or 4 May. Offering the
    // reading is fine; asserting it is not.
    const parsed = parse("Application Deadline: 05/04/2028");

    expect(parsed.applicationDeadline.value).toBe("2028-04-05");
    expect(parsed.applicationDeadline.confidence).toBe("Medium");
    expect(parsed.applicationDeadline.warnings.join(" ")).toContain(
      "could be day-first or month-first",
    );
  });

  it("keeps an unambiguous deadline at High confidence", () => {
    const parsed = parse("Application Deadline: 15/03/2027");

    expect(parsed.applicationDeadline.value).toBe("2027-03-15");
    expect(parsed.applicationDeadline.confidence).toBe("High");
  });

  it("hedges and warns when a line lists several work locations", () => {
    // Only the first city was ever considered, so a three-office posting came
    // back as a confident single location.
    const parsed = parse(
      [
        "Project Coordinator",
        "Locations: Calgary, AB / Edmonton, AB / Regina, SK",
      ].join("\n"),
    );

    expect(parsed.location.value).toBe("Calgary, AB");
    expect(parsed.location.confidence).toBe("Medium");
    expect(parsed.location.warnings.join(" ")).toContain(
      "Multiple similarly likely values were found.",
    );
    expect(parsed.location.candidates.map((candidate) => candidate.value)).toEqual([
      "Calgary, AB",
      "Edmonton, AB",
      "Regina, SK",
    ]);
  });

  it("stays confident when one location is stated twice", () => {
    const parsed = parse(
      [
        "Data Analyst Intern",
        "Location: Toronto, ON",
        "This role is based in our Toronto, Ontario office.",
      ].join("\n"),
    );

    expect(parsed.location.value).toBe("Toronto, ON");
    expect(parsed.location.confidence).toBe("High");
  });

  it("recognizes a plural location label", () => {
    expect(parse("Locations: Halifax, NS").location.value).toBe("Halifax, NS");
    expect(parse("Location: Halifax, NS").location.value).toBe("Halifax, NS");
  });
});

describe("job title regressions", () => {
  it("recovers a title stated only inside a hiring sentence", () => {
    // Every candidate line was a generic heading, so the title came back null
    // even though the posting names the role in prose.
    const parsed = parse(
      [
        "Job Description",
        "",
        "Position Summary",
        "",
        "Overview",
        "",
        "Silverbrook Grain Cooperative is looking for a Business Operations Analyst to join our planning team in Regina.",
      ].join("\n"),
    );

    expect(parsed.originalJobTitle.value).toBe("Business Operations Analyst");
  });

  it("keeps a labelled title ahead of the hiring sentence's shorter form", () => {
    const parsed = parse(
      [
        "Job Title: Sales Development Representative (Co-op)",
        "Halcyon Freight Systems is hiring a Sales Development Representative to support outbound pipeline generation.",
      ].join("\n"),
    );

    expect(parsed.originalJobTitle.value).toBe(
      "Sales Development Representative (Co-op)",
    );
  });

  it("invents no title when the posting never names the role", () => {
    const parsed = parse(
      [
        "Overview",
        "",
        "We are a growing team and we are excited to welcome new people this year.",
        "",
        "About Us",
        "",
        "Lakeview Provisions is a food distribution business operating across Eastern Ontario.",
      ].join("\n"),
    );

    expect(parsed.originalJobTitle.value).toBeNull();
    expect(parsed.originalJobTitle.confidence).toBeNull();
  });
});
