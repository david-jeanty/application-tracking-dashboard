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
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    infoSpy.mockRestore();
    vi.useRealTimers();
  });

  it("returns the data straight through on a first-attempt success", async () => {
    const run = vi.fn().mockResolvedValue(attempt({ data: [{ id: "a" }], status: 200 }));

    const result = await withTransientReadRetry("applications", "/dashboard", null, "req-test", run);

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

    const pending = withTransientReadRetry("applications", "/dashboard", true, "req-test", run);
    await vi.advanceTimersByTimeAsync(299);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result).toEqual({ data: [{ id: "a" }], error: null });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("retries a bare gateway timeout with no PostgREST code, using the status alone", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(attempt({ status: 504, error: { message: "Gateway Timeout" } }))
      .mockResolvedValueOnce(attempt({ data: [], status: 200 }));

    const pending = withTransientReadRetry("statusTimeline", "/dashboard", null, "req-test", run);
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

    const result = await withTransientReadRetry("applications", "/dashboard", true, "req-test", run);

    expect(result).toEqual({ data: null, error: rlsError });
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never retries an expired-session error", async () => {
    const jwtError = { code: "PGRST301", message: "JWT expired" };
    const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: jwtError }));

    const result = await withTransientReadRetry("statusTimeline", "/dashboard", true, "req-test", run);

    expect(result).toEqual({ data: null, error: jwtError });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("gives up after one retry and reports the last error honestly", async () => {
    const gatewayError = { message: "Bad Gateway" };
    const run = vi.fn().mockResolvedValue(attempt({ status: 502, error: gatewayError }));

    const pending = withTransientReadRetry("applications", "/dashboard", true, "req-test", run);
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

      const pending = withTransientReadRetry(
        "statusTimeline",
        "/dashboard",
        true,
        "req-test",
        run,
      );
      await vi.advanceTimersByTimeAsync(999);
      expect(run).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;

      expect(result).toEqual({ data: [], error: null });
      expect(run).toHaveBeenCalledTimes(2);
      expect(infoSpy).toHaveBeenCalledWith(
        "[dashboard] read recovered",
        expect.objectContaining({
          read: "statusTimeline",
          attempt: 2,
          status: 200,
          recoveredFromCode: "PGRST303",
          recoveredFromClassification: "jwt_clock_skew",
        }),
      );
    });

    it("also retries the 'not yet valid' clock-skew message", async () => {
      const skewError = { code: "PGRST303", message: "JWT not yet valid" };
      const run = vi
        .fn()
        .mockResolvedValueOnce(attempt({ status: 401, error: skewError }))
        .mockResolvedValueOnce(attempt({ data: [], status: 200 }));

      const pending = withTransientReadRetry("applications", "/dashboard", true, "req-test", run);
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result).toEqual({ data: [], error: null });
      expect(run).toHaveBeenCalledTimes(2);
    });

    it("still gives up honestly when the clock skew never clears within the bound", async () => {
      const skewError = { code: "PGRST303", message: "JWT issued at future" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: skewError }));

      const pending = withTransientReadRetry("applications", "/dashboard", true, "req-test", run);
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

      const result = await withTransientReadRetry("applications", "/dashboard", false, "req-test", run);

      expect(result).toEqual({ data: null, error: expiredError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("never retries an audience mismatch reported as PGRST303", async () => {
      const audienceError = { code: "PGRST303", message: "JWT not in audience" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: audienceError }));

      const result = await withTransientReadRetry("statusTimeline", "/dashboard", false, "req-test", run);

      expect(result).toEqual({ data: null, error: audienceError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("never retries a malformed-claims PGRST303", async () => {
      const malformedError = { code: "PGRST303", message: "Parsing claims failed" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: malformedError }));

      const result = await withTransientReadRetry("applications", "/dashboard", false, "req-test", run);

      expect(result).toEqual({ data: null, error: malformedError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("never guesses on a PGRST303 with an unrecognized or missing message", async () => {
      const unknownError = { code: "PGRST303", message: "some future PostgREST wording" };
      const run = vi.fn().mockResolvedValue(attempt({ status: 401, error: unknownError }));

      const result = await withTransientReadRetry("applications", "/dashboard", false, "req-test", run);

      expect(result).toEqual({ data: null, error: unknownError });
      expect(run).toHaveBeenCalledTimes(1);
    });

    it("requires the identified 401 status as well as the exact code and message", async () => {
      const mismatchedError = {
        code: "PGRST303",
        message: "JWT issued at future",
      };
      const run = vi
        .fn()
        .mockResolvedValue(attempt({ status: 400, error: mismatchedError }));

      const result = await withTransientReadRetry(
        "applications",
        "/dashboard",
        false,
        "req-test",
        run,
      );

      expect(result).toEqual({ data: null, error: mismatchedError });
      expect(run).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it("redacts every raw upstream string from a failure log", async () => {
    const run = vi.fn().mockResolvedValue(
      attempt({
        status: 401,
        error: {
          code: "PGRST301",
          message: "Bearer eyJ-secret for student@example.test",
          details: "cookie=secret; company=Sensitive Company",
          hint: "password sb-secret",
        },
      }),
    );

    await withTransientReadRetry("applications", "/dashboard", true, "req-test", run);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [label, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(label).toBe("[dashboard] read failed");
    expect(Object.keys(payload).sort()).toEqual(
      [
        "attempt",
        "authResolvedMs",
        "code",
        "likelyFirstLoadAfterSignIn",
        "path",
        "read",
        "requestId",
        "retryClassification",
        "retryOutcome",
        "sessionExistedAtRead",
        "status",
      ].sort(),
    );
    expect(payload).toMatchObject({
      code: "PGRST301",
      retryClassification: "not_retryable",
      retryOutcome: "stopped",
    });
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      "cookie",
      "Bearer ",
      "eyJ",
      "@",
      "sb-",
      "password",
      "Sensitive Company",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it.each([
    "Bearer eyJ-secret@example.test",
    "PASSWORD",
    "PGRST30X",
    "PGRST303-extra",
  ])("drops an error code outside the two public identifier formats: %s", async (code) => {
    const run = vi.fn().mockResolvedValue(
      attempt({
        status: 400,
        error: { code },
      }),
    );

    await withTransientReadRetry(
      "applications",
      "/dashboard",
      true,
      "req-test",
      run,
    );

    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject({ code: null });
    expect(JSON.stringify(errorSpy.mock.calls[0]?.[1])).not.toContain(code);
  });

  it("carries the caller's request id through, unchanged, for correlating both reads of one load", async () => {
    const run = vi.fn().mockResolvedValue(
      attempt({ status: 401, error: { code: "42501", message: "permission denied" } }),
    );

    await withTransientReadRetry("applications", "/dashboard", true, "incident-123", run);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(payload.requestId).toBe("incident-123");
  });

  it("logs session readiness and auth timing on failure and recovery", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(
        attempt({
          status: 401,
          error: {
            code: "PGRST303",
            message: "JWT not yet valid",
            details: "Bearer eyJ-secret student@example.test",
            hint: "Sensitive Company cookie=secret",
          },
        }),
      )
      .mockResolvedValueOnce(attempt({ data: [], status: 200 }));
    const diagnostics = { sessionExistedAtRead: true, authResolvedMs: 47 };

    const pending = withTransientReadRetry(
      "applications",
      "/dashboard",
      true,
      "incident-auth",
      run,
      diagnostics,
    );
    await vi.runAllTimersAsync();
    await pending;

    expect(errorSpy.mock.calls[0]?.[1]).toMatchObject(diagnostics);
    expect(infoSpy.mock.calls[0]?.[1]).toMatchObject({
      ...diagnostics,
      requestId: "incident-auth",
      status: 200,
      recoveredFromCode: "PGRST303",
      recoveredFromClassification: "jwt_clock_skew",
    });
    const serializedRecovery = JSON.stringify(infoSpy.mock.calls[0]?.[1]);
    for (const forbidden of [
      "user_id",
      "access_token",
      "Bearer ",
      "eyJ",
      "@",
      "cookie",
      "Sensitive Company",
    ]) {
      expect(serializedRecovery).not.toContain(forbidden);
    }
  });
});
