import { describe, expect, it } from "vitest";
import { boldProblems } from "@/lib/agent/checks/bold";

/** Ramp's Risk Strategy Intern posting, in its own words. */
const RAMP = [
  "Analyze transaction and customer data with SQL to detect fraud and credit risk",
  "Build dashboards and metrics that monitor risk across the portfolio",
  "Partner with operations and engineering to improve risk processes",
];

describe("boldProblems", () => {
  it("passes bold that mirrors the posting's words", () => {
    const bullet = "Eliminated manual weekly summaries by developing a **Power BI dashboard** over 5M+ records with scheduled **SQL** snapshots.";
    expect(boldProblems([bullet], RAMP, [])).toEqual([]);
  });

  it("passes a bold number in a bullet that proves a requirement", () => {
    const bullet = "Built SQL dashboards over **5M+** records that monitor ticket metrics across 50+ sites.";
    expect(boldProblems([bullet], RAMP, [])).toEqual([]);
  });

  it("flags bold numbers in a bullet the posting does not ask about", () => {
    const bullet = "Delivered **10+** events a year and onboarded **20** new members into their roles.";
    expect(boldProblems([bullet], RAMP, [])).toEqual([
      { index: 0, phrase: "10+", reason: "no_match" },
      { index: 0, phrase: "20", reason: "no_match" },
    ]);
  });

  it("flags a bold phrase that matches nothing in the posting", () => {
    const bullet = "Spearheaded a **Reddit visibility** program with a three-stage Claude workflow for SQL dashboards.";
    expect(boldProblems([bullet], RAMP, [])).toEqual([{ index: 0, phrase: "Reddit visibility", reason: "no_match" }]);
  });

  it("counts the fit read's mirror words as the posting's language", () => {
    const bullet = "Spearheaded a **Reddit visibility** program.";
    expect(boldProblems([bullet], RAMP, ["visibility"])).toEqual([]);
  });
});

describe("boldProblems with requirement phrases", () => {
  /** David's example phrases (decision record 0023). */
  const PHRASES = ["led a group project", "assessed client data governance"];

  it("passes a bold span that answers a phrase", () => {
    const bullet = "**Led the team's client-aligned workstreams** by drafting the project scope for the engagement.";
    expect(boldProblems([bullet], [], [], PHRASES)).toEqual([]);
  });

  it("flags an isolated noun, even one the posting uses", () => {
    const bullet = "Split the **team** into client-aligned workstreams.";
    expect(boldProblems([bullet], ["Lead a team"], ["team"], PHRASES)).toEqual([{ index: 0, phrase: "team", reason: "no_phrase" }]);
  });

  it("flags a bare number", () => {
    const bullet = "Assessed the client's donation CRM, identifying **20** gaps in donor data handling.";
    expect(boldProblems([bullet], [], [], PHRASES)).toEqual([{ index: 0, phrase: "20", reason: "no_phrase" }]);
  });

  it("passes a number inside the span that answers the phrase", () => {
    const bullet = "**Assessed the client's data governance**, identifying 20 gaps in how donor data is handled.";
    expect(boldProblems([bullet], [], [], PHRASES)).toEqual([]);
  });

  it("flags a noun phrase that answers no phrase", () => {
    const bullet = "Structured the engagement and proposed **client-aligned workstreams**.";
    expect(boldProblems([bullet], [], [], PHRASES)).toEqual([
      { index: 0, phrase: "client-aligned workstreams", reason: "no_phrase" },
    ]);
  });

  it("flags a span longer than eight words", () => {
    const bullet = "**Led the team through a client engagement by drafting the project scope**.";
    expect(boldProblems([bullet], [], [], PHRASES)).toEqual([
      { index: 0, phrase: "Led the team through a client engagement by drafting the project scope", reason: "too_long" },
    ]);
  });

  it("allows at most five spans on the resume", () => {
    const bullet = "**Led a group project** for a client.";
    const problems = boldProblems(Array.from({ length: 6 }, () => bullet), [], [], PHRASES);
    expect(problems).toEqual([{ index: 5, phrase: "Led a group project", reason: "too_many" }]);
  });
});
