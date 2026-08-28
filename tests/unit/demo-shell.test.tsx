import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Signing out posts to a Server Action, which cannot run in a unit environment.
// The demo shell never renders that control; the account shell is here only as
// the comparison that proves it.
vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

const pathname = vi.hoisted(() => ({ current: "/demo/applications" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { AppShell } = await import("@/components/app-shell/app-shell");
const { DemoBanner } = await import("@/components/demo/demo-banner");

function renderDemoShell(at = "/demo/applications") {
  pathname.current = at;
  return render(
    <AppShell identity={{ kind: "demo" }}>
      <DemoBanner />
      <h1>Applications</h1>
    </AppShell>,
  );
}

describe("the demo navigation", () => {
  it("offers exactly the four surfaces that explain JobTrack", () => {
    renderDemoShell();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(
      within(nav).getAllByRole("link").map((link) => link.textContent),
    ).toEqual(["Dashboard", "Applications", "Pipeline", "Analytics"]);
  });

  it("points every row at a demo route", () => {
    renderDemoShell();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(
      within(nav).getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual([
      "/demo",
      "/demo/applications",
      "/demo/pipeline",
      "/demo/analytics",
    ]);
  });

  it("leaves out everything that belongs to an account", () => {
    renderDemoShell();

    expect(screen.queryByRole("link", { name: "Archive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("marks the current surface for assistive technology", () => {
    renderDemoShell("/demo/pipeline");

    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the wordmark, pointing at the demo's own home", () => {
    renderDemoShell();

    expect(screen.getAllByRole("link", { name: "Interndex" })[0]).toHaveAttribute(
      "href",
      "/demo",
    );
  });

  it("says what this workspace is, and offers one of your own", () => {
    renderDemoShell();

    expect(screen.getAllByText("Demo workspace").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sample data").length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Create account" })[0],
    ).toHaveAttribute("href", "/signup");
  });
});

describe("the frame itself is the production frame", () => {
  it("keeps the skip link and the main landmark", () => {
    renderDemoShell();

    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });

  it("opens and closes the mobile drawer, including on Escape", () => {
    renderDemoShell();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(
      screen.getByRole("complementary", { name: "Mobile navigation" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("complementary", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();
  });
});

describe("the sample-data banner", () => {
  it("says the workspace is a demo in words", () => {
    render(<DemoBanner />);

    expect(screen.getByText("Demo workspace")).toBeInTheDocument();
    expect(
      screen.getByText(/exploring Interndex with sample data/),
    ).toBeInTheDocument();
  });

  it("discloses that the employers and applications are fictional", () => {
    render(<DemoBanner />);

    expect(
      screen.getByText(/Sample applications are fictional/),
    ).toBeInTheDocument();
  });

  it("says the workspace is read-only rather than showing dead controls", () => {
    render(<DemoBanner />);

    expect(screen.getByText(/Nothing here can be changed/)).toBeInTheDocument();
  });

  it("offers the two ways out of the demo", () => {
    render(<DemoBanner />);

    expect(
      screen.getByRole("link", { name: "Create your own workspace" }),
    ).toHaveAttribute("href", "/signup");
    expect(
      screen.getByRole("link", { name: "Back to Interndex" }),
    ).toHaveAttribute("href", "/");
  });
});
