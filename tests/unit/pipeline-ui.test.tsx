import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import type { ApplicationListItem } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    }),
  },
};
const listActiveApplications = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/applications/repository", () => ({
  listActiveApplications: (...args: unknown[]) => listActiveApplications(...args),
}));
// The move control posts to a Server Action, which cannot run in a unit
// environment. What the action does is asserted in `pipeline-move.test.ts`;
// what these tests are about is what a student is offered.
vi.mock("@/lib/applications/actions", () => ({
  moveApplicationStatusAction: vi.fn(),
}));

const { PipelineBoard } = await import("@/components/pipeline/pipeline-board");

let sequence = 0;

function application(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  sequence += 1;

  return {
    id: `1111111${sequence}-1111-4111-8111-111111111111`,
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto",
    work_arrangement: "Hybrid",
    work_term_season: "Winter 2027",
    date_applied: "2026-08-22",
    application_deadline: null,
    next_action: null,
    next_action_due_date: null,
    created_at: "2026-08-20T10:00:00.000Z",
    archived_at: null,
    ...overrides,
  };
}

async function renderBoard(
  options: {
    rows?: ApplicationListItem[];
    fails?: boolean;
    filters?: Record<string, string>;
  } = {},
) {
  listActiveApplications.mockResolvedValue(
    options.fails
      ? { data: null, error: { code: "PGRST500" } }
      : { data: options.rows ?? [application()], error: null },
  );

  return render(await PipelineBoard({ filters: options.filters ?? {} }));
}

/** The cards in one status column. */
function cardsIn(status: string): HTMLElement[] {
  const column = screen.getByRole("list", { name: `${status} applications` });
  return Array.from(column.children) as HTMLElement[];
}

beforeEach(() => {
  listActiveApplications.mockReset();
});

describe("the board shows every status as a column", () => {
  it("heads each column with its status and how many are at it", async () => {
    await renderBoard({
      rows: [
        application({ current_status: "Interested" }),
        application({ current_status: "Interested" }),
        application({ current_status: "Applied" }),
      ],
    });

    for (const status of APPLICATION_STATUSES) {
      expect(
        screen.getByRole("heading", { level: 2, name: status }),
      ).toBeInTheDocument();
    }

    const interested = screen
      .getByRole("heading", { level: 2, name: "Interested" })
      .closest("section") as HTMLElement;
    expect(within(interested).getByText("2")).toBeInTheDocument();
  });

  it("puts each application under its own status", async () => {
    await renderBoard({
      rows: [
        application({ company_name: "Shopify", current_status: "Interview" }),
        application({ company_name: "RBC", current_status: "Applied" }),
      ],
    });

    expect(cardsIn("Interview")).toHaveLength(1);
    expect(within(cardsIn("Interview")[0]).getByText("Shopify")).toBeInTheDocument();
    expect(within(cardsIn("Applied")[0]).getByText("RBC")).toBeInTheDocument();
  });

  it("counts what it read, so the total matches the columns", async () => {
    await renderBoard({
      rows: [
        application({ current_status: "Interested" }),
        application({ current_status: "Rejected" }),
      ],
    });

    expect(screen.getByText("2 applications")).toBeInTheDocument();
    // A rejected application that was never archived is still on the board.
    expect(cardsIn("Rejected")).toHaveLength(1);
  });

  it("says one application in the singular", async () => {
    await renderBoard({ rows: [application()] });

    expect(screen.getByText("1 application")).toBeInTheDocument();
  });

  it("shows an empty column rather than a gap in the sequence", async () => {
    await renderBoard({ rows: [application({ current_status: "Applied" })] });

    const screening = screen
      .getByRole("heading", { level: 2, name: "Screening" })
      .closest("section") as HTMLElement;

    expect(within(screening).getByText("0")).toBeInTheDocument();
    expect(within(screening).getByText("None")).toBeInTheDocument();
  });

  it("keeps every status at every width, empty ones included", async () => {
    await renderBoard({ rows: [application({ current_status: "Applied" })] });

    // Nothing is hidden below `md`: a student counting ten headings on a phone
    // sees the same ten, in the same order, as on a desktop.
    for (const status of APPLICATION_STATUSES) {
      const column = screen
        .getByRole("heading", { level: 2, name: status })
        .closest("section") as HTMLElement;

      expect(column.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    }
  });

  it("keeps the canonical status order", async () => {
    await renderBoard({ rows: [application()] });

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((heading) => heading.textContent);

    expect(headings).toEqual([...APPLICATION_STATUSES]);
  });
});

describe("a card leads with the role, then places it", () => {
  it("names the role and the employer in one link to the record", async () => {
    await renderBoard({
      rows: [
        application({
          company_name: "Shopify",
          original_job_title: "Marketing Intern",
        }),
      ],
    });

    const card = cardsIn("Applied")[0];
    const link = within(card).getByRole("link");

    // The role leads, as it does on the applications list: two roles at one
    // employer are the pair a student most needs to tell apart.
    expect(link).toHaveAccessibleName("Marketing Intern Shopify");
    expect(link.getAttribute("href")).toMatch(/^\/applications\//);
  });

  it("shows the location and the work term as quiet metadata", async () => {
    await renderBoard({
      rows: [application({ location: "Toronto", work_term_season: "Fall 2027" })],
    });

    expect(
      within(cardsIn("Applied")[0]).getByText("Toronto · Fall 2027"),
    ).toBeInTheDocument();
  });

  it("drops the separator when only one of the two is recorded", async () => {
    await renderBoard({
      rows: [
        application({
          location: "Not specified",
          work_term_season: "Fall 2027",
        }),
      ],
    });

    expect(
      within(cardsIn("Applied")[0]).getByText("Fall 2027"),
    ).toBeInTheDocument();
  });

  it("shows a recorded next action ahead of anything else", async () => {
    await renderBoard({
      rows: [
        application({
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-09-01",
          application_deadline: "2026-08-30",
        }),
      ],
    });

    const card = cardsIn("Applied")[0];
    expect(within(card).getByText("Follow up with recruiter")).toBeInTheDocument();
    expect(within(card).getByText(/Sep 1, 2026/)).toBeInTheDocument();
  });

  it("shows a deadline only while the application has not been sent", async () => {
    await renderBoard({
      rows: [
        application({
          current_status: "Interested",
          application_deadline: "2026-08-30",
        }),
        application({
          current_status: "Applied",
          application_deadline: "2026-08-30",
        }),
      ],
    });

    expect(
      within(cardsIn("Interested")[0]).getByText("Application deadline"),
    ).toBeInTheDocument();
    // The deadline has served its purpose once the application is out.
    expect(
      within(cardsIn("Applied")[0]).queryByText("Application deadline"),
    ).not.toBeInTheDocument();
  });

  it("keeps the placement line when there is a next item too", async () => {
    // The two answer different questions, so a recorded follow-up must not
    // cost the card its location.
    await renderBoard({
      rows: [
        application({
          location: "Toronto",
          work_term_season: "Fall 2027",
          next_action: "Follow up with recruiter",
          next_action_due_date: "2026-09-01",
        }),
      ],
    });

    const card = cardsIn("Applied")[0];
    expect(within(card).getByText("Toronto · Fall 2027")).toBeInTheDocument();
    expect(within(card).getByText("Follow up with recruiter")).toBeInTheDocument();
  });

  it("shows no next item at all when the record holds neither", async () => {
    await renderBoard({ rows: [application()] });

    const card = cardsIn("Applied")[0];
    expect(within(card).queryByText("Application deadline")).toBeNull();
    // Only the placement line, the identity, and the move control.
    expect(within(card).queryByText("—")).toBeNull();
  });

  it("does not repeat the lifecycle rail the column already states", async () => {
    await renderBoard({ rows: [application()] });

    expect(
      screen.queryByText(/Lifecycle progress/, { exact: false }),
    ).not.toBeInTheDocument();
  });
});

describe("a card can be moved by keyboard alone", () => {
  it("offers every status through a real form control", async () => {
    await renderBoard({
      rows: [
        application({
          company_name: "RBC",
          original_job_title: "Business Analyst Intern",
        }),
      ],
    });

    const menu = screen.getByLabelText(
      "Move Business Analyst Intern at RBC to another status",
    ) as HTMLSelectElement;

    expect(menu.tagName).toBe("SELECT");
    expect(
      Array.from(menu.options).map((option) => option.value),
    ).toEqual([...APPLICATION_STATUSES]);
    // It opens on where the application already is, so submitting without
    // choosing changes nothing.
    expect(menu.value).toBe("Applied");
    // Thirty cards is thirty "Move" buttons to somebody listening to them one
    // at a time, so each says which application it belongs to.
    expect(
      within(cardsIn("Applied")[0]).getByRole("button", {
        name: "Move Business Analyst Intern at RBC",
      }),
    ).toBeInTheDocument();
  });

  it("carries the application's id and the filters in view", async () => {
    await renderBoard({
      rows: [application()],
      filters: {
        search: "analyst",
        workTermSeason: "Winter 2027",
        category: "Marketing",
      },
    });

    const card = cardsIn("Applied")[0];
    const values = Array.from(
      card.querySelectorAll("input[type=hidden]"),
    ).map((input) => [
      input.getAttribute("name"),
      input.getAttribute("value"),
    ]);

    expect(values).toContainEqual(["q", "analyst"]);
    expect(values).toContainEqual(["work_term", "Winter 2027"]);
    expect(values).toContainEqual(["category", "Marketing"]);
    expect(values.map(([name]) => name)).toContain("applicationId");
  });

  it("sends no filter fields when nothing is filtered", async () => {
    await renderBoard({ rows: [application()] });

    const names = Array.from(
      cardsIn("Applied")[0].querySelectorAll("input[type=hidden]"),
    ).map((input) => input.getAttribute("name"));

    expect(names).toEqual(["applicationId"]);
  });
});

describe("the board when there is nothing to show", () => {
  it("tells a student with no applications what to do", async () => {
    await renderBoard({ rows: [] });

    expect(screen.getByText("Nothing in the pipeline")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clear filters" })).toBeNull();
  });

  it("offers the way in that this app actually has", async () => {
    await renderBoard({ rows: [] });

    // Adding is a panel the applications list opens; there is no
    // `/applications/new` route to send anybody to.
    expect(
      screen.getByRole("link", { name: "Add an application" }),
    ).toHaveAttribute("href", "/applications");
  });

  it("does not offer it when filters are what emptied the board", async () => {
    await renderBoard({ rows: [], filters: { category: "Marketing" } });

    expect(screen.queryByRole("link", { name: "Add an application" })).toBeNull();
  });

  it("offers a way out when filters matched nothing", async () => {
    await renderBoard({ rows: [], filters: { search: "nothing" } });

    expect(
      screen.getByText("No applications match these filters"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/pipeline",
    );
  });

  it("says so plainly when the read failed", async () => {
    await renderBoard({ fails: true });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The pipeline could not be loaded",
    );
  });

  it("reads only the caller's own active applications", async () => {
    await renderBoard({ rows: [application()], filters: { search: "analyst" } });

    expect(listActiveApplications).toHaveBeenCalledWith(
      supabase,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      { search: "analyst" },
    );
  });
});
