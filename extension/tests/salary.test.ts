import { describe, expect, it } from "vitest";
import { buildCaptureRecord } from "../src/capture.js";
import { extractJobReport, toExtractedJob } from "../src/extractor.js";
import { parseExplicitSalary } from "../src/salary.js";
import { jobPosting, jsonLd, page, readPage } from "./fixtures.js";

describe("explicit salary descriptions", () => {
  it.each([
    ["Salary: $25/hour", "$25 per hour"],
    ["Pay range: $22.50/hr–$27.25/hr", "$22.50–$27.25 per hour"],
    ["Salary: $60,000–$70,000", "$60,000–$70,000"],
    ["Salary: CAD 60,000–70,000 per year", "CAD 60,000–70,000 per year"],
    [
      "Salary: CAD $60,000 to $70,000 per year",
      "CAD 60,000–70,000 per year",
    ],
    [
      "Compensation range: £30,000–£35,000 annually",
      "£30,000–£35,000 per year",
    ],
  ])("normalizes %s", (description, expected) => {
    expect(parseExplicitSalary(description)).toEqual({
      state: "established",
      value: expected,
    });
  });

  it("keeps an overall base-pay range above subordinate rates", () => {
    const result = parseExplicitSalary(`
      The anticipated base pay range for this position is $23/hour to $33/hour.
      Second-year students: $23/hour
      Third-year students: $27/hour
      Fourth-year students: $30/hour
    `);

    expect(result).toEqual({ state: "established", value: "$23–$33 per hour" });
  });

  it("does not establish salary from a study-year pay table alone", () => {
    expect(
      parseExplicitSalary(
        "Second-year students: $23/hour\nThird-year students: $27/hour",
      ),
    ).toEqual({ state: "absent" });
  });

  it("deduplicates the same labelled range", () => {
    expect(
      parseExplicitSalary(
        "Salary range: $50,000-$60,000. Base salary range: $50,000 to $60,000.",
      ),
    ).toEqual({ state: "established", value: "$50,000–$60,000" });
  });

  it("refuses conflicting labelled ranges", () => {
    expect(
      parseExplicitSalary(
        "Salary range: $50,000–$60,000. Salary range: $55,000–$65,000.",
      ),
    ).toEqual({ state: "conflict" });
  });

  it("keeps a conflicting description salary out of the capture payload", () => {
    const report = extractJobReport(
      readPage(
        page(
          jsonLd(
            jobPosting({
              description:
                "Salary range: $50,000–$60,000. Salary range: $55,000–$65,000.",
            }),
          ),
        ),
      ),
    );
    const job = toExtractedJob(report);
    const record = buildCaptureRecord(job, {
      company: "IBM",
      jobTitle: "Business Technology Analyst Intern",
      status: "Interested",
    });

    expect(job.salary).toBeUndefined();
    expect(report.fields.salary).toMatchObject({
      state: "ambiguous",
      reason: "conflicting_evidence",
    });
    expect(record).not.toHaveProperty("salary");
  });

  it.each([
    "Signing bonus: $1,000",
    "Wellness allowance: $500",
    "Tuition reimbursement up to $5,000",
    "Relocation allowance of $2,000",
    "Internet stipend: $100/month",
    "Life insurance coverage of $50,000",
    "Eligible for a 10% annual bonus",
    "Overtime paid at $40/hour",
    "Travel reimbursement up to $1,500",
    "The company generated $5 billion in revenue",
  ])("does not treat %s as salary", (description) => {
    expect(parseExplicitSalary(description)).toEqual({ state: "absent" });
  });
});
