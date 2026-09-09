import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteOwnAccount = vi.fn();
const createAdminClient = vi.fn();

vi.mock("@/lib/account/delete-account", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/account/delete-account")
  >("@/lib/account/delete-account");
  return {
    ...actual,
    deleteOwnAccount: (...args: unknown[]) => deleteOwnAccount(...args),
  };
});

const sessionSupabase = {
  auth: {
    getUser: vi.fn(),
    signOut: vi.fn(),
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => sessionSupabase,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: (...args: unknown[]) => createAdminClient(...args),
}));

const { POST } = await import("@/app/api/account/delete/route");

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SITE_ORIGIN = "http://localhost:3000";

function request(
  body: unknown,
  { origin, contentType = "application/json" }: { origin?: string; contentType?: string } = {},
) {
  return new Request(`${SITE_ORIGIN}/api/account/delete`, {
    method: "POST",
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
      ...(origin !== undefined ? { origin } : { origin: SITE_ORIGIN }),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  deleteOwnAccount.mockReset();
  createAdminClient.mockReset();
  createAdminClient.mockReturnValue({ auth: { admin: { deleteUser: vi.fn() } } });
  process.env.NEXT_PUBLIC_SITE_URL = SITE_ORIGIN;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example-project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_123456789012345678901234567890";
});

describe("POST /api/account/delete request hygiene", () => {
  it("rejects a cross-origin request before touching the session", async () => {
    const response = await POST(
      request(
        { userId: USER_ID, password: "x" },
        { origin: "https://evil.example.com" },
      ),
    );

    expect(response.status).toBe(403);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON content type", async () => {
    const response = await POST(
      request({ userId: USER_ID, password: "x" }, { contentType: "text/plain" }),
    );

    expect(response.status).toBe(400);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("{not json"));

    expect(response.status).toBe(400);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });

  it("rejects a body that fails schema validation", async () => {
    const response = await POST(request({ userId: "not-a-uuid", password: "x" }));

    expect(response.status).toBe(400);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });
});

describe("POST /api/account/delete outcome mapping", () => {
  it("maps a forbidden outcome (different authenticated user) to 403", async () => {
    deleteOwnAccount.mockResolvedValue({ outcome: "forbidden" });

    const response = await POST(request({ userId: USER_ID, password: "x" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ status: "forbidden" });
  });

  it("maps unauthenticated to 401", async () => {
    deleteOwnAccount.mockResolvedValue({ outcome: "unauthenticated" });

    const response = await POST(request({ userId: USER_ID, password: "x" }));

    expect(response.status).toBe(401);
  });

  it("maps invalid_password to 401", async () => {
    deleteOwnAccount.mockResolvedValue({ outcome: "invalid_password" });

    const response = await POST(request({ userId: USER_ID, password: "x" }));

    expect(response.status).toBe(401);
  });

  it("maps a successful deletion to 200", async () => {
    deleteOwnAccount.mockResolvedValue({ outcome: "deleted" });

    const response = await POST(request({ userId: USER_ID, password: "x" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "deleted" });
  });

  it("returns 500 without ever calling deleteOwnAccount when the admin key is not configured", async () => {
    createAdminClient.mockImplementation(() => {
      throw new Error("SUPABASE_SECRET_KEY is not configured.");
    });

    const response = await POST(request({ userId: USER_ID, password: "x" }));

    expect(response.status).toBe(500);
    expect(deleteOwnAccount).not.toHaveBeenCalled();
  });
});
