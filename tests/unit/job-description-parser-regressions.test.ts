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

/**
 * The block below pins failures observed on real pasted postings. The wording
 * is synthetic; only the structural pattern that caused each failure is kept.
 */
describe("real-posting format regressions", () => {
  it("reads a company named by an appositive opener", () => {
    // "<Company>, a global leader in ..." produced no company at all.
    const parsed = parse(
      "Meridian Talent Cloud, a global leader in human capital management software, partners with employers across North America.",
    );

    expect(parsed.companyName.value).toBe("Meridian Talent Cloud");
  });

  it("reads a company from a career-at opener without swallowing the sentence", () => {
    const parsed = parse("A career at Larkfield Rail Systems will help create a legacy.");

    expect(parsed.companyName.value).toBe("Larkfield Rail Systems");
  });

  it("reads a legal name introducing its acronym", () => {
    const parsed = parse(
      [
        "About Us",
        "",
        "Northgate Lottery & Gaming Corporation (NLGC) operates province-wide lottery and gaming entertainment.",
      ].join("\n"),
    );

    expect(parsed.companyName.value).toBe("Northgate Lottery & Gaming Corporation");
  });

  it("never promotes employment metadata to a job title", () => {
    // "Type: Student Full Time" was returned as the title at High confidence:
    // short, title-case, and carrying the role word "Student".
    const parsed = parse(
      [
        "Student Opportunities",
        "Location: Toronto (Onsite)",
        "Duration: Fall (September - December 2026)",
        "Type: Student Full Time",
        "Range: $18.50 - $28.50",
      ].join("\n"),
    );

    expect(parsed.originalJobTitle.value).toBeNull();
    expect(parsed.originalJobTitle.confidence).toBeNull();
  });

  it("abstains rather than promoting a responsibility bullet to a title", () => {
    const parsed = parse(
      [
        "Student Opportunities",
        "",
        "Responsibilities",
        "",
        "- Support brand marketing campaign planning and creative reviews",
        "- Conduct market research and competitive analysis",
      ].join("\n"),
    );

    expect(parsed.originalJobTitle.value).toBeNull();
  });

  it("ignores vocabulary from accommodation and privacy boilerplate", () => {
    // "Human Resources" appears only in the accommodation and privacy notices,
    // and out-scored the marketing content that describes the actual role.
    const parsed = parse(
      [
        "About the Opportunity",
        "",
        "Our marketing and strategy team is looking for a student to support brand campaign planning and go-to-market analysis.",
        "",
        "Responsibilities",
        "",
        "- Support brand marketing campaign planning and creative reviews",
        "",
        "Accessibility and Accommodation",
        "",
        "If you require accommodation, please contact Human Resources. Our Human Resources team will work with you.",
        "",
        "Privacy Notice",
        "",
        "Personal information is handled by Human Resources for recruitment purposes.",
      ].join("\n"),
    );

    expect(parsed.normalizedJobCategory.value).toBe("Marketing");
  });

  it("prefers a labelled location over a headquarters city named in prose", () => {
    // The head-office city was reported as the job location at High confidence,
    // overriding an explicit "Location: Virtual" label.
    const parsed = parse(
      [
        "Job Title: Product & AI Intern",
        "Location: Virtual",
        "",
        "Our global headquarters is located in Toronto, ON.",
      ].join("\n"),
    );

    expect(parsed.location.value).toBe("Virtual");
    expect(parsed.workArrangement.value).toBe("Remote");
  });

  it("treats a hashtag arrangement tag as supporting evidence", () => {
    const parsed = parse(["Data Analyst Intern", "", "#li-remote"].join("\n"));

    expect(parsed.workArrangement.value).toBe("Remote");
  });

  it("does not read 'virtual' as remote when it is part of a longer phrase", () => {
    const parsed = parse(
      [
        "Software Developer Intern",
        "Location: Calgary, AB",
        "You will build virtual machine tooling for our virtual desktop platform.",
      ].join("\n"),
    );

    expect(parsed.workArrangement.value).not.toBe("Remote");
    expect(parsed.location.value).toBe("Calgary, AB");
  });

  it("assembles a structured multiline pay block", () => {
    // The block carries no dollar sign, so every salary pattern missed it and
    // the whole compensation section read as absent.
    const parsed = parse(
      [
        "Pay Type",
        "Hourly",
        "Hiring Min Rate",
        "28.20 CAD",
        "Hiring Max Rate",
        "32.30 CAD",
      ].join("\n"),
    );

    expect(parsed.salary.value).toBe("28.20–32.30 CAD per hour");
  });

  it("preserves the currency code and pay period in a stated range", () => {
    // "$23-$30 CAD hourly" was truncated to "$23-$30".
    expect(parse("Pay Details: $23-$30 CAD hourly").salary.value).toBe(
      "$23-$30 CAD hourly",
    );
    expect(parse("Salary: $62,000 - $68,000 per year").salary.value).toBe(
      "$62,000 - $68,000 per year",
    );
  });

  it("infers a four-month term from a dated month range", () => {
    // Day numbers between the month names defeated the month-range rule.
    const parsed = parse("Work Term: Fall 2026 - September 8th through December 31st");

    expect(parsed.workTermDuration.value).toBe("4 months");
    expect(parsed.workTermSeason.value).toBe("Fall 2026");
  });

  it("names a cross-year placement for its start, never its end", () => {
    // A September 2026 - August 2027 placement was labelled "Summer 2027",
    // the term the student never applied to.
    const parsed = parse(
      "Start and End Dates: September 2026 - August 2027 (8 or 12 months)",
    );

    expect(parsed.workTermSeason.value).toBe("Fall 2026");
    expect(parsed.workTermDuration.value).toBe("8 or 12 months");
  });

  it("treats 'Open until filled' as no deadline at all", () => {
    const parsed = parse("Application Deadline: Open until filled");

    expect(parsed.applicationDeadline.value).toBeNull();
    expect(parsed.applicationDeadline.confidence).toBeNull();
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
