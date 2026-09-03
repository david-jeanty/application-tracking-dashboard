import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationListItem, ApplicationTimelineEvent } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const listApplications = vi.fn();
const listStatusTimeline = vi.fn();
let refererHeader: string | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
      }),
    },
  }),
}));
vi.mock("@/lib/applications/repository", () => ({
  listApplications: (...args: unknown[]) => listApplications(...args),
  listStatusTimeline: (...args: unknown[]) => listStatusTimeline(...args),
}));
// The page reads `Referer` to guess whether this is the first load right
// after signing in. Outside a real Next.js request, `headers()` throws, so
// this stands in for the request context and lets each test choose the value.
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => (name.toLowerCase() === "referer" ? refererHeader : null),
  }),
}));

const { default: DashboardPage } = await import("@/app/(app)/dashboard/page");

function application(overrides: Partial<ApplicationListItem> = {}): ApplicationListItem {
  return {
    id: "app-1",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto, ON",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: "2026-08-24",
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-24T12:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

function timelineEvent(
  overrides: Partial<ApplicationTimelineEvent> = {},
): ApplicationTimelineEvent {
  return {
    application_id: "app-1",
    previous_status: null,
    new_status: "Applied",
    changed_at: "2026-08-24T16:00:00.000Z",
    ...overrides,
  };
}

describe("the first dashboard load right after signing in", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listApplications.mockReset();
    listStatusTimeline.mockReset();
    refererHeader = "https://app.interndex.example/login";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("succeeds on the very first request, same as any other", async () => {
    listApplications.mockResolvedValue({
      data: [application()],
      error: null,
      status: 200,
    });
    listStatusTimeline.mockResolvedValue({
      data: [timelineEvent()],
      error: null,
      status: 200,
    });

    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your dashboard could not be loaded")).toBeNull();
    expect(listApplications).toHaveBeenCalledTimes(1);
    expect(listStatusTimeline).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("recovers automatically from a transient read failure, with no visible error", async () => {
    listApplications
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST002", message: "schema cache not loaded" },
        status: 503,
      })
      .mockResolvedValueOnce({ data: [application()], error: null, status: 200 });
    listStatusTimeline.mockResolvedValue({
      data: [timelineEvent()],
      error: null,
      status: 200,
    });

    render(await DashboardPage());

    expect(screen.queryByText("Your dashboard could not be loaded")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    // One retry, not an unbounded loop.
    expect(listApplications).toHaveBeenCalledTimes(2);
    // The other read never failed, so it is never retried.
    expect(listStatusTimeline).toHaveBeenCalledTimes(1);
    // The transient failure itself is still worth a diagnostic line.
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not retry a permission or session failure, and reports it honestly", async () => {
    listApplications.mockResolvedValue({
      data: [application()],
      error: null,
      status: 200,
    });
    listStatusTimeline.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
      status: 401,
    });

    render(await DashboardPage());

    expect(
      screen.getByText("Your dashboard could not be loaded"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Your applications are still safe/),
    ).toBeInTheDocument();
    // Exactly one attempt: retrying a permission denial would only repeat it.
    expect(listStatusTimeline).toHaveBeenCalledTimes(1);
    // No database detail reaches the page.
    expect(screen.queryByText(/42501|permission denied|PGRST/i)).toBeNull();
  });

  it("still shows unavailable once a transient-looking failure never recovers", async () => {
    listApplications.mockResolvedValue({
      data: null,
      error: { message: "Bad Gateway" },
      status: 502,
    });
    listStatusTimeline.mockResolvedValue({
      data: [timelineEvent()],
      error: null,
      status: 200,
    });

    render(await DashboardPage());

    expect(
      screen.getByText("Your dashboard could not be loaded"),
    ).toBeInTheDocument();
    // Bounded: the initial attempt plus exactly one retry, then it gives up.
    expect(listApplications).toHaveBeenCalledTimes(2);
  });

  it("logs the failure with no secret or personal data, regardless of outcome", async () => {
    listApplications.mockResolvedValue({
      data: [application()],
      error: null,
      status: 200,
    });
    listStatusTimeline.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "permission denied for table application_status_history",
        details: null,
        hint: null,
      },
      status: 401,
    });

    render(await DashboardPage());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [, payload] = errorSpy.mock.calls[0] as [string, Record<string, unknown>];
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
    expect(payload.path).toBe("/dashboard");
    expect(payload.likelyFirstLoadAfterSignIn).toBe(true);
    const serialized = JSON.stringify(payload);
    for (const forbidden of [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "cookie",
      "Bearer ",
      "eyJ",
      "sb-",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("treats a request with no referer, or one from elsewhere in the app, as not a first load", async () => {
    listApplications.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "denied" },
      status: 401,
    });
    listStatusTimeline.mockResolvedValue({ data: [], error: null, status: 200 });

    refererHeader = null;
    render(await DashboardPage());
    expect(errorSpy.mock.calls.at(-1)?.[1]).toMatchObject({
      likelyFirstLoadAfterSignIn: null,
    });

    errorSpy.mockClear();
    refererHeader = "https://app.interndex.example/analytics";
    render(await DashboardPage());
    expect(errorSpy.mock.calls.at(-1)?.[1]).toMatchObject({
      likelyFirstLoadAfterSignIn: false,
    });
  });
});

describe("a brand-new account's first dashboard load, right after confirming by email", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listApplications.mockReset();
    listStatusTimeline.mockReset();
    // Clicking a confirmation link lands here by following our own server
    // redirect from `/auth/callback`, not a client-side navigation from
    // `/signup` — so, unlike a password sign-in, the referer this request
    // actually carries is whatever launched the mail client's link (often
    // absent), not one of our own auth pages.
    refererHeader = null;
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("reaches the empty dashboard on the first render, with no manual refresh", async () => {
    // The reproduction this guards: a just-confirmed account has saved
    // nothing yet, so both reads legitimately resolve to zero rows — but its
    // session is the freshest possible token, which is exactly what trips a
    // PGRST303 clock-skew rejection (see `lib/dashboard/reads.ts`) on the
    // very first request. One retry is enough once the skew clears.
    listApplications
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST303", message: "JWT issued at future" },
        status: 401,
      })
      .mockResolvedValueOnce({ data: [], error: null, status: 200 });
    listStatusTimeline
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST303", message: "JWT issued at future" },
        status: 401,
      })
      .mockResolvedValueOnce({ data: [], error: null, status: 200 });

    render(await DashboardPage());

    // The real empty-tracker state, not the failure banner and not a claim
    // about data that was never actually read.
    expect(screen.getByText("No applications yet.")).toBeInTheDocument();
    expect(screen.queryByText("Your dashboard could not be loaded")).toBeNull();
    expect(listApplications).toHaveBeenCalledTimes(2);
    expect(listStatusTimeline).toHaveBeenCalledTimes(2);
  });

  it("still reports unavailable, honestly, if a same-shaped failure is not actually transient", async () => {
    // Confirms the fix is a real classification, not "retry until it works":
    // an ordinary permission denial that merely happens on a new account's
    // first request is never retried and never silently becomes "empty".
    listApplications.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
      status: 401,
    });
    listStatusTimeline.mockResolvedValue({ data: [], error: null, status: 200 });

    render(await DashboardPage());

    expect(
      screen.getByText("Your dashboard could not be loaded"),
    ).toBeInTheDocument();
    expect(screen.queryByText("No applications yet.")).toBeNull();
    expect(listApplications).toHaveBeenCalledTimes(1);
  });
});

describe("an existing account's dashboard load right after a fresh sign-in", () => {
  // The production regression this whole block guards: an earlier version of
  // this file retried every PGRST303 by code alone, which meant a genuinely
  // expired or otherwise invalid session — the same code PostgREST uses for a
  // real clock-skew race — was retried too, turning a working existing
  // account's sign-in into the generic failure banner. See
  // `lib/dashboard/reads.ts` for the classification this block exercises
  // through the page.
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    listApplications.mockReset();
    listStatusTimeline.mockReset();
    refererHeader = "https://app.interndex.example/login";
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("loads the populated dashboard on the first attempt, exactly as before", async () => {
    listApplications.mockResolvedValue({
      data: [
        application({ id: "a", company_name: "RBC" }),
        application({ id: "b", company_name: "Shopify", current_status: "Interview" }),
      ],
      error: null,
      status: 200,
    });
    listStatusTimeline.mockResolvedValue({
      data: [timelineEvent({ application_id: "a" }), timelineEvent({ application_id: "b" })],
      error: null,
      status: 200,
    });

    render(await DashboardPage());

    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Your dashboard could not be loaded")).toBeNull();
    expect(listApplications).toHaveBeenCalledTimes(1);
    expect(listStatusTimeline).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not retry a genuinely dead session reported as PGRST303, and reports it honestly", async () => {
    // The exact shape of the regression: PostgREST reports an actually
    // expired token under the same PGRST303 code as the clock-skew case, but
    // with a different message. A retry cannot revive it, so the fixed
    // classification leaves it at one attempt — the same single, honest
    // failure this account would have seen before the clock-skew fix ever
    // shipped, not a slower version of it.
    listApplications.mockResolvedValue({
      data: null,
      error: { code: "PGRST303", message: "JWT expired" },
      status: 401,
    });
    listStatusTimeline.mockResolvedValue({
      data: [timelineEvent()],
      error: null,
      status: 200,
    });

    render(await DashboardPage());

    expect(
      screen.getByText("Your dashboard could not be loaded"),
    ).toBeInTheDocument();
    expect(listApplications).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/PGRST303|JWT expired/i)).toBeNull();
  });

  it("still recovers a real clock-skew race for an existing account, same as a new one", async () => {
    // The clock-skew condition is about the token's age, not the account's:
    // a returning user's freshly minted session can race it too, and the
    // narrower classification still catches that exact message.
    listApplications
      .mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST303", message: "JWT issued at future" },
        status: 401,
      })
      .mockResolvedValueOnce({
        data: [application()],
        error: null,
        status: 200,
      });
    listStatusTimeline.mockResolvedValue({
      data: [timelineEvent()],
      error: null,
      status: 200,
    });

    render(await DashboardPage());

    expect(screen.queryByText("Your dashboard could not be loaded")).toBeNull();
    expect(
      screen.getByRole("heading", { level: 1, name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(listApplications).toHaveBeenCalledTimes(2);
  });
});
