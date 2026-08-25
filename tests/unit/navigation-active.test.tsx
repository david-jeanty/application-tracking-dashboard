import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  demoNavigationItems,
  isNavigationItemActive,
  navigationItems,
} from "@/components/app-shell/navigation";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

vi.mock("@/lib/auth/actions", () => ({ signOutAction: vi.fn() }));

const pathname = vi.hoisted(() => ({ current: "/demo" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

const { SidebarContent } = await import(
  "@/components/app-shell/sidebar-content"
);

/** The one row the sidebar says is the current page, if there is exactly one. */
function currentRow(at: string, identity: Parameters<typeof SidebarContent>[0]["identity"]) {
  pathname.current = at;
  cleanup();
  render(<SidebarContent identity={identity} />);

  return screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page");
}

const DEMO = { kind: "demo" } as const;
const ACCOUNT = {
  kind: "account",
  displayName: "Alex Chen",
  email: "student@uottawa.ca",
} as const;

describe("which row a path belongs to", () => {
  it("gives a section every route beneath it", () => {
    const applications = navigationItems.find(
      (item) => item.label === "Applications",
    )!;

    expect(isNavigationItemActive("/applications", applications)).toBe(true);
    expect(isNavigationItemActive("/applications/abc", applications)).toBe(true);
    expect(isNavigationItemActive("/applications/abc/edit", applications)).toBe(
      true,
    );
  });

  it("does not let a section claim a sibling that merely starts the same", () => {
    const applications = navigationItems.find(
      (item) => item.label === "Applications",
    )!;

    expect(isNavigationItemActive("/analytics", applications)).toBe(false);
  });

  it("keeps an exact row to its own route", () => {
    const demoDashboard = demoNavigationItems.find(
      (item) => item.label === "Dashboard",
    )!;

    expect(demoDashboard.match).toBe("exact");
    expect(isNavigationItemActive("/demo", demoDashboard)).toBe(true);
    // The bug this fixes: `/demo` is the parent of every other demo route, so
    // prefix matching lit the dashboard on all of them.
    expect(isNavigationItemActive("/demo/applications", demoDashboard)).toBe(
      false,
    );
    expect(isNavigationItemActive("/demo/pipeline", demoDashboard)).toBe(false);
  });
});

describe("the signed-in sidebar", () => {
  it("marks exactly one row on each of its routes", () => {
    for (const [path, label] of [
      ["/dashboard", "Dashboard"],
      ["/applications", "Applications"],
      ["/applications/11111111-1111-4111-8111-111111111111", "Applications"],
      ["/pipeline", "Pipeline"],
      ["/analytics", "Analytics"],
      ["/archive", "Archive"],
      ["/settings", "Settings"],
    ] as const) {
      const current = currentRow(path, ACCOUNT);

      expect(current, path).toHaveLength(1);
      expect(current[0], path).toHaveTextContent(label);
    }
  });
});

describe("the demo sidebar", () => {
  it("marks exactly one row on each demo route", () => {
    for (const [path, label] of [
      ["/demo", "Dashboard"],
      ["/demo/applications", "Applications"],
      ["/demo/applications/example-id", "Applications"],
      ["/demo/pipeline", "Pipeline"],
      ["/demo/analytics", "Analytics"],
    ] as const) {
      const current = currentRow(path, DEMO);

      expect(current, path).toHaveLength(1);
      expect(current[0], path).toHaveTextContent(label);
    }
  });

  it("never lights the dashboard on a nested demo route", () => {
    for (const path of [
      "/demo/applications",
      "/demo/applications/example-id",
      "/demo/pipeline",
      "/demo/analytics",
    ]) {
      pathname.current = path;
      cleanup();
      render(<SidebarContent identity={DEMO} />);

      expect(
        screen.getByRole("link", { name: "Dashboard" }),
        path,
      ).not.toHaveAttribute("aria-current");
    }
  });

  it("keeps an open record inside Applications", () => {
    const current = currentRow("/demo/applications/ibm-marketing-w27", DEMO);

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute("href", "/demo/applications");
  });
});
