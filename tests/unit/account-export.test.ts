import { describe, expect, it, vi } from "vitest";
import { buildAccountExport } from "@/lib/account/export";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function supabaseStub({
  profile = { user_id: USER_ID, full_name: "Alex Smith" },
  applications = [{ id: "app-1", user_id: USER_ID, company_name: "Nokia" }],
  history = [{ application_id: "app-1", user_id: USER_ID, new_status: "Applied" }],
  profileError = null,
  applicationsError = null,
  historyError = null,
}: {
  profile?: unknown;
  applications?: unknown[];
  history?: unknown[];
  profileError?: { message: string } | null;
  applicationsError?: { message: string } | null;
  historyError?: { message: string } | null;
} = {}) {
  const eqCalls: { table: string; column: string; value: unknown }[] = [];

  function table(name: string, result: { data: unknown; error: unknown }) {
    return {
      select: () => ({
        eq: (column: string, value: unknown) => {
          eqCalls.push({ table: name, column, value });
          return {
            maybeSingle: () => Promise.resolve(result),
            // Makes the return value of `.eq(...)` itself awaitable, matching
            // the real query builder `Promise.all` relies on for the
            // applications and history reads, which chain no further call.
            then: (resolve: (value: typeof result) => void) => resolve(result),
          };
        },
      }),
    };
  }

  const from = vi.fn((name: string) => {
    if (name === "profiles") {
      return table(name, { data: profile, error: profileError });
    }
    if (name === "applications") {
      return table(name, { data: applications, error: applicationsError });
    }
    if (name === "application_status_history") {
      return table(name, { data: history, error: historyError });
    }
    throw new Error(`Unexpected table: ${name}`);
  });

  return { from: (name: string) => from(name), eqCalls };
}

describe("buildAccountExport", () => {
  it("scopes every table read to the authenticated user's own id", async () => {
    const supabase = supabaseStub();

    await buildAccountExport(supabase as never, USER_ID, "student@example.com");

    expect(supabase.eqCalls.every((call) => call.column === "user_id")).toBe(true);
    expect(supabase.eqCalls.every((call) => call.value === USER_ID)).toBe(true);
    expect(supabase.eqCalls.map((call) => call.table).sort()).toEqual(
      ["application_status_history", "applications", "profiles"].sort(),
    );
  });

  it("assembles the profile, applications, and history into one export", async () => {
    const supabase = supabaseStub();

    const result = await buildAccountExport(
      supabase as never,
      USER_ID,
      "student@example.com",
    );

    expect(result.outcome).toBe("exported");
    if (result.outcome !== "exported") throw new Error("unreachable");
    expect(result.data.account).toEqual({ id: USER_ID, email: "student@example.com" });
    expect(result.data.profile).toEqual({ user_id: USER_ID, full_name: "Alex Smith" });
    expect(result.data.applications).toHaveLength(1);
    expect(result.data.application_status_history).toHaveLength(1);
    expect(typeof result.data.exported_at).toBe("string");
  });

  it("reports an error rather than a partial export when any read fails", async () => {
    const supabase = supabaseStub({
      applicationsError: { message: "connection reset" },
    });

    const result = await buildAccountExport(
      supabase as never,
      USER_ID,
      "student@example.com",
    );

    expect(result).toEqual({ outcome: "error", message: "connection reset" });
  });
});
