import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Which pages each application write refreshes.
 *
 * Every surface here reads whole applications, so a write that changes one and
 * refreshes only the page the student happened to be on leaves the others
 * showing yesterday's answer until something else invalidates them. These
 * assertions are about that list and nothing else: what each mutation writes,
 * and which predicates protect it, are covered by the repository suites.
 */

/** `redirect()` throws in Next.js; this mirrors that so flow can be asserted. */
class RedirectError extends Error {
  constructor(public readonly destination: string) {
    super(`redirect:${destination}`);
  }
}

const getUser = vi.fn();
const createApplication = vi.fn();
const updateApplication = vi.fn();
const revalidatePath = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectError(destination);
  },
}));
vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => revalidatePath(path),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/applications/repository", () => ({
  createApplication: (...args: unknown[]) => createApplication(...args),
  updateApplication: (...args: unknown[]) => updateApplication(...args),
  deleteArchivedApplication: vi.fn(),
  setApplicationArchiveState: vi.fn(),
  setApplicationNextAction: vi.fn(),
  setApplicationStatus: vi.fn(),
}));

const { createApplicationAction, updateApplicationAction } = await import(
  "@/lib/applications/actions"
);
const { initialApplicationState } = await import("@/lib/applications/state");

const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const APPLICATION = "11111111-1111-4111-8111-111111111111";
const VERSION = "2026-08-20T10:00:00.000Z";

/** Every surface that reads a whole application. */
const SURFACES = ["/applications", "/pipeline", "/dashboard", "/analytics"];

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** The five fields the schema requires, and nothing else. */
function validValues(overrides: Record<string, string> = {}) {
  return {
    companyName: "RBC",
    originalJobTitle: "Business Analyst Intern",
    normalizedJobCategory: "Business Analysis",
    currentStatus: "Applied",
    workTermSeason: "Winter 2027",
    ...overrides,
  };
}

const refreshed = () =>
  revalidatePath.mock.calls.map((call) => call[0] as string);

beforeEach(() => {
  getUser.mockReset();
  createApplication.mockReset();
  updateApplication.mockReset();
  revalidatePath.mockReset();
  getUser.mockResolvedValue({ data: { user: USER }, error: null });
  createApplication.mockResolvedValue({ data: { id: APPLICATION }, error: null });
  updateApplication.mockResolvedValue({
    outcome: "updated",
    application: { id: APPLICATION },
  });
});

describe("saving a new application", () => {
  it("refreshes every surface that reads applications", async () => {
    const state = await createApplicationAction(
      initialApplicationState,
      form(validValues()),
    );

    expect(state.status).toBe("success");
    // A new application is a row on the list, a card in a column, a possible
    // follow-up on the dashboard, and a record in every analytics aggregate.
    for (const surface of SURFACES) expect(refreshed()).toContain(surface);
  });

  it("refreshes nothing when the record was not saved", async () => {
    createApplication.mockResolvedValue({ data: null, error: { code: "23505" } });

    const state = await createApplicationAction(
      initialApplicationState,
      form(validValues()),
    );

    expect(state.status).toBe("error");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes nothing when the form was rejected", async () => {
    const state = await createApplicationAction(
      initialApplicationState,
      form(validValues({ companyName: "" })),
    );

    expect(state.status).toBe("error");
    expect(createApplication).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saving the full edit form", () => {
  async function submit(overrides: Record<string, string> = {}) {
    try {
      await updateApplicationAction(
        APPLICATION,
        initialApplicationState,
        form(validValues({ expectedUpdatedAt: VERSION, ...overrides })),
      );
    } catch (error) {
      if (error instanceof RedirectError) return error.destination;
      throw error;
    }
    return null;
  }

  it("refreshes every surface, and both of the record's own routes", async () => {
    const destination = await submit();

    // The form can change any field these pages read, so which ones actually
    // changed is not worth inferring: all of them are refreshed.
    for (const surface of SURFACES) expect(refreshed()).toContain(surface);
    expect(refreshed()).toContain(`/applications/${APPLICATION}`);
    expect(refreshed()).toContain(`/applications/${APPLICATION}/edit`);
    expect(destination).toBe(`/applications/${APPLICATION}?updated=1`);
  });

  it("refreshes nothing when the write was refused", async () => {
    for (const outcome of ["conflict", "not_found", "error"]) {
      revalidatePath.mockReset();
      updateApplication.mockResolvedValue({ outcome });

      await submit();

      expect(revalidatePath).not.toHaveBeenCalled();
    }
  });

  it("refreshes nothing when the version is missing", async () => {
    const state = await updateApplicationAction(
      APPLICATION,
      initialApplicationState,
      form(validValues()),
    );

    // Optimistic concurrency is untouched by this change: without the expected
    // version there is no write, and so nothing to refresh.
    expect(state.status).toBe("error");
    expect(updateApplication).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
