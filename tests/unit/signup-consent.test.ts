import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/document-versions";

const signUp = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`redirect:${destination}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp } }),
}));
vi.mock("@/lib/env", () => ({
  hasSupabaseEnvironment: () => true,
  getPublicEnvironment: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    NEXT_PUBLIC_SITE_URL: "https://interndex.example",
  }),
}));

const { signupAction } = await import("@/lib/auth/actions");

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

const VALID_SIGNUP = {
  fullName: "Alex Smith",
  email: "alex@example.com",
  password: "correct-horse",
  termsAccepted: "on",
};

beforeEach(() => {
  signUp.mockReset();
  signUp.mockResolvedValue({ data: { user: { id: "u1" }, session: null }, error: null });
});

describe("recording clickwrap consent at signup", () => {
  it("stamps the current document versions and a fresh timestamp", async () => {
    await signupAction({ status: "idle" }, form(VALID_SIGNUP));

    expect(signUp).toHaveBeenCalledTimes(1);
    const [[call]] = signUp.mock.calls;
    const consentData = call.options.data;

    expect(consentData.terms_version_accepted).toBe(TERMS_VERSION);
    expect(consentData.privacy_version_accepted).toBe(PRIVACY_VERSION);
    expect(consentData.terms_accepted_at).toBe(consentData.privacy_accepted_at);
    expect(new Date(consentData.terms_accepted_at).getTime()).toBeCloseTo(
      Date.now(),
      -2,
    );
  });

  it("never trusts a client-supplied version or timestamp", async () => {
    await signupAction(
      { status: "idle" },
      form({
        ...VALID_SIGNUP,
        terms_version_accepted: "forged-version",
        terms_accepted_at: "1970-01-01T00:00:00.000Z",
      }),
    );

    const [[call]] = signUp.mock.calls;
    expect(call.options.data.terms_version_accepted).toBe(TERMS_VERSION);
    expect(call.options.data.terms_accepted_at).not.toBe(
      "1970-01-01T00:00:00.000Z",
    );
  });

  it("never calls Supabase when the terms checkbox was not checked", async () => {
    const state = await signupAction(
      { status: "idle" },
      form({
        fullName: VALID_SIGNUP.fullName,
        email: VALID_SIGNUP.email,
        password: VALID_SIGNUP.password,
      }),
    );

    expect(state.status).toBe("error");
    expect(signUp).not.toHaveBeenCalled();
  });
});
