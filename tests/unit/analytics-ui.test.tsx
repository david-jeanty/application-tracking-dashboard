import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApplicationStatus,
  JobCategory,
} from "@/lib/applications/constants";
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
  source?: string;
  category?: JobCategory;
  path: ApplicationStatus[];
  dateApplied?: string | null;
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
    normalized_job_category: seed.category ?? "Business Analysis",
    application_source: seed.source ?? "LinkedIn",
    date_applied: seed.dateApplied ?? null,
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

function many(prefix: string, count: number, seed: Omit<Seed, "id">): Seed[] {
  return Array.from({ length: count }, (_, index) => ({
    ...seed,
    id: `${prefix}${index}`,
  }));
}

/**
 * A date `days` before today, as `YYYY-MM-DD`.
 *
 * Relative rather than fixed, because the activity range is anchored to the
 * real clock the page reads. Never fewer than two days back, so the value
 * cannot land in tomorrow when the runner's UTC day is ahead of the page's
 * timezone.
 */
function daysAgo(days: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - Math.max(2, days));
  return day.toISOString().slice(0, 10);
}

/**
 * A believable search: 54 submitted, 9 responses, 4 interviews, 1 offer.
 *
 * The same numbers the funnel design was drawn against, so the page's
 * stage-to-stage figures are 17%, 44% and 25% — all visibly different from a
 * share of the submitted total, which is what a regression would produce.
 *
 * 42 of the 54 carry an application date and 12 do not, so the coverage
 * sentence has something to disclose. Three role categories and three sources
 * give both performance lenses a comparison to make.
 */
function search(): Seed[] {
  const categories: JobCategory[] = [
    "Business Analysis",
    "Finance",
    "Marketing",
  ];

  return [
    ...many("n", 45, { source: "LinkedIn", path: ["Applied"] }).map(
      (seed, index) => ({
        ...seed,
        category: categories[index % categories.length],
        // 33 dated, 12 left without a date.
        dateApplied: index < 33 ? daysAgo(2 + index * 2) : null,
      }),
    ),
    ...many("r", 5, {
      source: "Company website",
      path: ["Applied", "Rejected"],
    }).map((seed, index) => ({
      ...seed,
      category: categories[index % categories.length],
      dateApplied: daysAgo(3 + index * 5),
    })),
    ...many("i", 3, {
      source: "Company website",
      path: ["Applied", "Interview", "Rejected"],
    }).map((seed, index) => ({
      ...seed,
      category: categories[index % categories.length],
      dateApplied: daysAgo(6 + index * 7),
    })),
    {
      id: "o",
      source: "Referral",
      category: "Finance",
      path: ["Applied", "Interview", "Offer", "Accepted"],
      dateApplied: daysAgo(9),
    },
    { id: "saved", source: "LinkedIn", path: ["Interested"] },
  ];
}

/** The funnel's four rows, in order, as their full text. */
function funnelRows(): string[] {
  const funnel = screen.getByRole("region", { name: "Your funnel" });
  return within(funnel)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

describe("the page's shape", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("leads with the page title and one line saying what it is for", async () => {
    await renderAnalytics(search());

    expect(
      screen.getByRole("heading", { level: 1, name: "Analytics" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Understand what is converting in your search."),
    ).toBeInTheDocument();
  });

  it("does not repeat the word Analytics as an eyebrow above the heading", async () => {
    await renderAnalytics(search());

    expect(screen.getAllByText("Analytics")).toHaveLength(1);
  });

  it("renders the V2 hierarchy and nothing the dashboard already owns", async () => {
    await renderAnalytics(search());

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([
      "Your funnel",
      "Where your funnel narrows",
      "What works",
      "Search activity",
    ]);
  });

  it("no longer shows the sections the dashboard answers", async () => {
    await renderAnalytics(search());

    for (const removed of [
      "Search overview",
      "Current status",
      "Categories",
      "Source performance",
      "Applications saved",
      "Active now",
      "Not yet submitted",
    ]) {
      expect(screen.queryByText(removed)).toBeNull();
    }
  });

  it("names each section as a landmark", async () => {
    await renderAnalytics(search());

    for (const name of [
      "Your funnel",
      "Where your funnel narrows",
      "What works",
      "Search activity",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("draws no more than the three agreed visualisations", async () => {
    const { container } = await renderAnalytics(search());

    // One line chart, and it is the only SVG the page draws for data. Nothing
    // here is a pie, a donut, a gauge, or a second line.
    expect(container.querySelectorAll("svg polyline")).toHaveLength(1);
    expect(container.querySelectorAll("path[d*='A']")).toHaveLength(0);
  });
});

describe("your funnel", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("shows the four milestones with their counts, in order", async () => {
    await renderAnalytics(search());
    const rows = funnelRows();

    expect(rows).toHaveLength(4);
    for (const [index, [label, count]] of [
      ["Submitted", "54"],
      ["Employer response", "9"],
      ["Interview", "4"],
      ["Offer", "1"],
    ].entries()) {
      expect(rows[index]).toContain(label);
      expect(rows[index]).toContain(count);
    }
  });

  it("announces each milestone once, as a phrase rather than a bare number", async () => {
    await renderAnalytics(search());
    const funnel = screen.getByRole("region", { name: "Your funnel" });
    const submitted = within(funnel).getAllByRole("listitem")[0];

    // The count is drawn in its own column and repeated in the label's
    // sr-only text. Announcing both would read the number twice — once with
    // nothing attached to it — so the visible one is hidden from assistive
    // technology and the sentence carries it.
    const visible = submitted.querySelector(".tabular-nums");
    expect(visible?.textContent).toBe("54");
    expect(visible).toHaveAttribute("aria-hidden", "true");

    const announced = Array.from(submitted.querySelectorAll(".sr-only"))
      .map((node) => node.textContent ?? "")
      .join("");
    expect(announced.replace(/\s+/g, " ").trim()).toBe(", 54 applications");
    expect(submitted.textContent).toContain("Submitted, 54 applications");
  });

  it("measures each step against the stage immediately above it", async () => {
    await renderAnalytics(search());
    const funnel = screen.getByRole("region", { name: "Your funnel" });

    // 9/54 = 17%, 4/9 = 44%, 1/4 = 25%. A share of submitted would have read
    // 17%, 7% and 2% — the old funnel's answer.
    expect(within(funnel).getByText("17% continued")).toBeInTheDocument();
    expect(within(funnel).getByText("44% continued")).toBeInTheDocument();
    expect(within(funnel).getByText("25% continued")).toBeInTheDocument();
    expect(within(funnel).queryByText("7% continued")).toBeNull();
  });

  it("counts an interview that later became a rejection", async () => {
    await renderAnalytics(search());

    // Three of the four interviews ended in rejection and are still interviews.
    expect(funnelRows()[2]).toContain("Interview, 4 applications");
  });

  it("shows both search ratios", async () => {
    await renderAnalytics(search());

    // 54 / 4 = 13.5, one decimal. 54 / 1 = 54, an integer.
    expect(screen.getByText("13.5")).toBeInTheDocument();
    expect(screen.getByText("applications per interview")).toBeInTheDocument();
    expect(screen.getByText("applications per offer")).toBeInTheDocument();
  });

  it("shows an em dash rather than zero when a ratio is undefined", async () => {
    await renderAnalytics(many("n", 6, { path: ["Applied"] }));

    const dashes = screen.getAllByText("—");
    expect(dashes).toHaveLength(2);
    // The two answers this must never give.
    expect(screen.queryByText("∞")).toBeNull();
    expect(screen.queryByText("NaN")).toBeNull();
  });

  it("omits a step's percentage when it has no denominator", async () => {
    await renderAnalytics(many("n", 6, { path: ["Applied"] }));
    const funnel = screen.getByRole("region", { name: "Your funnel" });

    // Six submitted, nothing came back: the first step is a real 0% and the two
    // below have no answer at all.
    expect(within(funnel).getByText("0% continued")).toBeInTheDocument();
    expect(within(funnel).getAllByText(/continued$/)).toHaveLength(1);
  });

  it("keeps the bars decorative, because every number is already text", async () => {
    const { container } = await renderAnalytics(search());
    const funnel = screen.getByRole("region", { name: "Your funnel" });

    expect(
      within(funnel).getAllByText(/continued$/).length,
    ).toBeGreaterThan(0);
    expect(container.querySelectorAll("li [aria-hidden='true']").length)
      .toBeGreaterThan(0);
  });
});

describe("where your funnel narrows", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("names the lowest recorded step with its sample", async () => {
    await renderAnalytics(search());
    const narrowing = screen.getByRole("region", {
      name: "Where your funnel narrows",
    });

    expect(
      within(narrowing).getByText("Submitted → employer response"),
    ).toBeInTheDocument();
    expect(within(narrowing).getByText("17%")).toBeInTheDocument();
    expect(within(narrowing).getByText("9 of 54 progressed")).toBeInTheDocument();
  });

  it("says it describes what happened, not why", async () => {
    await renderAnalytics(search());

    expect(
      screen.getByText(
        /describes what happened in your recorded search, not why an employer made a decision/,
      ),
    ).toBeInTheDocument();
  });

  it("is absent below five submitted applications", async () => {
    await renderAnalytics(many("n", 3, { path: ["Applied"] }));

    expect(
      screen.queryByRole("region", { name: "Where your funnel narrows" }),
    ).toBeNull();
    // One quiet sentence, not a panel.
    expect(
      screen.getByText("More comparisons appear as your submitted history grows."),
    ).toBeInTheDocument();
    // The funnel's own counts are still there.
    expect(screen.getByRole("region", { name: "Your funnel" })).toBeInTheDocument();
  });

  it("appears at exactly five submitted applications", async () => {
    await renderAnalytics(many("n", 5, { path: ["Applied"] }));

    expect(
      screen.getByRole("region", { name: "Where your funnel narrows" }),
    ).toBeInTheDocument();
  });

  it("still draws every step's rate when no step is eligible to be named", async () => {
    // 80 submitted, 1 interview, 0 offers: `Interview → offer` is 0 of 1.
    await renderAnalytics([
      ...many("n", 79, { path: ["Applied"] }),
      { id: "i", path: ["Applied", "Interview"] },
    ]);

    const funnel = screen.getByRole("region", { name: "Your funnel" });
    // The funnel is unchanged by the eligibility rule — 1/80, 1/1 and 0/1 are
    // all still drawn, because a rate the student can see the denominator of
    // is not a claim about anything.
    expect(within(funnel).getByText("1% continued")).toBeInTheDocument();
    expect(within(funnel).getByText("100% continued")).toBeInTheDocument();
    expect(within(funnel).getByText("0% continued")).toBeInTheDocument();

    // What the page will not do is single that 0-of-1 out as the answer. The
    // narrowest *observed* rate is the one nobody can measure; the narrowest
    // rate with enough behind it to be worth a sentence is 1 of 80.
    const narrowing = screen.getByRole("region", {
      name: "Where your funnel narrows",
    });
    expect(within(narrowing).getByText("Submitted → employer response"))
      .toBeInTheDocument();
    expect(within(narrowing).getByText("1 of 80 progressed")).toBeInTheDocument();
    expect(within(narrowing).queryByText("Interview → offer")).toBeNull();
    expect(within(narrowing).queryByText("0 of 1 progressed")).toBeNull();
  });
});

describe("what works", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("shows a composition per group with its sample size", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });

    const linkedIn = within(works)
      .getByText("LinkedIn")
      .closest("li") as HTMLElement;
    expect(within(linkedIn).getByText("n=45")).toBeInTheDocument();

    const website = within(works)
      .getByText("Company website")
      .closest("li") as HTMLElement;
    expect(within(website).getByText("n=8")).toBeInTheDocument();
  });

  it("exposes every milestone count as text, with no hover needed", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });
    const website = within(works)
      .getByText("Company website")
      .closest("li") as HTMLElement;

    // 8 submitted: 5 rejected without an interview, 3 interviewed.
    expect(within(website).getByText("5")).toBeInTheDocument();
    expect(within(website).getByText("3")).toBeInTheDocument();
    expect(within(website).getAllByText("0").length).toBeGreaterThan(0);
  });

  it("names the four segments in a legend", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });

    for (const label of [
      "No recorded response",
      "Response",
      "Interview",
      "Offer",
    ]) {
      expect(within(works).getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("switches lenses without a second chart", async () => {
    await renderAnalytics([
      ...many("f", 8, {
        source: "LinkedIn",
        category: "Finance",
        path: ["Applied"],
      }),
      ...many("m", 6, {
        source: "Company website",
        category: "Marketing",
        path: ["Applied", "Interview"],
      }),
    ]);

    const works = screen.getByRole("region", { name: "What works" });
    expect(within(works).getByText("LinkedIn")).toBeInTheDocument();
    expect(within(works).queryByText("Finance")).toBeNull();

    fireEvent.click(within(works).getByRole("radio", { name: "Role type" }));

    expect(within(works).getByText("Finance")).toBeInTheDocument();
    expect(within(works).getByText("Marketing")).toBeInTheDocument();
    // The same visualisation, re-plotted: the source rows are gone rather than
    // a second chart having appeared below them.
    expect(within(works).queryByText("LinkedIn")).toBeNull();
  });

  it("communicates the selected lens programmatically, not only in colour", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });

    const source = within(works).getByRole("radio", { name: "Source" });
    const role = within(works).getByRole("radio", { name: "Role type" });

    expect(source).toHaveAttribute("aria-checked", "true");
    expect(role).toHaveAttribute("aria-checked", "false");

    fireEvent.click(role);

    expect(role).toHaveAttribute("aria-checked", "true");
    expect(source).toHaveAttribute("aria-checked", "false");
  });

  it("moves between lenses with the arrow keys", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });
    const source = within(works).getByRole("radio", { name: "Source" });
    const role = within(works).getByRole("radio", { name: "Role type" });

    // Roving tabindex: the group costs one tab stop, not one per option.
    expect(source).toHaveAttribute("tabindex", "0");
    expect(role).toHaveAttribute("tabindex", "-1");

    source.focus();
    fireEvent.keyDown(source, { key: "ArrowRight" });

    // Selection follows focus, and the chart follows selection.
    expect(role).toHaveAttribute("aria-checked", "true");
    expect(source).toHaveAttribute("aria-checked", "false");
    expect(role).toHaveAttribute("tabindex", "0");
    expect(role).toHaveFocus();
    expect(within(works).getByText("Marketing")).toBeInTheDocument();

    // Down is a synonym for right, so the control works in either mental model.
    fireEvent.keyDown(role, { key: "ArrowLeft" });
    expect(source).toHaveAttribute("aria-checked", "true");
    expect(source).toHaveFocus();

    fireEvent.keyDown(source, { key: "ArrowDown" });
    expect(role).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(role, { key: "ArrowUp" });
    expect(source).toHaveAttribute("aria-checked", "true");
  });

  it("wraps at both ends rather than dead-ending", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });
    const source = within(works).getByRole("radio", { name: "Source" });
    const role = within(works).getByRole("radio", { name: "Role type" });

    // Left from the first option is the last option, not nothing.
    source.focus();
    fireEvent.keyDown(source, { key: "ArrowLeft" });
    expect(role).toHaveAttribute("aria-checked", "true");
    expect(role).toHaveFocus();

    fireEvent.keyDown(role, { key: "ArrowRight" });
    expect(source).toHaveAttribute("aria-checked", "true");
    expect(source).toHaveFocus();
  });

  it("leaves keys it does not own to the page", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });
    const source = within(works).getByRole("radio", { name: "Source" });

    source.focus();
    const tab = fireEvent.keyDown(source, { key: "Tab" });
    // Not swallowed: Tab still moves out of the group.
    expect(tab).toBe(true);
    expect(source).toHaveAttribute("aria-checked", "true");
  });

  it("does not qualify Source when Not specified is the only other group", async () => {
    await renderAnalytics([
      ...many("l", 6, {
        source: "LinkedIn",
        category: "Finance",
        path: ["Applied"],
      }),
      ...many("u", 5, {
        source: UNSPECIFIED_DATABASE_VALUE,
        category: "Marketing",
        path: ["Applied", "Interview"],
      }),
    ]);

    const works = screen.getByRole("region", { name: "What works" });
    // One named source and a residue bucket is one source, so the lens with an
    // actual comparison in it is the one that shows — and there is nothing to
    // switch to.
    expect(within(works).getByText("Finance")).toBeInTheDocument();
    expect(within(works).getByText("Marketing")).toBeInTheDocument();
    expect(within(works).queryByText("LinkedIn")).toBeNull();
    expect(within(works).queryByRole("radiogroup")).toBeNull();
  });

  it("qualifies Source at two named groups, and still draws Not specified", async () => {
    await renderAnalytics([
      ...many("l", 6, {
        source: "LinkedIn",
        category: "Finance",
        path: ["Applied"],
      }),
      ...many("r", 5, {
        source: "Referral",
        category: "Finance",
        path: ["Applied", "Interview"],
      }),
      ...many("u", 4, {
        source: UNSPECIFIED_DATABASE_VALUE,
        category: "Finance",
        path: ["Applied"],
      }),
    ]);

    const works = screen.getByRole("region", { name: "What works" });
    expect(within(works).getByText("LinkedIn")).toBeInTheDocument();
    expect(within(works).getByText("Referral")).toBeInTheDocument();
    // Residue is not a source, but once the comparison stands on its own it is
    // still part of what the student sent, and hiding it would lose applications.
    expect(within(works).getByText("Not specified")).toBeInTheDocument();
    // Role type is one category here, so Source is the only lens.
    expect(within(works).queryByRole("radiogroup")).toBeNull();
  });

  it("marks a small sample without hiding it or warning about it", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });

    const referral = within(works)
      .getByText("Referral")
      .closest("li") as HTMLElement;
    expect(within(referral).getByText("small sample")).toBeInTheDocument();
    expect(within(referral).getByText("n=1")).toBeInTheDocument();
    // No alarm: the treatment is a muted label and nothing else.
    expect(within(works).queryByRole("alert")).toBeNull();
    expect(within(works).queryByText(/warning|caution|unreliable/i)).toBeNull();
  });

  it("falls back to role type when source cannot form a comparison", async () => {
    await renderAnalytics([
      ...many("f", 5, {
        source: UNSPECIFIED_DATABASE_VALUE,
        category: "Finance",
        path: ["Applied"],
      }),
      ...many("m", 4, {
        source: UNSPECIFIED_DATABASE_VALUE,
        category: "Marketing",
        path: ["Applied", "Interview"],
      }),
    ]);

    const works = screen.getByRole("region", { name: "What works" });
    expect(within(works).getByText("Finance")).toBeInTheDocument();
    // A single unspecified bucket is not a comparison, so the control has
    // nothing to switch between and is not drawn.
    expect(within(works).queryByRole("radiogroup")).toBeNull();
  });

  it("omits the section entirely when neither lens can compare", async () => {
    await renderAnalytics(
      many("f", 6, {
        source: UNSPECIFIED_DATABASE_VALUE,
        category: "Finance",
        path: ["Applied"],
      }),
    );

    expect(screen.queryByRole("region", { name: "What works" })).toBeNull();
    // And no empty panel stands in for it.
    expect(screen.queryByText(/no source data/i)).toBeNull();
  });

  it("orders groups by volume, never by rate", async () => {
    await renderAnalytics(search());
    const works = screen.getByRole("region", { name: "What works" });

    const labels = within(works)
      .getAllByRole("listitem")
      .map((item) => item.textContent ?? "")
      .filter((text) => text.includes("n="));

    expect(labels[0]).toContain("LinkedIn");
    expect(labels.at(-1)).toContain("Referral");
  });

  it("names no source best or worst, and recommends nothing", async () => {
    await renderAnalytics(search());

    expect(
      screen.queryByText(/best|worst|top source|should |recommend|stop using/i),
    ).toBeNull();
  });
});

describe("search activity", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  /** Dated submissions spread across two recent weeks, relative to today. */
  function datedSearch(dates: string[]): Seed[] {
    return dates.map((date, index) => ({
      id: `d${index}`,
      source: index % 2 === 0 ? "LinkedIn" : "Company website",
      path: ["Applied"] as ApplicationStatus[],
      dateApplied: date,
    }));
  }

  function recentDates(): string[] {
    const today = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - index * 3);
      return day.toISOString().slice(0, 10);
    });
  }

  it("draws one line and exposes every weekly value as text", async () => {
    const { container } = await renderAnalytics(datedSearch(recentDates()));
    const activity = screen.getByRole("region", { name: "Search activity" });

    expect(container.querySelectorAll("svg polyline")).toHaveLength(1);
    expect(within(activity).getByText("Submitted applications by week"))
      .toBeInTheDocument();
    // Twelve weeks, each stated, so the drawing itself carries no unique
    // information and is hidden from assistive technology.
    expect(
      within(activity).getAllByText(/^Week of .+: \d+ submitted/),
    ).toHaveLength(12);
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("discloses incomplete date coverage quietly", async () => {
    await renderAnalytics([
      ...datedSearch(recentDates()),
      ...many("u", 4, { path: ["Applied"], dateApplied: null }),
    ]);

    expect(
      screen.getByText(
        "Based on 6 of 10 submitted applications with a recorded application date.",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing about coverage when every submission has a date", async () => {
    await renderAnalytics(datedSearch(recentDates()));

    expect(screen.queryByText(/^Based on \d+ of \d+/)).toBeNull();
  });

  it("omits the chart when there is not enough dated history", async () => {
    await renderAnalytics(many("n", 8, { path: ["Applied"], dateApplied: null }));

    expect(screen.queryByRole("region", { name: "Search activity" })).toBeNull();
    expect(
      screen.getByText(
        "More dated submissions are needed to show activity over time.",
      ),
    ).toBeInTheDocument();
  });

  it("keeps the section free of goals, streaks and comparisons", async () => {
    await renderAnalytics(datedSearch(recentDates()));

    expect(
      screen.queryByText(/goal|streak|score|target|last week|percentile/i),
    ).toBeNull();
  });
});

describe("progressive disclosure", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("shows a V2 empty state with nothing saved at all", async () => {
    await renderAnalytics([]);

    expect(screen.getByText("No search history yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add application" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("says there is no submitted history when nothing has been sent", async () => {
    await renderAnalytics([
      { id: "a", path: ["Interested"] },
      { id: "b", path: ["Interested", "Preparing"] },
    ]);

    expect(screen.getByText("No submitted history yet.")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Your funnel and performance comparisons appear after applications have been submitted/,
      ),
    ).toBeInTheDocument();
    // Not a call to action, and not a judgement.
    expect(screen.queryByText(/behind|keep going|start applying/i)).toBeNull();
  });

  it("shows counts and defined ratios at one to four submitted", async () => {
    await renderAnalytics([
      { id: "a", path: ["Applied", "Interview"] },
      ...many("n", 2, { path: ["Applied"] }),
    ]);

    // 3 submitted over 1 interview, and the funnel still draws its counts.
    expect(funnelRows()[0]).toContain("Submitted, 3 applications");
    expect(funnelRows()[2]).toContain("Interview, 1 application");
    expect(
      screen.queryByRole("region", { name: "Where your funnel narrows" }),
    ).toBeNull();
  });

  it("leaves no section rendered as an empty box", async () => {
    await renderAnalytics(many("n", 3, { path: ["Applied"] }));

    // Only the funnel earns a section at this size, and exactly one sentence
    // explains the rest. A quiet paragraph per absent section would be the
    // empty-state grid this design avoids, drawn in text instead of boxes.
    expect(screen.getAllByRole("region")).toHaveLength(1);
    expect(screen.getAllByText(/More .+ (appear|are needed)/)).toHaveLength(1);
    expect(
      screen.getByText("More comparisons appear as your submitted history grows."),
    ).toBeInTheDocument();
  });

  it("withholds the performance comparison below five submitted", async () => {
    // Two sources, so the lens would qualify on group count alone — but n=2
    // against n=1 is two coin flips side by side, and drawing them invites a
    // reader to prefer one.
    await renderAnalytics([
      { id: "a", source: "LinkedIn", path: ["Applied", "Interview"] },
      { id: "b", source: "LinkedIn", path: ["Applied"] },
      { id: "c", source: "Referral", path: ["Applied"] },
    ]);

    expect(screen.queryByRole("region", { name: "What works" })).toBeNull();
    // The funnel's own facts are still there. It is the conclusions that wait.
    expect(funnelRows()[0]).toContain("Submitted, 3 applications");
  });
});

describe("failed reads", () => {
  beforeEach(() => {
    listApplicationsForAnalytics.mockReset();
    listStatusHistory.mockReset();
  });

  it("reports a failure rather than showing an empty funnel", async () => {
    listApplicationsForAnalytics.mockResolvedValue({
      data: null,
      error: { code: "PGRST301" },
    });
    listStatusHistory.mockResolvedValue({ data: [], error: null });

    render(await AnalyticsPage());

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Analytics could not be loaded")).toBeInTheDocument();
    expect(screen.getByText(/Refresh the page to try again/)).toBeInTheDocument();
    // Zeros would be a claim about the search that is only true when the query
    // succeeded.
    expect(screen.queryByRole("region", { name: "Your funnel" })).toBeNull();
  });

  it("exposes no database detail to the student", async () => {
    listApplicationsForAnalytics.mockResolvedValue({ data: [], error: null });
    listStatusHistory.mockResolvedValue({
      data: null,
      error: { code: "PGRST301" },
    });

    render(await AnalyticsPage());

    expect(
      screen.queryByText(/database|connection|PGRST|supabase|query/i),
    ).toBeNull();
  });
});
