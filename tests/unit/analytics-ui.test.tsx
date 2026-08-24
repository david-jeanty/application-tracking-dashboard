import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApplicationStatus } from "@/lib/applications/constants";
import { UNSPECIFIED_DATABASE_VALUE } from "@/lib/applications/constants";
import type { ApplicationAnalyticsRow } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const listApplicationsForAnalytics = vi.fn();
const listStatusHistory = vi.fn();

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
  listApplicationsForAnalytics: (...args: unknown[]) =>
    listApplicationsForAnalytics(...args),
  listStatusHistory: (...args: unknown[]) => listStatusHistory(...args),
}));

const { default: AnalyticsPage } = await import("@/app/(app)/analytics/page");

type Seed = {
  id: string;
  source: string;
  path: ApplicationStatus[];
  archived?: boolean;
};

/**
 * Loads the page with one student's applications and the history a database
 * trigger would have written for the status path each one travelled.
 */
async function renderAnalytics(seeds: Seed[]) {
  const rows: ApplicationAnalyticsRow[] = seeds.map((seed) => ({
    id: seed.id,
    current_status: seed.path[seed.path.length - 1],
    normalized_job_category: "Business Analysis",
    application_source: seed.source,
    archived_at: seed.archived ? "2026-08-20T10:00:00.000Z" : null,
  }));
  const history = seeds.flatMap((seed) =>
    seed.path.map((status) => ({
      application_id: seed.id,
      new_status: status,
    })),
  );

  listApplicationsForAnalytics.mockResolvedValue({ data: rows, error: null });
  listStatusHistory.mockResolvedValue({ data: history, error: null });

  return render(await AnalyticsPage());
}

/** The row a table renders for one label, whichever table it is in. */
function rowFor(label: string): HTMLElement {
  return screen.getAllByRole("rowheader", { name: new RegExp(label) })[0]
    .closest("tr") as HTMLElement;
}

/**
 * Four submitted applications where a stage-to-stage denominator would give a
 * visibly different answer from a share of everything submitted: two got a
 * response, one of those interviewed. Share of submitted puts the interview at
 * 25%; stage-to-stage would put it at 50%.
 */
const MIXED: Seed[] = [
  { id: "a1", source: "LinkedIn", path: ["Applied", "Screening", "Interview"] },
  { id: "a2", source: "LinkedIn", path: ["Applied", "Rejected"] },
  { id: "a3", source: "Referral", path: ["Applied"] },
  { id: "a4", source: UNSPECIFIED_DATABASE_VALUE, path: ["Applied"] },
];

describe("the analytics page", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("renders every section, in the order the page is structured", async () => {
    await renderAnalytics(MIXED);

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      "Search overview",
      "How far applications got",
      "Source performance",
      "Current status",
      "Categories",
    ]);
  });

  it("names each section as a landmark rather than an anonymous card", async () => {
    await renderAnalytics(MIXED);

    for (const name of [
      "Search overview",
      "How far applications got",
      "Source performance",
      "Current status",
      "Categories",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("shows the search overview totals as readable numbers", async () => {
    await renderAnalytics([
      ...MIXED,
      { id: "b1", source: "LinkedIn", path: ["Interested"] },
    ]);

    const overview = screen.getByRole("region", { name: "Search overview" });

    // Saved 5, submitted 4, active 2 (Applied ×2 plus the Interview), not yet
    // submitted 1. Each is a number a reader can see, not one to infer.
    for (const [label, value] of [
      ["Applications saved", "5"],
      ["Submitted", "4"],
      ["Active now", "3"],
      ["Not yet submitted", "1"],
    ]) {
      const tile = within(overview).getByText(label).closest("div");
      expect(within(tile as HTMLElement).getByText(value)).toBeInTheDocument();
    }
  });
});

describe("the conversion funnel", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("shows submitted as the visible 100% baseline", async () => {
    await renderAnalytics(MIXED);

    const baseline = rowFor("Submitted");
    expect(within(baseline).getByText("4")).toBeInTheDocument();
    expect(within(baseline).getByText("100%")).toBeInTheDocument();
  });

  it("shows both the count and the share on every stage", async () => {
    await renderAnalytics(MIXED);

    for (const [stage, count, share] of [
      ["Employer responded", "2", "50%"],
      ["Moved forward", "1", "25%"],
      ["Reached an interview", "1", "25%"],
      ["Received an offer", "0", "0%"],
    ]) {
      const row = rowFor(stage);
      expect(within(row).getByText(count)).toBeInTheDocument();
      expect(within(row).getByText(share)).toBeInTheDocument();
    }
  });

  it("keeps every share out of submitted, never stage to stage", async () => {
    await renderAnalytics(MIXED);

    // One of the two responses interviewed. Stage-to-stage would read 50%;
    // the canonical share of everything submitted is 25%.
    const interview = rowFor("Reached an interview");
    expect(within(interview).getByText("25%")).toBeInTheDocument();
    expect(within(interview).queryByText("50%")).toBeNull();
  });

  it("says so plainly when nothing has been submitted yet", async () => {
    await renderAnalytics([
      { id: "a", source: "LinkedIn", path: ["Interested"] },
      { id: "b", source: "Referral", path: ["Interested", "Preparing"] },
    ]);

    const funnel = screen.getByRole("region", {
      name: "How far applications got",
    });

    expect(
      within(funnel).getByText(/Nothing has been submitted yet/),
    ).toBeInTheDocument();
    // A low-data state, not an error and not encouragement.
    expect(within(funnel).queryByRole("table")).toBeNull();
    expect(screen.queryByText(/keep going|crushing|great work/i)).toBeNull();
  });

  it("reports real zeros when applications were submitted but nothing came back", async () => {
    await renderAnalytics([
      { id: "a", source: "LinkedIn", path: ["Applied"] },
      { id: "b", source: "LinkedIn", path: ["Applied"] },
    ]);

    const responded = rowFor("Employer responded");
    expect(within(responded).getByText("0")).toBeInTheDocument();
    expect(within(responded).getByText("0%")).toBeInTheDocument();
  });
});

describe("source performance", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("lists each source with its counts and its rate", async () => {
    await renderAnalytics(MIXED);

    const linkedIn = rowFor("LinkedIn");
    // Submitted 2, responses 2, interviews 1, offers 0.
    expect(within(linkedIn).getAllByText("2")).toHaveLength(2);
    expect(within(linkedIn).getByText("50% · 1 of 2")).toBeInTheDocument();
  });

  it("never shows a rate without the sample it came from", async () => {
    await renderAnalytics([
      { id: "a", source: "Referral", path: ["Applied", "Interview"] },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `b${index}`,
        source: "LinkedIn",
        path: ["Applied"] as ApplicationStatus[],
      })),
    ]);

    // The perfect rate is shown — and so is the single application behind it.
    expect(screen.getAllByText("100% · 1 of 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0% · 0 of 10").length).toBeGreaterThan(0);
  });

  it("orders by volume, so one lucky application never leads the table", async () => {
    await renderAnalytics([
      { id: "a", source: "Referral", path: ["Applied", "Interview"] },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `b${index}`,
        source: "LinkedIn",
        path: ["Applied"] as ApplicationStatus[],
      })),
    ]);

    const sources = screen.getByRole("region", { name: "Source performance" });
    const names = within(sources)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);

    expect(names[0]).toContain("LinkedIn");
    expect(names[1]).toContain("Referral");
  });

  it("puts applications with no recorded source in their own bucket, last", async () => {
    await renderAnalytics(MIXED);

    const sources = screen.getByRole("region", { name: "Source performance" });
    const names = within(sources)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);

    expect(names.at(-1)).toContain(UNSPECIFIED_DATABASE_VALUE);
  });

  it("counts only submitted applications, so a saved job changes no rate", async () => {
    await renderAnalytics([
      { id: "a", source: "LinkedIn", path: ["Applied", "Interview"] },
      { id: "b", source: "LinkedIn", path: ["Applied"] },
      // Saved from LinkedIn and never sent: outside the denominator entirely.
      { id: "c", source: "LinkedIn", path: ["Interested"] },
      { id: "d", source: "LinkedIn", path: ["Interested", "Preparing"] },
    ]);

    expect(screen.getAllByText("50% · 1 of 2").length).toBeGreaterThan(0);
  });

  it("does not crash, or invent a table, when nothing was submitted", async () => {
    await renderAnalytics([
      { id: "a", source: "LinkedIn", path: ["Interested"] },
    ]);

    const sources = screen.getByRole("region", { name: "Source performance" });
    expect(
      within(sources).getByText(/Nothing has been submitted yet/),
    ).toBeInTheDocument();
    expect(within(sources).queryByRole("table")).toBeNull();
  });

  it("names no source best or worst, and recommends nothing", async () => {
    await renderAnalytics(MIXED);

    expect(
      screen.queryByText(/best|worst|try |should |recommend|stop using/i),
    ).toBeNull();
  });
});

describe("current status and categories", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("shows every status, including the empty ones", async () => {
    await renderAnalytics(MIXED);

    const status = screen.getByRole("region", { name: "Current status" });
    // All ten controlled statuses, in the enum's own order.
    expect(within(status).getAllByRole("rowheader")).toHaveLength(10);
    expect(
      within(status).getAllByRole("rowheader").map((cell) => cell.textContent),
    ).toEqual([
      "Interested",
      "Preparing",
      "Applied",
      "Screening",
      "Assessment",
      "Interview",
      "Offer",
      "Rejected",
      "Withdrawn",
      "Accepted",
    ]);
  });

  it("reads current status from current state, not from history", async () => {
    await renderAnalytics(MIXED);

    const status = screen.getByRole("region", { name: "Current status" });
    // All four passed through Applied, but only a3 and a4 are still there:
    // a1 is at Interview now and a2 is Rejected. History does not reach here.
    const applied = within(status)
      .getByRole("rowheader", { name: "Applied" })
      .closest("tr") as HTMLElement;
    const interview = within(status)
      .getByRole("rowheader", { name: "Interview" })
      .closest("tr") as HTMLElement;

    expect(within(applied).getByText("2")).toBeInTheDocument();
    expect(within(interview).getByText("1")).toBeInTheDocument();
  });

  it("shows a raw count beside every category", async () => {
    await renderAnalytics(MIXED);

    const categories = screen.getByRole("region", { name: "Categories" });
    const row = within(categories).getByRole("rowheader", {
      name: "Business Analysis",
    }).parentElement as HTMLElement;

    expect(within(row).getByText("4")).toBeInTheDocument();
  });
});

describe("degenerate data", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("keeps the existing empty state when nothing is saved at all", async () => {
    await renderAnalytics([]);

    expect(screen.getByText("Nothing to measure yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("reports a failed read rather than showing zeros", async () => {
    listApplicationsForAnalytics.mockResolvedValue({
      data: null,
      error: { code: "PGRST301" },
    });
    listStatusHistory.mockResolvedValue({ data: [], error: null });

    render(await AnalyticsPage());

    expect(
      screen.getByText("Analytics could not be loaded"),
    ).toBeInTheDocument();
  });

  it("counts an archived application in the history it belongs to", async () => {
    await renderAnalytics([
      {
        id: "a",
        source: "Referral",
        path: ["Applied", "Interview", "Rejected"],
        archived: true,
      },
    ]);

    // Archived, and still part of what happened: it is submitted, it reached
    // an interview, and its source carries that interview.
    expect(rowFor("Reached an interview")).toBeInTheDocument();
    expect(screen.getAllByText("100% · 1 of 1").length).toBeGreaterThan(0);
  });
});
