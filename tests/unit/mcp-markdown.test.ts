import { describe, expect, it } from "vitest";
import {
  formatJobDetail,
  formatJobList,
  formatSaveConfirmation,
  formatUpdateConfirmation,
} from "@/lib/mcp/markdown";
import type { JobDetail, JobSummary } from "@/lib/validation/mcp";

describe("formatSaveConfirmation", () => {
  it("renders the exact canonical shape for a fully-populated save", () => {
    const text = formatSaveConfirmation({
      title: "Business Analyst Intern",
      company: "RBC",
      status: "Applied",
      category: "Business Analysis",
      location: "Toronto, ON",
      workTerm: "Summer 2027",
      duration: "4 months",
      deadline: "2026-09-04",
      source: "LinkedIn",
      salary: "$22/hour",
      notes: "Referred by a classmate.\nRecruiter is Jane Smith.",
    });

    expect(text).toBe(
      [
        "Saved **Business Analyst Intern** at **RBC** as **Applied**.",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Company | RBC |",
        "| Title | Business Analyst Intern |",
        "| Status | Applied |",
        "| Category | Business Analysis |",
        "| Location | Toronto, ON |",
        "| Work term | Summer 2027 |",
        "| Duration | 4 months |",
        "| Deadline | 2026-09-04 |",
        "| Source | LinkedIn |",
        "| Salary | $22/hour |",
        "",
        "**Key details**",
        "",
        "- Referred by a classmate.",
        "- Recruiter is Jane Smith.",
      ].join("\n"),
    );
  });

  it("starts with the confirmation sentence, with no preface", () => {
    const text = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
    });

    expect(text.split("\n")[0]).toBe(
      "Saved **Marketing Student** at **Nokia** as **Interested**.",
    );
  });

  it("omits every row whose value is absent", () => {
    const text = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
      category: "Other",
    });

    expect(text).not.toContain("Location");
    expect(text).not.toContain("Work term");
    expect(text).not.toContain("Duration");
    expect(text).not.toContain("Source");
    expect(text).not.toContain("Salary");
  });

  it("omits the Key details section entirely when there are no notes", () => {
    const text = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
    });

    expect(text).not.toContain("Key details");
  });

  it("caps notes at four bullets, in order, and drops the rest", () => {
    const text = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
      notes: [
        "First note.",
        "Second note.",
        "Third note.",
        "Fourth note.",
        "Fifth note that must not appear.",
      ].join("\n"),
    });

    const bullets = text.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets).toEqual([
      "- First note.",
      "- Second note.",
      "- Third note.",
      "- Fourth note.",
    ]);
    expect(text).not.toContain("Fifth note");
  });

  it("never fabricates a note beyond what was supplied", () => {
    const text = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
      notes: "Only one real note.",
    });

    const bullets = text.split("\n").filter((line) => line.startsWith("- "));
    expect(bullets).toEqual(["- Only one real note."]);
  });

  it("adds the deadline follow-up line only when no deadline was saved", () => {
    const withoutDeadline = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
    });
    const withDeadline = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
      deadline: "2026-09-04",
    });

    expect(withoutDeadline).toContain("No deadline was listed.");
    expect(withDeadline).not.toContain("No deadline was listed.");
  });

  it("does not dump a full job description anywhere — the shape has no such field", () => {
    const text = formatSaveConfirmation({
      title: "Marketing Student",
      company: "Nokia",
      status: "Interested",
      notes: "A short, specific note.",
    });

    // The formatter's fields type carries no job-description input at all,
    // so there is no code path here that could echo one back.
    expect(text.length).toBeLessThan(400);
  });

  it("escapes a pipe in a field value so the table stays well-formed", () => {
    const text = formatSaveConfirmation({
      title: "Analyst | Intern",
      company: "A | B Corp",
      status: "Interested",
    });

    expect(text).toContain("| A \\| B Corp |");
    expect(text).toContain("Analyst \\| Intern");
  });
});

describe("formatUpdateConfirmation", () => {
  it("lists only the fields that changed, as their new value", () => {
    const text = formatUpdateConfirmation({
      title: "Business Analyst Intern",
      company: "RBC",
      changed: [
        { field: "status", from: "Applied", to: "Interview" },
        { field: "notes", from: null, to: "Phone screen booked" },
      ],
    });

    expect(text).toBe(
      [
        "Updated **Business Analyst Intern** at **RBC**.",
        "",
        "| Field | Value |",
        "| --- | --- |",
        "| Status | Interview |",
        "| Notes | Phone screen booked |",
      ].join("\n"),
    );
  });

  it("reports a cleared field without inventing a replacement value", () => {
    const text = formatUpdateConfirmation({
      title: "Business Analyst Intern",
      company: "RBC",
      changed: [{ field: "salary", from: "$22/hour", to: null }],
    });

    expect(text).toContain("| Salary | Cleared |");
  });

  it("says plainly that nothing changed rather than rendering an empty table", () => {
    const text = formatUpdateConfirmation({
      title: "Business Analyst Intern",
      company: "RBC",
      changed: [],
    });

    expect(text).toBe(
      "No fields changed on **Business Analyst Intern** at **RBC**.",
    );
  });
});

describe("formatJobList", () => {
  const summary = (overrides: Partial<JobSummary> = {}): JobSummary => ({
    application_id: "id-1",
    company: "RBC",
    job_title: "Business Analyst",
    status: "Applied",
    work_term: "Summer 2027",
    location: "Toronto, ON",
    deadline: "2026-09-04",
    date_applied: "2026-08-22",
    archived: false,
    ...overrides,
  });

  it("renders a compact table of only the applications given", () => {
    const text = formatJobList(
      [
        summary(),
        summary({
          application_id: "id-2",
          company: "Shopify",
          job_title: "Product Analyst",
          status: "Interested",
          work_term: "Fall 2026",
          deadline: null,
        }),
      ],
      false,
    );

    expect(text).toBe(
      [
        "**2** applications found.",
        "",
        "| Company | Title | Status | Work term | Deadline |",
        "| --- | --- | --- | --- | --- |",
        "| RBC | Business Analyst | Applied | Summer 2027 | 2026-09-04 |",
        "| Shopify | Product Analyst | Interested | Fall 2026 | — |",
      ].join("\n"),
    );
  });

  it("says plainly there are none rather than rendering an empty-state widget", () => {
    expect(formatJobList([], false)).toBe("No applications found.");
  });

  it("adds a note when more applications matched than were shown", () => {
    const text = formatJobList([summary()], true);

    expect(text).toContain(
      "More applications matched than shown — narrow the filters or raise the limit.",
    );
  });

  it("never mentions an application that was not in the list", () => {
    const text = formatJobList([summary({ company: "RBC" })], false);

    expect(text).not.toContain("Shopify");
  });
});

describe("formatJobDetail", () => {
  const detail = (overrides: Partial<JobDetail> = {}): JobDetail => ({
    application_id: "id-1",
    company: "RBC",
    company_domain: "rbc.com",
    job_title: "Business Analyst",
    status: "Applied",
    category: "Business Analysis",
    work_arrangement: "Hybrid",
    location: "Toronto, ON",
    work_term: "Summer 2027",
    duration: "4 months",
    job_url: "https://jobs.rbc.com/example",
    source: "LinkedIn",
    job_description: "Full posting text.",
    deadline: "2026-09-04",
    date_applied: "2026-08-22",
    salary: null,
    notes: "Referred by a classmate.",
    next_action: null,
    next_action_due_date: null,
    archived: false,
    created_at: "2026-08-20T10:00:00.000Z",
    updated_at: "2026-08-22T10:00:00.000Z",
    ...overrides,
  });

  it("opens with a readable summary sentence", () => {
    const text = formatJobDetail(detail());

    expect(text.split("\n")[0]).toBe(
      "**Business Analyst** at **RBC** — **Applied**.",
    );
  });

  it("includes the full job description and notes, verbatim, as their own sections", () => {
    const text = formatJobDetail(
      detail({ job_description: "A very long posting.", notes: "A note." }),
    );

    expect(text).toContain("**Job description**\n\nA very long posting.");
    expect(text).toContain("**Notes**\n\nA note.");
  });

  it("omits the description and notes sections when neither is stored", () => {
    const text = formatJobDetail(detail({ job_description: null, notes: null }));

    expect(text).not.toContain("Job description");
    expect(text).not.toContain("Notes");
  });
});
