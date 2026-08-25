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
      screen.getByRole("heading", {
        level: 1,
        name: "A job tracker your AI assistant can actually use.",
      }),
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
      expect(
        screen.getByRole("heading", { level: 1 }),
      ).toHaveTextContent("A job tracker your AI assistant can actually use.");
      expect(getUser).not.toHaveBeenCalled();
    });
  });
});

describe("the homepage's front door", () => {
  it("leads with the demo, in the header and the hero", () => {
    render(<HomePage />);

    const header = screen.getByRole("navigation", { name: "Public navigation" });
    expect(within(header).getByRole("link", { name: "Try demo" })).toHaveAttribute(
      "href",
      "/demo",
    );
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

  it("says out loud that the demo needs no account", () => {
    render(<HomePage />);

    expect(screen.getByText(/The demo needs no account/)).toBeInTheDocument();
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

    expect(
      screen.getByRole("heading", { name: "See what a real search looks like." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Try the demo" }),
    ).toHaveAttribute("href", "/demo");
  });
});

describe("what the homepage claims", () => {
  it("explains the three things JobTrack is for", () => {
    render(<HomePage />);

    for (const title of [
      "Track the search",
      "Use the same records with AI",
      "Bring your old tracker",
    ]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("draws the line between the assistant and the record", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "AI does the reasoning. JobTrack stores the truth.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/JobTrack does not provide an AI/),
    ).toBeInTheDocument();
  });

  it("never claims an AI of its own", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).not.toMatch(
      /JobTrack'?s? own AI|\bbuilt-in AI\b|\bAI-powered\b|\bAI assistant built in\b/i,
    );
    // And it says the opposite, in as many words.
    expect(text).toMatch(/JobTrack does not provide an AI/);
  });

  it("promises only the compatibility that has been tested", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).toContain("MCP-compatible AI assistant");
    // Claude is named as the one it was tested with, and nothing else is
    // claimed to work until it has been.
    expect(text).toContain("Claude is the assistant this has been tested with");
    expect(text).not.toMatch(/ChatGPT|Gemini|Copilot/i);
  });

  it("sends the old spreadsheet to the assistant, never to JobTrack", () => {
    render(<HomePage />);

    expect(
      screen.getByText(/give the file to your connected assistant/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the spreadsheet itself never comes\s+here/i),
    ).toBeInTheDocument();
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

  it("says the sample applications are fictional", () => {
    render(<HomePage />);

    expect(
      screen.getByText(/fictional and\s+shown for demonstration only/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no\s+connection to JobTrack/i),
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
