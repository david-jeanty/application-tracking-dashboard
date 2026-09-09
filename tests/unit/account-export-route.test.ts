import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAccountExport = vi.fn();
vi.mock("@/lib/account/export", () => ({
  buildAccountExport: (...args: unknown[]) => buildAccountExport(...args),
}));

const getUser = vi.fn();
const sessionSupabase = { auth: { getUser } };
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => sessionSupabase,
}));

const { GET } = await import("@/app/api/account/export/route");

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeEach(() => {
  buildAccountExport.mockReset();
  getUser.mockReset();
});

describe("GET /api/account/export", () => {
  it("refuses an unauthenticated request", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(buildAccountExport).not.toHaveBeenCalled();
  });

  it("scopes the export to the authenticated user's own id, never a client-supplied one", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({
      outcome: "exported",
      data: {
        exported_at: "2026-09-08T00:00:00.000Z",
        account: { id: USER_ID, email: "student@example.com" },
        profile: null,
        applications: [],
        application_status_history: [],
      },
    });

    await GET();

    expect(buildAccountExport).toHaveBeenCalledWith(
      sessionSupabase,
      USER_ID,
      "student@example.com",
    );
  });

  it("returns the export as an attachment with a JSON body", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({
      outcome: "exported",
      data: {
        exported_at: "2026-09-08T00:00:00.000Z",
        account: { id: USER_ID, email: "student@example.com" },
        profile: { full_name: "Alex Smith" },
        applications: [],
        application_status_history: [],
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(
      "interndex-data-export-",
    );
    const body = await response.json();
    expect(body.profile).toEqual({ full_name: "Alex Smith" });
  });

  it("returns 500 rather than a partial file when the export read fails", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });
    buildAccountExport.mockResolvedValue({ outcome: "error", message: "boom" });

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
