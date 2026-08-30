import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
vi.mock("next/navigation", () => ({ redirect: (p: string) => redirect(p) }));

const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const { default: RootPage } = await import("@/app/page");
const { HomePage } = await import("@/components/public/home-page");

const HERO_HEADING = "Find the role. Give it one place. Always know what’s next.";

function signedOut() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
  getUser.mockResolvedValue({ data: { user: null } });
}
function signedIn() {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
}

/** Runs `body` with the Supabase environment removed, then restores it. */
async function withoutSupabaseEnvironment(body: () => Promise<void>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    await body();
  } finally {
    if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    if (key) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;
  }
}

describe("the root route", () => {
  it("shows the public homepage to a signed-out visitor", async () => {
    signedOut();
    render(await RootPage());

    expect(
      screen.getByRole("heading", { level: 1, name: HERO_HEADING }),
    ).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a signed-in student straight to their workspace", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
    signedIn();

    await expect(RootPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the homepage with no Supabase configuration at all", async () => {
    await withoutSupabaseEnvironment(async () => {
      getUser.mockClear();
      getUser.mockRejectedValue(new Error("should not be called"));
      render(await RootPage());

      // Nothing on this page needs a database, so a missing one is not a
      // reason to show a visitor a login screen or an error.
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        HERO_HEADING,
      );
      expect(getUser).not.toHaveBeenCalled();
    });
  });
});

describe("the homepage's front door", () => {
  it("leads with the demo, in the header and the hero", () => {
    render(<HomePage />);

    const header = screen.getByRole("navigation", { name: "Public navigation" });
    // The visible label shortens to "Demo" at a phone width, but the
    // accessible name stays the full sentence at every width.
    expect(
      within(header).getByRole("link", { name: "Try the demo" }),
    ).toHaveAttribute("href", "/demo");
    expect(
      within(header).getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");
    expect(within(header).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("offers a way into the demo more than once", () => {
    render(<HomePage />);

    const demoLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/demo");

    // Header, hero, and the call to action at the foot: a visitor should not
    // have to scroll back up to find it.
    expect(demoLinks.length).toBeGreaterThanOrEqual(3);
  });

  it("says out loud that no account is required", () => {
    render(<HomePage />);

    expect(screen.getByText(/No account required/)).toBeInTheDocument();
  });

  it("keeps 'No account required' right beside the primary CTA", () => {
    render(<HomePage />);

    const hero = screen
      .getByRole("heading", { level: 1 })
      .closest("section") as HTMLElement;
    const heroCta = within(hero).getByRole("link", { name: "Try the demo" });
    const ctaRow = heroCta.closest("div") as HTMLElement;

    // The next thing after the CTA row, not a caption buried somewhere else
    // on the page, so a visitor sees both without scrolling.
    expect(ctaRow.nextElementSibling?.textContent).toMatch(
      /No account required/,
    );
  });

  it("puts what to do beside why to do it, and keeps sign-up and sign-in secondary", () => {
    render(<HomePage />);

    const hero = screen
      .getByRole("heading", { level: 1 })
      .closest("section") as HTMLElement;

    expect(
      within(hero).getByText("Internship and co-op applications"),
    ).toBeInTheDocument();
    expect(
      within(hero).getByRole("link", { name: "Try the demo" }),
    ).toHaveAttribute("href", "/demo");
    expect(
      within(hero).getByRole("link", { name: "Create account" }),
    ).toHaveAttribute("href", "/signup");
    expect(
      within(hero).getByRole("link", { name: "Already have an account? Sign in" }),
    ).toHaveAttribute("href", "/login");
  });

  it("offers both ways into an account", () => {
    render(<HomePage />);

    expect(
      screen.getAllByRole("link", { name: /Create account/ }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: /Sign in/ }).length,
    ).toBeGreaterThan(0);
  });

  it("closes with the demo rather than with a sign-up wall", () => {
    render(<HomePage />);

    const closing = screen
      .getByRole("heading", { name: "See what a real search looks like." })
      .closest("section") as HTMLElement;

    expect(closing).not.toBeNull();
    expect(
      within(closing).getByRole("link", { name: "Try the demo" }),
    ).toHaveAttribute("href", "/demo");
  });
});

describe("what the homepage claims", () => {
  it("shows the Save, Track, Act sequence across the connected workspace", () => {
    render(<HomePage />);

    const workflow = screen
      .getByRole("heading", { name: "One workspace, from first application to offer." })
      .closest("section") as HTMLElement;
    const steps = within(workflow).getAllByRole("listitem");

    expect(steps).toHaveLength(3);
    for (const [index, title] of ["Save", "Track", "Act"].entries()) {
      expect(
        within(steps[index] as HTMLElement).getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }
  });

  it("grounds each workflow step in real record fields and stages", () => {
    render(<HomePage />);

    const workflow = screen
      .getByRole("heading", { name: "One workspace, from first application to offer." })
      .closest("section") as HTMLElement;

    expect(within(workflow).getByText("Title · Employer · Deadline")).toBeInTheDocument();
    expect(
      within(workflow).getByText("Saved → Applied → Interview → Outcome"),
    ).toBeInTheDocument();
    expect(
      within(workflow).getByText("Status history · Next action"),
    ).toBeInTheDocument();
  });

  it("shows Applications, Pipeline, Dashboard and Analytics as one workspace", () => {
    render(<HomePage />);

    const workflow = screen
      .getByRole("heading", { name: "One workspace, from first application to offer." })
      .closest("section") as HTMLElement;

    expect(
      within(workflow).getByRole("link", { name: "Applications" }),
    ).toHaveAttribute("href", "/demo/applications");
    expect(
      within(workflow).getByRole("link", { name: "Pipeline" }),
    ).toHaveAttribute("href", "/demo/pipeline");
    expect(
      within(workflow).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/demo");
    expect(
      within(workflow).getByRole("link", { name: "Analytics" }),
    ).toHaveAttribute("href", "/demo/analytics");
  });

  it("draws the line between the assistant and the record", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "Interndex keeps the record. Your assistant is optional.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Interndex does not include an assistant/),
    ).toBeInTheDocument();
  });

  it("shows the assistant section's record as real fields, not an AI diagram", () => {
    render(<HomePage />);

    const assistant = screen
      .getByRole("heading", {
        name: "Interndex keeps the record. Your assistant is optional.",
      })
      .closest("section") as HTMLElement;

    for (const label of ["Role", "Employer", "Status", "Work term"]) {
      expect(within(assistant).getByText(label)).toBeInTheDocument();
    }
  });

  it("never claims an AI of its own", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(
      /Interndex'?s? own AI|\bbuilt-in AI\b|\bAI-powered\b|\bAI assistant built in\b/i,
    );
    // And it says the opposite, in as many words.
    expect(text).toMatch(/Interndex does not include an assistant/);
  });

  it("does not lead the assistant section with AI or use MCP jargon", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(/\bMCP\b/);

    const assistantHeading = screen.getByRole("heading", {
      name: "Interndex keeps the record. Your assistant is optional.",
    });
    // "Interndex" leads the section, not "AI".
    expect(assistantHeading.textContent?.trim().startsWith("Interndex")).toBe(
      true,
    );
  });

  it("names the one assistant it has verified, and nothing else", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).toContain("supported AI assistant");
    expect(text).toContain("tested with Claude");
    expect(text).not.toMatch(/ChatGPT|Gemini|Copilot/i);
  });

  it("never promotes the browser extension", () => {
    const { container } = render(<HomePage />);

    expect(container.textContent ?? "").not.toMatch(/extension/i);
  });

  it("sells nothing it does not have", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    for (const absent of [
      /pricing/i,
      /testimonial/i,
      /trusted by/i,
      /free trial/i,
      /waitlist/i,
    ]) {
      expect(text).not.toMatch(absent);
    }
  });
});

describe("the product preview", () => {
  it("shows real records from the demo workspace", () => {
    const { container } = render(<HomePage />);
    const preview = container.querySelector(
      'ul[aria-label="Applications"]',
    ) as HTMLElement;

    expect(preview).not.toBeNull();
    expect(preview.children.length).toBeGreaterThan(1);
  });

  it("picks records at different stages, so the rail shows something", () => {
    const { container } = render(<HomePage />);
    const preview = container.querySelector(
      'ul[aria-label="Applications"]',
    ) as HTMLElement;

    const statuses = [...preview.children].map(
      (row) => row.querySelector("[class*=text-]")?.textContent ?? "",
    );
    // Four rows, and four different rails: an excerpt of one stage would draw
    // the same picture four times.
    expect(preview.children.length).toBe(4);
    expect(new Set(statuses).size).toBeGreaterThan(1);
  });

  it("links its records into the demo rather than the private workspace", () => {
    const { container } = render(<HomePage />);
    const preview = container.querySelector(
      'ul[aria-label="Applications"]',
    ) as HTMLElement;

    for (const link of preview.querySelectorAll("a[href]")) {
      expect(link.getAttribute("href")).toMatch(/^\/demo\/applications\//);
    }
  });

  it("counts nothing, because an excerpt is not a total", () => {
    const { container } = render(<HomePage />);

    expect(container.textContent).not.toMatch(/\d+ applications/);
  });

  it("keeps the excerpt as closed rows without disclosure controls or edit links", () => {
    const { container } = render(<HomePage />);
    const preview = container.querySelector(
      'ul[aria-label="Applications"]',
    ) as HTMLElement;

    expect(within(preview).queryByRole("button", { name: /details for/i })).not.toBeInTheDocument();
    expect(within(preview).queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("says the sample applications are fictional", () => {
    render(<HomePage />);

    expect(
      screen.getByText(/fictional and\s+shown for demonstration only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no\s+connection to Interndex/i),
    ).toBeInTheDocument();
  });
});

describe("the shape of the page", () => {
  it("has one h1", () => {
    render(<HomePage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("never skips a heading level on the way down", () => {
    render(<HomePage />);
    const levels = screen
      .getAllByRole("heading")
      .map((heading) => Number(heading.tagName.slice(1)));

    expect(levels[0]).toBe(1);
    for (const [index, level] of levels.entries()) {
      if (index === 0) continue;
      expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
    }
  });

  it("names its navigation and keeps a skip link", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("navigation", { name: "Public navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /skip to main content/i }),
    ).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
