import { beforeEach, describe, expect, it, vi } from "vitest";

/** `redirect()` throws in Next.js; this mirrors that so flow can be asserted. */
class RedirectError extends Error {
  constructor(public readonly destination: string) {
    super(`redirect:${destination}`);
  }
}

const getUser = vi.fn();
const approveAuthorization = vi.fn();
const denyAuthorization = vi.fn();
const revokeGrant = vi.fn();
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
  createClient: async () => ({
    auth: {
      getUser,
      oauth: { approveAuthorization, denyAuthorization, revokeGrant },
    },
  }),
}));

const { decideConsentAction, revokeGrantAction } = await import(
  "@/lib/oauth/actions"
);

const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION_ID = "22222222-2222-4222-8222-222222222222";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** Runs an action that is expected to redirect, and reports where to. */
async function destinationOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RedirectError) return error.destination;
    throw error;
  }
  throw new Error("expected a redirect, but the action returned normally");
}

beforeEach(() => {
  for (const mock of [
    getUser,
    approveAuthorization,
    denyAuthorization,
    revokeGrant,
    revalidatePath,
  ]) {
    mock.mockReset();
  }
  getUser.mockResolvedValue({ data: { user: USER } });
});

describe("recording a consent decision", () => {
  it("approves and returns to the URL Supabase supplies", async () => {
    approveAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/api/mcp/auth_callback?code=x" },
      error: null,
    });

    const destination = await destinationOf(() =>
      decideConsentAction(
        { status: "idle" },
        form({ authorizationId: AUTHORIZATION_ID, decision: "approve" }),
      ),
    );

    expect(destination).toBe("https://claude.ai/api/mcp/auth_callback?code=x");
    expect(approveAuthorization).toHaveBeenCalledWith(AUTHORIZATION_ID, {
      skipBrowserRedirect: true,
    });
  });

  it("denies through the deny path, never by approving", async () => {
    denyAuthorization.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/cb?error=access_denied" },
      error: null,
    });

    await destinationOf(() =>
      decideConsentAction(
        { status: "idle" },
        form({ authorizationId: AUTHORIZATION_ID, decision: "deny" }),
      ),
    );

    expect(denyAuthorization).toHaveBeenCalledTimes(1);
    expect(approveAuthorization).not.toHaveBeenCalled();
  });

  it("refuses to decide for a signed-out visitor", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const state = await decideConsentAction(
      { status: "idle" },
      form({ authorizationId: AUTHORIZATION_ID, decision: "approve" }),
    );

    expect(state.status).toBe("error");
    expect(approveAuthorization).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing authorization id", { decision: "approve" }],
    ["a missing decision", { authorizationId: AUTHORIZATION_ID }],
    [
      "a decision that is neither approve nor deny",
      { authorizationId: AUTHORIZATION_ID, decision: "maybe" },
    ],
  ])("rejects %s without contacting Supabase", async (_label, entries) => {
    const state = await decideConsentAction(
      { status: "idle" },
      form(entries as Record<string, string>),
    );

    expect(state.status).toBe("error");
    expect(approveAuthorization).not.toHaveBeenCalled();
    expect(denyAuthorization).not.toHaveBeenCalled();
  });

  it("reports a failure rather than inventing a redirect", async () => {
    approveAuthorization.mockResolvedValue({
      data: null,
      error: { message: "expired" },
    });

    const state = await decideConsentAction(
      { status: "idle" },
      form({ authorizationId: AUTHORIZATION_ID, decision: "approve" }),
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("application you are connecting");
    expect(state.message).not.toContain("Claude");
  });
});

describe("disconnecting an assistant", () => {
  it("revokes the grant and returns to settings", async () => {
    revokeGrant.mockResolvedValue({ data: {}, error: null });

    const destination = await destinationOf(() =>
      revokeGrantAction(form({ clientId: CLIENT_ID })),
    );

    expect(revokeGrant).toHaveBeenCalledWith({ clientId: CLIENT_ID });
    expect(destination).toBe("/settings?disconnect=done");
  });

  it("refreshes the settings view so the list is re-read", async () => {
    revokeGrant.mockResolvedValue({ data: {}, error: null });

    await destinationOf(() => revokeGrantAction(form({ clientId: CLIENT_ID })));

    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("sends a signed-out visitor to log in without revoking anything", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const destination = await destinationOf(() =>
      revokeGrantAction(form({ clientId: CLIENT_ID })),
    );

    expect(destination).toBe("/login?next=/settings");
    expect(revokeGrant).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing client id", {}],
    ["an identifier that is not a client id", { clientId: "the claude one" }],
    ["an empty client id", { clientId: "   " }],
  ])("rejects %s without contacting Supabase", async (_label, entries) => {
    const destination = await destinationOf(() =>
      revokeGrantAction(form(entries as Record<string, string>)),
    );

    expect(destination).toBe("/settings?disconnect=invalid");
    expect(revokeGrant).not.toHaveBeenCalled();
  });

  it("reports an upstream failure instead of claiming success", async () => {
    revokeGrant.mockResolvedValue({
      data: null,
      error: { message: "no such grant" },
    });

    const destination = await destinationOf(() =>
      revokeGrantAction(form({ clientId: CLIENT_ID })),
    );

    expect(destination).toBe("/settings?disconnect=error");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts no redirect destination from the caller", async () => {
    revokeGrant.mockResolvedValue({ data: {}, error: null });

    const destination = await destinationOf(() =>
      revokeGrantAction(
        form({
          clientId: CLIENT_ID,
          next: "https://attacker.example/steal",
          redirect: "https://attacker.example/steal",
        }),
      ),
    );

    expect(destination).toBe("/settings?disconnect=done");
  });
});
