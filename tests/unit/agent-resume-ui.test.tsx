import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationResumePanel } from "@/components/agent/application-resume-panel";
import { ResumeList } from "@/components/agent/resume-list";
import type { ResumeListItem } from "@/lib/agent/resumes-repository";

afterEach(cleanup);

vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/applications" }));

const { AppShell } = await import("@/components/app-shell/app-shell");

const RESUME: ResumeListItem = {
  id: "f0000000-0000-4000-8000-000000000001",
  application_id: "a0000000-0000-4000-8000-000000000001",
  company: "Pinterest",
  role: "Strategy and Operations Intern",
  template: "jakes",
  status: "built",
  layout_check: "passed",
  builds_left: 1,
  has_pdf: true,
  has_html: true,
  resumelol_url: "https://www.resume.lol/editor/rl-1",
  created_at: "2026-11-13T15:00:00Z",
  estimated_tokens: 6_200,
};

describe("the sidebar", () => {
  function sidebarLinks(agentOwner?: boolean) {
    render(
      <AppShell identity={{ kind: "account", displayName: "Alex Chen", email: "a@example.com", agentOwner }}>
        <h1>Page</h1>
      </AppShell>,
    );
    const nav = screen.getAllByRole("navigation", { name: "Primary navigation" })[0];
    return within(nav).getAllByRole("link").map((link) => link.textContent);
  }

  it("shows Resumes to the agent's owner", () => {
    expect(sidebarLinks(true)).toContain("Resumes");
  });

  it("is unchanged for every other student", () => {
    expect(sidebarLinks(false)).toEqual(sidebarLinks(undefined));
    cleanup();
    expect(sidebarLinks(undefined)).not.toContain("Resumes");
    cleanup();
    expect(sidebarLinks(undefined)).toEqual(["Dashboard", "Applications", "Pipeline", "Analytics", "Archive", "Settings"]);
  });
});

describe("the resume list", () => {
  it("shows company, role, date, template, the layout result and the file links", () => {
    render(<ResumeList resumes={[RESUME]} />);
    expect(screen.getByRole("link", { name: "Strategy and Operations Intern" })).toHaveAttribute(
      "href",
      `/applications/${RESUME.application_id}`,
    );
    expect(screen.getByText(/Pinterest · Nov 13, 2026 · Jake's · about 6,200 tokens/)).toBeInTheDocument();
    expect(screen.getByText("One page, no widows")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the resume PDF/ })).toHaveAttribute("href", `/resumes/${RESUME.id}/pdf`);
    expect(screen.getByRole("link", { name: /Download the resume PDF/ })).toHaveAttribute(
      "href",
      `/resumes/${RESUME.id}/pdf?download=1`,
    );
  });

  it("offers the printable page when the server could not print a PDF", () => {
    render(<ResumeList resumes={[{ ...RESUME, has_pdf: false, layout_check: "skipped" }]} />);
    expect(screen.getByText("Layout not checked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the printable resume/ })).toHaveAttribute(
      "href",
      `/resumes/${RESUME.id}/print`,
    );
    expect(screen.queryByRole("link", { name: /Download/ })).toBeNull();
  });
});

describe("the application panel", () => {
  it("shows the resume, builds left, and the estimated usage per tool", () => {
    render(
      <ApplicationResumePanel
        panel={{
          resume: RESUME,
          usage: {
            calls: 3,
            estimated_tokens: 5_001,
            by_tool: [
              { tool: "get_playbook", calls: 1, estimated_tokens: 4_500 },
              { tool: "check_bullets", calls: 2, estimated_tokens: 501 },
            ],
          },
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Tailored resume" })).toBeInTheDocument();
    expect(screen.getByText(/Jake's template · 1 build left/)).toBeInTheDocument();
    expect(screen.getByText("Estimated usage: about 5,001 tokens")).toBeInTheDocument();
    expect(screen.getByText("check_bullets (2 calls)")).toBeInTheDocument();
  });

  it("says when nothing is built yet", () => {
    render(<ApplicationResumePanel panel={{ resume: null, usage: { calls: 0, estimated_tokens: 0, by_tool: [] } }} />);
    expect(screen.getByText("No resume built for this posting yet.")).toBeInTheDocument();
  });
});
