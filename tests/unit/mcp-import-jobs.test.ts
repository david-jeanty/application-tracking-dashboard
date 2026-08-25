import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toApplicationInsert } from "@/lib/applications/mapper";
import { runImportJobs } from "@/lib/mcp/import-jobs";
import {
  IMPORT_JOBS_MAXIMUM_BATCH,
  importJobsInputSchema,
  newJobRecordSchema,
  type NewJobRecord,
} from "@/lib/validation/mcp";

const createApplications = vi.fn();

const deps = { createApplications: (...args: never[]) =>
  createApplications(...args) } as unknown as {
  createApplications: Parameters<typeof runImportJobs>[1]["createApplications"];
};

function record(overrides: Partial<NewJobRecord> = {}): NewJobRecord {
  return {
    company: "RBC",
    job_title: "Business Analyst Intern",
    status: "Applied",
    category: "Business Analysis",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    date_applied: "2026-08-12",
    source: "LinkedIn",
    work_term: "Winter 2027",
    notes: "Imported from previous tracker.",
    ...overrides,
  };
}

/** What the bulk insert hands back: the columns the statement returns. */
function created(records: NewJobRecord[]) {
  return {
    data: records.map((item, index) => ({
      id: `9999999${index}-9999-4999-8999-999999999999`,
      company_name: item.company,
      original_job_title: item.job_title,
    })),
    error: null,
  };
}

beforeEach(() => {
  createApplications.mockReset();
  createApplications.mockImplementation(async () => created([record()]));
});

describe("the import batch contract", () => {
  it("rejects a call carrying no applications at all", () => {
    expect(importJobsInputSchema.safeParse({ applications: [] }).success).toBe(
      false,
    );
    expect(importJobsInputSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a full batch and rejects one application beyond it", () => {
    const batch = (size: number) =>
      importJobsInputSchema.safeParse({
        applications: Array.from({ length: size }, () => record()),
      }).success;

    expect(batch(1)).toBe(true);
    expect(batch(IMPORT_JOBS_MAXIMUM_BATCH)).toBe(true);
    expect(batch(IMPORT_JOBS_MAXIMUM_BATCH + 1)).toBe(false);
  });

  it("carries the same record schema save_job takes one of", () => {
    const applications = importJobsInputSchema.shape.applications;
    expect(applications.element).toBe(newJobRecordSchema);
  });

  it("has no user_id argument, so ownership cannot be requested", () => {
    expect(Object.keys(importJobsInputSchema.shape)).toEqual(["applications"]);
    expect(Object.keys(newJobRecordSchema.shape)).not.toContain("user_id");
  });

  it("accepts JobTrack's own statuses, including a terminal one", () => {
    for (const status of ["Applied", "Assessment", "Interview", "Offer", "Rejected"]) {
      expect(newJobRecordSchema.safeParse(record({ status: status as never })).success).toBe(
        true,
      );
    }
  });

  it("rejects the free-text statuses a spreadsheet actually contains", () => {
    // These are interpretation problems, and they belong to the assistant and
    // the student. A tracker that quietly mapped "Ghosted" to something would
    // be inventing a fact about an employer.
    for (const status of ["OA", "Interviewing", "Ghosted", "Submitted", "Phone Screen"]) {
      expect(
        newJobRecordSchema.safeParse(record({ status: status as never })).success,
      ).toBe(false);
    }
  });

  it("accepts an ISO date and rejects an ambiguous one", () => {
    expect(newJobRecordSchema.safeParse(record({ date_applied: "2026-08-12" })).success).toBe(
      true,
    );
    // 03/04/2026 is March 4th or April 3rd depending on whose spreadsheet it
    // is. JobTrack must never be the one guessing.
    for (const ambiguous of ["03/04/2026", "12/08/2026", "Aug 12 2026", "2026/08/12"]) {
      expect(
        newJobRecordSchema.safeParse(record({ date_applied: ambiguous })).success,
      ).toBe(false);
    }
  });
});

describe("a batch is validated before anything is written", () => {
  it("writes nothing when one record in the middle is invalid", async () => {
    const applications = [
      record({ company: "RBC" }),
      record({ company: "Shopify" }),
      // A due date describing no action: the same rule the web form obeys.
      record({ company: "Deloitte", next_action_due_date: "2026-09-04" }),
      record({ company: "Telus" }),
    ];

    const result = await runImportJobs({ applications }, deps);

    expect(result.outcome).toBe("invalid");
    expect(createApplications).not.toHaveBeenCalled();
  });

  it("names the record that failed, by position and by identity", async () => {
    const applications = Array.from({ length: 17 }, (_, index) =>
      record({ company: `Employer ${index}` }),
    );
    applications[16] = record({
      company: "RBC",
      job_title: "Business Analyst Intern",
      next_action_due_date: "2026-09-04",
    });

    const result = await runImportJobs({ applications }, deps);

    expect(result.outcome === "invalid" && result.message).toBe(
      "Import record 17 (RBC — Business Analyst Intern) could not be validated: Next action due date requires a next action.",
    );
  });

  it("validates through the same schema the website uses", async () => {
    // Not a second set of import rules: a company name too long for the web
    // form is too long for an import.
    const result = await runImportJobs(
      { applications: [record({ company: "R".repeat(161) })] },
      deps,
    );

    expect(result.outcome).toBe("invalid");
    expect(result.outcome === "invalid" && result.message).toContain(
      "Import record 1",
    );
    expect(createApplications).not.toHaveBeenCalled();
  });
});

describe("a valid batch is one write", () => {
  it("calls the bulk creation once, with every record", async () => {
    const applications = [
      record({ company: "RBC" }),
      record({ company: "Shopify" }),
      record({ company: "Telus" }),
    ];
    createApplications.mockResolvedValue(created(applications));

    await runImportJobs({ applications }, deps);

    // One statement for the batch. Not three inserts, and not a Promise.all.
    expect(createApplications).toHaveBeenCalledTimes(1);
    expect(createApplications.mock.calls[0][0]).toHaveLength(3);
  });

  it("takes no user id from the caller, and offers none to the repository", async () => {
    const applications = [record()];
    createApplications.mockResolvedValue(created(applications));

    await runImportJobs({ applications }, deps);

    // The repository call is the validated records and nothing else: identity
    // was applied to the bound repository before this runner was reached.
    expect(createApplications.mock.calls[0]).toHaveLength(1);
    for (const input of createApplications.mock.calls[0][0]) {
      expect(Object.keys(input)).not.toContain("userId");
      expect(Object.keys(input)).not.toContain("user_id");
    }
  });

  it("reports how many were imported, and names each one", async () => {
    const applications = [
      record({ company: "RBC", job_title: "Business Analyst Intern" }),
      record({ company: "Shopify", job_title: "Revenue Operations Intern" }),
    ];
    createApplications.mockResolvedValue(created(applications));

    const result = await runImportJobs({ applications }, deps);

    expect(result.outcome).toBe("imported");
    if (result.outcome !== "imported") return;

    expect(result.applications).toHaveLength(2);
    expect(result.applications[0].company).toBe("RBC");
    expect(result.applications[0].job_title).toBe("Business Analyst Intern");
    expect(result.applications[0].application_id).toBeTypeOf("string");
    // Nothing about who owns them.
    expect(Object.keys(result.applications[0])).toEqual([
      "application_id",
      "company",
      "job_title",
    ]);
  });

  it("reports one failure for the whole batch when the write fails", async () => {
    createApplications.mockResolvedValue({ data: null, error: { code: "23514" } });

    const result = await runImportJobs(
      { applications: [record(), record({ company: "Shopify" })] },
      deps,
    );

    expect(result).toEqual({ outcome: "error", code: "23514" });
  });
});

describe("imported history is what the student actually recorded", () => {
  it("stores the status the application is at now, with no earlier stages", async () => {
    const applications = [
      record({
        company: "Deloitte",
        job_title: "Consulting Intern",
        status: "Interview",
        date_applied: "2026-08-03",
      }),
    ];
    createApplications.mockResolvedValue(created(applications));

    await runImportJobs({ applications }, deps);

    const [written] = createApplications.mock.calls[0][0];
    const insert = toApplicationInsert(written);

    // An application may begin its life in JobTrack at Interview. What it is
    // not given is a manufactured Applied → Screening → Assessment trail.
    expect(insert.current_status).toBe("Interview");
    expect(insert.date_applied).toBe("2026-08-03");
    expect(Object.keys(insert)).not.toContain("created_at");
    expect(Object.keys(insert)).not.toContain("previous_status");
  });

  it("may begin at an outcome the search already reached", async () => {
    for (const status of ["Offer", "Rejected", "Accepted", "Withdrawn"] as const) {
      const applications = [record({ status })];
      createApplications.mockResolvedValue(created(applications));

      const result = await runImportJobs({ applications }, deps);

      expect(result.outcome).toBe("imported");
      expect(
        toApplicationInsert(createApplications.mock.calls.at(-1)![0][0])
          .current_status,
      ).toBe(status);
    }
  });

  it("gives an omitted field the same default a web-form save would", async () => {
    const applications = [
      { company: "Nokia", job_title: "Marketing Student" } as NewJobRecord,
    ];
    createApplications.mockResolvedValue(created(applications));

    await runImportJobs({ applications }, deps);

    const insert = toApplicationInsert(createApplications.mock.calls[0][0][0]);
    expect(insert.current_status).toBe("Interested");
    expect(insert.normalized_job_category).toBe("Other");
    expect(insert.work_arrangement).toBe("Unknown");
    expect(insert.work_term_season).toBe("Not specified");
    expect(insert.location).toBe("Not specified");
    expect(insert.date_applied).toBeNull();
    expect(insert.next_action).toBeNull();
  });

  it("contains no status-history write anywhere in the import path", () => {
    // History is the database's job. The trigger records that the application
    // entered JobTrack at the status it arrived at, and nothing in this path
    // may add to that. The repository does read that table elsewhere — for the
    // lifecycle rail — so what is asserted is that nothing writes to it.
    for (const path of [
      "lib/mcp/import-jobs.ts",
      "lib/mcp/tools.ts",
      "lib/applications/repository.ts",
    ]) {
      const file = readFileSync(path, "utf8");
      expect(file).not.toMatch(
        /application_status_history"\)\s*\.(insert|upsert|update|delete)/,
      );
    }

    // And the two files that make up the import path do not name it at all.
    for (const path of ["lib/mcp/import-jobs.ts", "lib/mcp/tools.ts"]) {
      expect(readFileSync(path, "utf8")).not.toContain(
        "application_status_history",
      );
    }
  });

  it("never reads or merges an existing record while importing", () => {
    const importPath = readFileSync("lib/mcp/import-jobs.ts", "utf8");

    // Duplicate review belongs to the assistant and the student. There is no
    // lookup, no similarity comparison, and no silent skip in the write.
    expect(importPath).not.toContain("listApplications");
    expect(importPath).not.toContain("getApplication");
  });
});
