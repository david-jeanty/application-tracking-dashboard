import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listApplications,
  listStatusTimeline,
} from "@/lib/applications/repository";
import { withTransientReadRetry } from "@/lib/dashboard/reads";

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
let clientNumber = 0;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clientWithTransport(
  responder: (requestNumber: number) => Response | Promise<Response>,
) {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const transport = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ input, init });
      return responder(requests.length);
    },
  );
  const client = createClient("https://dashboard-retry.test", "publishable-key", {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: `dashboard-http-retry-${(clientNumber += 1)}`,
    },
    global: { fetch: transport as typeof fetch },
  });

  return { client, requests, transport };
}

describe("dashboard HTTP retry boundary", () => {
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

  it("proves the installed PostgREST client multiplies a 503 by default", async () => {
    const { client, transport } = clientWithTransport(() =>
      jsonResponse(503, {
        code: "PGRST002",
        message: "schema cache unavailable",
      }),
    );

    const pending = listApplications(client, USER, { archiveState: "all" });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.status).toBe(503);
    // One initial fetch plus the installed client's three default retries.
    expect(transport).toHaveBeenCalledTimes(4);
  });

  it("makes exactly two fresh HTTP requests for 401/PGRST303 then 200", async () => {
    const { client, requests, transport } = clientWithTransport((requestNumber) =>
      requestNumber === 1
        ? jsonResponse(401, {
            code: "PGRST303",
            message: "JWT issued at future",
          })
        : jsonResponse(200, []),
    );
    const attemptSignals: AbortSignal[] = [];

    const pending = withTransientReadRetry(
      "applications",
      "/dashboard",
      true,
      "http-transient",
      () => {
        const abortSignal = new AbortController().signal;
        attemptSignals.push(abortSignal);
        return listApplications(
          client,
          USER,
          { archiveState: "all" },
          { abortSignal, retry: false },
        );
      },
    );
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result).toEqual({ data: [], error: null });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(attemptSignals).toHaveLength(2);
    expect(attemptSignals[1]).not.toBe(attemptSignals[0]);
    expect(requests[0]?.init?.signal).toBe(attemptSignals[0]);
    expect(requests[1]?.init?.signal).toBe(attemptSignals[1]);
  });

  it.each([503, 520])(
    "caps a persistent HTTP %s response at two network requests",
    async (status) => {
      const { client, transport } = clientWithTransport(() =>
        jsonResponse(status, {
          code: status === 503 ? "PGRST002" : "CF520",
          message: "transient upstream failure",
        }),
      );

      const pending = withTransientReadRetry(
        "applications",
        "/dashboard",
        true,
        `http-${status}`,
        () => {
          const abortSignal = new AbortController().signal;
          return listApplications(
            client,
            USER,
            { archiveState: "all" },
            { abortSignal, retry: false },
          );
        },
      );
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(result.error).not.toBeNull();
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );

  it("caps a persistent network failure at two network requests", async () => {
    // A rejected fetch takes an additional promise turn before PostgREST
    // converts it to status 0, so use the real 300 ms wrapper delay here.
    vi.useRealTimers();
    const { client, transport } = clientWithTransport(() => {
      throw new TypeError("simulated connection failure");
    });

    const pending = withTransientReadRetry(
      "statusTimeline",
      "/dashboard",
      true,
      "network-failure",
      () => {
        const abortSignal = new AbortController().signal;
        return listStatusTimeline(client, USER, {
          abortSignal,
          retry: false,
        });
      },
    );
    const result = await pending;

    expect(result.error).not.toBeNull();
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
