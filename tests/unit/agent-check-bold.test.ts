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
      { index: 0, phrase: "10+" },
      { index: 0, phrase: "20" },
    ]);
  });

  it("flags a bold phrase that matches nothing in the posting", () => {
    const bullet = "Spearheaded a **Reddit visibility** program with a three-stage Claude workflow for SQL dashboards.";
    expect(boldProblems([bullet], RAMP, [])).toEqual([{ index: 0, phrase: "Reddit visibility" }]);
  });

  it("counts the fit read's mirror words as the posting's language", () => {
    const bullet = "Spearheaded a **Reddit visibility** program.";
    expect(boldProblems([bullet], RAMP, ["visibility"])).toEqual([]);
  });
});
