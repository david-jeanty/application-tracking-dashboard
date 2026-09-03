import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTransientReadRetry } from "@/lib/dashboard/reads";

type Row = { id: string };

function attempt(
  overrides: Partial<{
    data: Row[] | null;
    error: {
      code?: string;
      message?: string;
      details?: string | null;
      hint?: string | null;
    } | null;
    status: number;
  }> = {},
) {
  return {
    data: null,
    error: null,
    status: 200,
    ...overrides,
  };
}

describe("withTransientReadRetry", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.useRealTimers();
  });

  it("returns the data straight through on a first-attempt success", async () => {
    const run = vi.fn().mockResolvedValue(attempt({ data: [{ id: "a" }], status: 200 }));

    const result = await withTransientReadRetry("applications", "/dashboard", null, run);

    expect(result).toEqual({ data: [{ id: "a" }], error: null });
    expect(run).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("retries once and succeeds when a 503 is followed by a good response", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        attempt({ status: 503, error: { code: "PGRST002", message: "schema cache" } }),
      )
      .mockResolvedValueOnce(attempt({ data: [{ id: "a" }], status: 200 }));

    const pending = withTransientReadRetry("applications", "/dashboard", true, run);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual({ data: [{ id: "a" }], error: null });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries a bare gateway timeout with no PostgREST code, using the status alone", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(attempt({ status: 504, error: { message: "Gateway Timeout" } }))
      .mockResolvedValueOnce(attempt({ data: [], status: 200 }));

    const pending = withTransientReadRetry("statusTimeline", "/dashboard", null, run);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual({ data: [], error: null });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never retries a row-level security denial", async () => {
    const rlsError = {
      code: "42501",
      message: "new row violates row-level security policy",
      details: null,
      hint: null,
    };
    const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: rlsError }));

    const result = await withTransientReadRetry("applications", "/dashboard", true, run);

    expect(result).toEqual({ data: null, error: rlsError });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("never retries an expired-session error", async () => {
    const jwtError = { code: "PGRST301", message: "JWT expired" };
    const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: jwtError }));

    const result = await withTransientReadRetry("statusTimeline", "/dashboard", true, run);

    expect(result).toEqual({ data: null, error: jwtError });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after one retry and reports the last error honestly", async () => {
    const gatewayError = { message: "Bad Gateway" };
    const run = vi.fn().mockResolvedValue(attempt({ status: 502, error: gatewayError }));

    const pending = withTransientReadRetry("applications", "/dashboard", true, run);
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual({ data: null, error: gatewayError });
    // Bounded: the initial attempt plus exactly one retry, never more.
    expect(run).toHaveBeenCalledTimes(2);
  });

  describe("PGRST303 — PostgREST's single code for nine different JWT-claim outcomes", () => {
    // PostgREST's own `JwtClaimsErr` (src/library/PostgREST/Error.hs) returns
    // this one code, at HTTP 401, for a token that is genuinely expired, one
    // with the wrong audience, one whose claims failed to parse, four flavors
    // of a malformed claim, and exactly two clock-disagreement conditions.
    // Only the two clock-disagreement messages are retried; the code alone
    // proves nothing about which of the nine actually happened.

    it("retries a clock-skew JWT rejection and succeeds once the skew clears", async () => {
      // Documented against this exact shape in supabase/supabase#41294 and
      // supabase/supabase discussion #48123 — a token issued moments ago,
      // exactly what a brand-new signup's or a just-confirmed account's very
      // first request carries.
      const skewError = { code: "PGRST303", message: "JWT issued at future" };
      const run = vi
        .fn()
        .mockResolvedValueOnce(attempt({ status: 401, error: skewError }))
        .mockResolvedValueOnce(attempt({ data: [], status: 200 }));

      const pending = withTransientReadRetry("statusTimeline", "/dashboard", true, run);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result).toEqual({ data: [], error: null });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("also retries the 'not yet valid' clock-skew message", async () => {
      const skewError = { code: "PGRST303", message: "JWT not yet valid" };
      const run = vi
        .fn()
        .mockResolvedValueOnce(attempt({ status: 401, error: skewError }))
        .mockResolvedValueOnce(attempt({ data: [], status: 200 }));

      const pending = withTransientReadRetry("applications", "/dashboard", true, run);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result).toEqual({ data: [], error: null });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("still gives up honestly when the clock skew never clears within the bound", async () => {
      const skewError = { code: "PGRST303", message: "JWT issued at future" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: skewError }));

      const pending = withTransientReadRetry("applications", "/dashboard", true, run);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result).toEqual({ data: null, error: skewError });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("never retries a genuinely expired session reported as PGRST303", async () => {
      // The production regression this guards: an earlier version of this
      // file retried every PGRST303, including this one — a real, dead
      // session that a retry cannot revive, previously reported honestly on
      // the first attempt for every already-working existing-user sign-in.
      const expiredError = { code: "PGRST303", message: "JWT expired" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: expiredError }));

      const result = await withTransientReadRetry("applications", "/dashboard", false, run);

      expect(result).toEqual({ data: null, error: expiredError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("never retries an audience mismatch reported as PGRST303", async () => {
      const audienceError = { code: "PGRST303", message: "JWT not in audience" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: audienceError }));

      const result = await withTransientReadRetry("statusTimeline", "/dashboard", false, run);

      expect(result).toEqual({ data: null, error: audienceError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("never retries a malformed-claims PGRST303", async () => {
      const malformedError = { code: "PGRST303", message: "Parsing claims failed" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: malformedError }));

      const result = await withTransientReadRetry("applications", "/dashboard", false, run);

      expect(result).toEqual({ data: null, error: malformedError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("never guesses on a PGRST303 with an unrecognized or missing message", async () => {
      const unknownError = { code: "PGRST303", message: "some future PostgREST wording" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: unknownError }));

      const result = await withTransientReadRetry("applications", "/dashboard", false, run);

      expect(result).toEqual({ data: null, error: unknownError });
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it("logs only the query's own fields, never a secret or personal one", async () => {
    const run = vi.fn().mockResolvedValue(
      attempt({
        status: 401,
        error: { code: "PGRST301", message: "JWT expired", details: "x", hint: "y" },
      }),
    );

    await withTransientReadRetry("applications", "/dashboard", true, run);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe("[dashboard] read failed");
    expect(Object.keys(payload).sort()).toEqual(
      [
        "attempt",
        "code",
        "details",
        "hint",
        "likelyFirstLoadAfterSignIn",
        "message",
        "path",
        "read",
        "status",
      ].sort(),
    );
    // Fields are an allowlist above; this additionally guards against a
    // secret-shaped *value* slipping into one of those allowed fields, such
    // as an error message that happened to embed a token or a cookie.
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["cookie", "Bearer ", "eyJ", "@", "sb-", "password"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
