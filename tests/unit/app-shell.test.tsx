import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Signing out posts to a Server Action, which cannot run in a unit
// environment. What these tests are about is the frame around the page.
vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

const pathname = vi.hoisted(() => ({ current: "/applications" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { AppShell } = await import("@/components/app-shell/app-shell");

function renderShell(at = "/applications") {
  pathname.current = at;
  return render(
    <AppShell displayName="Alex Chen" email="student@uottawa.ca">
      <h1>Applications</h1>
    </AppShell>,
  );
}

describe("the workspace frame", () => {
  it("does not repeat the page heading in shell chrome", () => {
    renderShell();

    // The sidebar says where you are and the page supplies its own heading,
    // so the shell must not print the same word a second time.
    expect(screen.getAllByText("Applications")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Applications" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Applications" }),
    ).toBeInTheDocument();
  });

  it("keeps a skip link to the main content", () => {
    renderShell();
    const skip = screen.getByRole("link", { name: /skip to main content/i });

    expect(skip).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});

describe("navigation", () => {
  it("marks the current page for assistive technology", () => {
    renderShell("/applications");

    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("treats a nested route as still being on its section", () => {
    renderShell("/applications/11111111-1111-4111-8111-111111111111");

    expect(screen.getByRole("link", { name: "Applications" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("offers the whole workflow, with settings and archive included", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(
      within(nav).getAllByRole("link").map((link) => link.textContent),
    ).toEqual([
      "Dashboard",
      "Applications",
      "Pipeline",
      "Analytics",
      "Archive",
      "Settings",
    ]);
  });

  it("uses a real list, so the number of destinations is announced", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary navigation" });

    expect(within(nav).getAllByRole("list").length).toBeGreaterThan(0);
  });
});

describe("the mobile drawer", () => {
  it("stays closed until it is opened", () => {
    renderShell();

    expect(
      screen.queryByRole("complementary", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();
  });

  it("opens from the navigation trigger", () => {
    renderShell();

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    expect(
      screen.getByRole("complementary", { name: "Mobile navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("complementary", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();
  });

  it("closes once a destination is chosen", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

    const drawer = screen.getByRole("complementary", {
      name: "Mobile navigation",
    });
    fireEvent.click(within(drawer).getByRole("link", { name: "Analytics" }));

    expect(
      screen.queryByRole("complementary", { name: "Mobile navigation" }),
    ).not.toBeInTheDocument();
  });
});
