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
