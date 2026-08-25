import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createApplications } from "@/lib/applications/repository";
import type { ApplicationCreationInput } from "@/lib/validation/application";

type Call = { method: string; args: unknown[] };

/**
 * A stand-in PostgREST builder that records the chain instead of writing.
 *
 * This asserts the statement the bulk creation *builds*: that one insert
 * carries every row, which columns come back, and which columns it never
 * mentions. Whether Postgres then applies that insert atomically is the
 * database's own guarantee about a single statement, not something a unit test
 * can observe.
 */
function recordingClient(result: { data?: unknown; error?: unknown } = {}) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  const record = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return builder;
  };

  for (const method of ["insert", "select"]) builder[method] = record(method);
  builder.returns = () =>
    Promise.resolve({
      data: "data" in result ? result.data : [],
      error: result.error ?? null,
    });

  const client = {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return builder;
    },
  } as unknown as SupabaseClient;

  return { client, calls, find: (method: string) => calls.filter((call) => call.method === method) };
}

function input(
  overrides: Partial<ApplicationCreationInput> = {},
): ApplicationCreationInput {
  return {
    companyName: "RBC",
    originalJobTitle: "Business Analyst Intern",
    normalizedJobCategory: "Business Analysis",
    currentStatus: "Applied",
    workTermSeason: "Winter 2027",
    location: "Toronto, ON",
    workArrangement: "Hybrid",
    dateApplied: "2026-08-12",
    applicationSource: "LinkedIn",
    ...overrides,
  } as ApplicationCreationInput;
}

describe("creating many applications is one statement", () => {
  it("sends every row in a single insert", async () => {
    const recorder = recordingClient();

    await createApplications(recorder.client, [
      input({ companyName: "RBC" }),
      input({ companyName: "Shopify" }),
      input({ companyName: "Telus" }),
    ]);

    // One `from`, one `insert`, and the insert's argument is the whole batch.
    expect(recorder.find("from")).toHaveLength(1);
    expect(recorder.find("insert")).toHaveLength(1);
    expect(recorder.find("insert")[0].args[0]).toHaveLength(3);
    expect(recorder.find("from")[0].args[0]).toBe("applications");
  });

  it("returns what it wrote without a follow-up read", async () => {
    const recorder = recordingClient();

    await createApplications(recorder.client, [input()]);

    // The identifiers come back from the insert itself, so naming a batch of
    // twenty-five costs no second query.
    expect(recorder.find("select")).toHaveLength(1);
    expect(recorder.find("select")[0].args[0]).toBe(
      "id,company_name,original_job_title",
    );
  });

  it("never writes an owner column, so the token decides ownership", async () => {
    const recorder = recordingClient();

    await createApplications(recorder.client, [input(), input()]);

    const rows = recorder.find("insert")[0].args[0] as Record<string, unknown>[];
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("user_id");
      expect(Object.keys(row)).not.toContain("id");
      expect(Object.keys(row)).not.toContain("created_at");
      expect(Object.keys(row)).not.toContain("archived_at");
    }
  });

  it("builds each row with the mapper every other write uses", async () => {
    const recorder = recordingClient();

    await createApplications(recorder.client, [
      input({ location: undefined, workArrangement: undefined }),
    ]);

    const [row] = recorder.find("insert")[0].args[0] as Record<string, unknown>[];
    expect(row.company_name).toBe("RBC");
    expect(row.current_status).toBe("Applied");
    // The same defaults a web-form save takes, because it is the same mapper.
    expect(row.location).toBe("Not specified");
    expect(row.work_arrangement).toBe("Unknown");
  });

  it("passes a database failure back as one failure", async () => {
    const recorder = recordingClient({ data: null, error: { code: "23514" } });

    const { data, error } = await createApplications(recorder.client, [input()]);

    expect(data).toBeNull();
    expect(error).toEqual({ code: "23514" });
  });

  it("goes through no service-role client", () => {
    const repository = readFileSync("lib/applications/repository.ts", "utf8");
    const bearer = readFileSync("lib/supabase/bearer.ts", "utf8");

    // Every MCP query runs as the token's own user; row-level security stays
    // the enforcing boundary for the import exactly as for everything else.
    for (const file of [repository, bearer]) {
      expect(file).not.toContain("SERVICE_ROLE");
      expect(file).not.toContain("service_role");
    }
  });
});
