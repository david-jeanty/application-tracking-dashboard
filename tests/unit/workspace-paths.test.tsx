import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyticsPath,
  applicationPath,
  applicationsPath,
  pipelinePath,
  workspaceHomePath,
} from "@/lib/demo/paths";
import { buildPipelineBoard } from "@/lib/pipeline/board";
import type { ApplicationListItem } from "@/lib/applications/types";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// The move control posts to a Server Action, which cannot run in a unit
// environment. Whether it is *rendered* is exactly what this suite is about.
vi.mock("@/lib/applications/actions", () => ({
  moveApplicationStatusAction: vi.fn(),
}));

const { PipelineColumns } = await import("@/components/pipeline/pipeline-board");
const { ApplicationRecords } = await import(
  "@/components/applications/application-list"
);

function application(
  overrides: Partial<ApplicationListItem> = {},
): ApplicationListItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    company_name: "RBC",
    company_domain: null,
    original_job_title: "Business Analyst Intern",
    normalized_job_category: "Business Analysis",
    current_status: "Applied",
    location: "Toronto, ON",
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

describe("the base path is a prefix and nothing more", () => {
  it("resolves the production workspace by default", () => {
    expect(applicationsPath()).toBe("/applications");
    expect(applicationPath("abc")).toBe("/applications/abc");
    expect(pipelinePath()).toBe("/pipeline");
    expect(analyticsPath()).toBe("/analytics");
    expect(workspaceHomePath()).toBe("/dashboard");
  });

  it("resolves the demo workspace when asked for it", () => {
    expect(applicationsPath("/demo")).toBe("/demo/applications");
    expect(applicationPath("abc", "/demo")).toBe("/demo/applications/abc");
    expect(pipelinePath("/demo")).toBe("/demo/pipeline");
    expect(analyticsPath("/demo")).toBe("/demo/analytics");
  });

  it("sends the demo home to /demo rather than a second name for it", () => {
    // `/demo/dashboard` would be a route a visitor has already arrived at.
    expect(workspaceHomePath("/demo")).toBe("/demo");
  });
});

describe("the shared applications list", () => {
  it("links to the production record when no base path is given", () => {
    render(<ApplicationRecords applications={[application()]} history={[]} />);

    expect(
      screen.getByRole("link", { name: "Business Analyst Intern" }),
    ).toHaveAttribute("href", "/applications/11111111-1111-4111-8111-111111111111");
  });

  it("keeps demo records on the existing Applications surface", () => {
    const { container } = render(
      <ApplicationRecords
        applications={[application()]}
        basePath="/demo"
        history={[]}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Show details for Business Analyst Intern",
      }),
    ).toBeInTheDocument();
    expect(
      container.querySelector('a[href^="/demo/applications/"]'),
    ).toBeNull();
  });

  it("keeps the public homepage excerpt static", () => {
    const { container } = render(
      <ApplicationRecords
        applications={[application()]}
        basePath="/demo"
        history={[]}
        showSummary={false}
      />,
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("the shared pipeline board", () => {
  const board = buildPipelineBoard([application()]);

  it("keeps the Move control by default, as the real board must", () => {
    render(<PipelineColumns board={board} />);

    expect(
      screen.getByRole("button", { name: /^Move/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Move Business Analyst Intern at RBC/),
    ).toBeInTheDocument();
  });

  it("drops it entirely when the board is read-only", () => {
    const { container } = render(<PipelineColumns board={board} readOnly />);

    // Absent, not disabled: a greyed-out select would still be tabbed to and
    // still be announced, and would read as broken rather than as read-only.
    expect(screen.queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelector("[disabled]")).toBeNull();
  });

  it("still shows the whole card when read-only", () => {
    render(<PipelineColumns board={board} readOnly />);
    const column = screen.getByRole("list", { name: "Applied applications" });

    expect(
      within(column).getByRole("heading", { name: /Business Analyst Intern/ }),
    ).toHaveTextContent("RBC");
    expect(within(column).getByText(/Toronto, ON/)).toBeInTheDocument();
  });
});
