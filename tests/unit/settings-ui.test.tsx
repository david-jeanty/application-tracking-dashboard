import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Both forms on this page post to Server Actions, which cannot run in a unit
// environment. This suite is about what the page presents, not what they do.
vi.mock("@/lib/oauth/actions", () => ({ revokeGrantAction: vi.fn() }));

const listGrants = vi.fn();
const supabase = {
  auth: {
    getUser: async () => ({
      data: { user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } },
    }),
    oauth: { listGrants: (...args: unknown[]) => listGrants(...args) },
  },
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }));
vi.mock("@/lib/supabase/bearer", () => ({
  getMcpResourceUrl: () => "https://jobtrack.example/api/mcp",
}));

const { default: SettingsPage } = await import("@/app/(app)/settings/page");

function renderPage(
  options: {
    grants?: { client: { id: string; name: string }; granted_at: string }[];
    fails?: boolean;
    disconnect?: string;
  } = {},
) {
  listGrants.mockResolvedValue(
    options.fails
      ? { data: null, error: { code: "unavailable" } }
      : { data: options.grants ?? [], error: null },
  );
  return SettingsPage({
    searchParams: Promise.resolve({ disconnect: options.disconnect }),
  });
}

describe("the shape of the page", () => {
  it("has one page title, at the scale the rest of the product uses", async () => {
    render(await renderPage());

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Settings");
    expect(
      screen.getByText("Personalize Interndex and manage authorized connections."),
    ).toBeInTheDocument();
  });

  it("keeps Appearance and a truthful Connections section", async () => {
    render(await renderPage());

    expect(
      screen.getByRole("heading", { level: 2, name: "Appearance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Connections" }),
    ).toBeInTheDocument();
  });

  it("keeps every part of the connection explanation", async () => {
    render(await renderPage());

    for (const title of [
      "AI assistant",
      "Setting it up in Claude",
      "Try saying",
      "What a connected assistant can do",
      "Browser extension",
      "Authorized connections",
    ]) {
      expect(
        screen.getByRole("heading", { level: 3, name: title }),
      ).toBeInTheDocument();
    }
  });

  it("gives every section heading a level that follows the one above it", async () => {
    render(await renderPage());

    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));

    // No heading skips a level on its way down the page.
    expect(levels[0]).toBe(1);
    for (const [index, level] of levels.entries()) {
      if (index === 0) continue;
      expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
    }
  });
});

describe("the setup guidance", () => {
  it("still shows the address a student has to copy", async () => {
    render(await renderPage());

    expect(
      screen.getByText("https://jobtrack.example/api/mcp"),
    ).toBeInTheDocument();
  });

  it("still lists the setup steps in order", async () => {
    render(await renderPage());

    expect(
      screen.getByText("In Claude, open Settings, then Connectors."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Return to Claude and start asking about your applications."),
    ).toBeInTheDocument();
  });

  it("keeps the tracker-import guidance", async () => {
    render(await renderPage());

    expect(
      screen.getByText(/Export it as a CSV, upload that to your/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("“Import this old tracker into Interndex.”"),
    ).toBeInTheDocument();
  });
});

describe("the example prompts", () => {
  it("still offers every one of them", async () => {
    render(await renderPage());

    for (const prompt of [
      "Save this job to Interndex.",
      "What RBC jobs am I tracking?",
      "I applied to it today.",
      "Set my next action to follow up next Friday.",
    ]) {
      expect(screen.getByText(`“${prompt}”`)).toBeInTheDocument();
    }
  });

  it("does not decorate them", async () => {
    render(await renderPage());

    const prompt = screen.getByText("“Save this job to Interndex.”");
    expect(prompt.querySelector("svg")).toBeNull();

    // No sparkle anywhere in the section, and nothing put in its place: the
    // only icons Settings draws are the checks inside the accent picker.
    const section = screen
      .getByRole("heading", { level: 3, name: "Try saying" })
      .closest("div");
    expect(section?.querySelectorAll("svg")).toHaveLength(0);
  });
});

describe("the connected assistants", () => {
  it("lists a connected client with its disconnect control", async () => {
    render(
      await renderPage({
        grants: [
          {
            client: { id: "11111111-1111-4111-8111-111111111111", name: "Claude" },
            granted_at: "2026-08-22T14:30:00.000Z",
          },
        ],
      }),
    );

    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Disconnect Claude" }),
    ).toHaveAttribute("type", "submit");
  });

  it("explains an empty list instead of showing nothing", async () => {
    render(await renderPage());

    expect(screen.getByText("No authorized connections yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Disconnect/ }),
    ).not.toBeInTheDocument();
  });

  it("reports a failed read as an error rather than an empty list", async () => {
    render(await renderPage({ fails: true }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Your authorized connections could not be loaded.",
    );
    expect(
      screen.queryByText("No authorized connections yet"),
    ).not.toBeInTheDocument();
  });

  it("confirms a disconnect in the shared notice language", async () => {
    render(await renderPage({ disconnect: "done" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "That connection has been disconnected.",
    );
  });

  it("describes Interndex Capture without calling it an AI assistant", async () => {
    render(await renderPage());

    const extension = screen
      .getByRole("heading", { level: 3, name: "Browser extension" })
      .closest("div");
    expect(extension).toHaveTextContent("Interndex Capture is a manual browser tool");
    expect(extension).toHaveTextContent("does not include AI");
  });
});
