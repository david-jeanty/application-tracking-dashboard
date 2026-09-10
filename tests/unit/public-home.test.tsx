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
const { ASSISTANT_OWNERSHIP_NOTE } = await import("@/lib/mcp/capabilities");

const HERO_HEADING = "Keep your job search in one place.";
const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/interndex-capture/llggmpgoichadgcolincmjcfkljpboad";

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
  it("names who it's for and what a student can save from anywhere", () => {
    render(<HomePage />);

    const hero = screen
      .getByRole("heading", { level: 1 })
      .closest("section") as HTMLElement;

    expect(
      within(hero).getByRole("heading", { level: 1, name: HERO_HEADING }),
    ).toBeInTheDocument();
    expect(
      within(hero).getByText("For students applying to internships and co-ops"),
    ).toBeInTheDocument();
    // The extension and its accuracy claim are named in plain language before
    // MCP is ever mentioned.
    expect(
      within(hero).getByText(/Save opportunities from anywhere/),
    ).toBeInTheDocument();
    expect(
      within(hero).getByText(
        /most accurate on LinkedIn, Indeed, and Workday/,
      ),
    ).toBeInTheDocument();
  });

  it("leads with creating a free tracker and offers the extension and demo beside it", () => {
    render(<HomePage />);

    const hero = screen
      .getByRole("heading", { level: 1 })
      .closest("section") as HTMLElement;

    expect(
      within(hero).getByRole("link", { name: "Create your free tracker" }),
    ).toHaveAttribute("href", "/signup");
    const extensionLink = within(hero).getByRole("link", {
      name: "Add the Chrome extension",
    });
    expect(extensionLink).toHaveAttribute("href", CHROME_WEB_STORE_URL);
    expect(extensionLink).toHaveAttribute("target", "_blank");
    expect(extensionLink.getAttribute("rel")).toContain("noopener");
    expect(
      within(hero).getByRole("link", { name: "Explore the demo" }),
    ).toHaveAttribute("href", "/demo");
  });

  it("keeps the extension button visually distinct and the demo a lower-emphasis link", () => {
    render(<HomePage />);

    const hero = screen
      .getByRole("heading", { level: 1 })
      .closest("section") as HTMLElement;

    const primary = within(hero).getByRole("link", {
      name: "Create your free tracker",
    });
    const extension = within(hero).getByRole("link", {
      name: "Add the Chrome extension",
    });
    const demoLink = within(hero).getByRole("link", { name: "Explore the demo" });

    // The extension is a real secondary action (its own button styling), not
    // a copy of the primary button and not a plain inline link.
    expect(extension.className).not.toBe(primary.className);
    // The demo stays a plain link rather than a third button competing with
    // the two calls to action above it.
    expect(demoLink.className).not.toMatch(/bg-accent|border-border-strong/);
  });

  it("keeps the hero to the product and one line of trust copy", () => {
    render(<HomePage />);

    const hero = screen
      .getByRole("heading", { level: 1 })
      .closest("section") as HTMLElement;
    const visual = within(hero).getByRole("heading", {
      name: "Your applications, as Interndex keeps them",
    }).parentElement as HTMLElement;

    // The preview column is the record list and its provenance note, and
    // nothing else: no prompt panel, no tool-by-tool explanation.
    expect(visual.querySelector('ul[aria-label="Applications"]')).not.toBeNull();
    expect(
      within(hero).queryByText(/Asked in ChatGPT or Claude/),
    ).not.toBeInTheDocument();
    for (const ask of [
      /Save this posting to Interndex/,
      /Show jobs I have applied to/,
      /Update this application to Interview/,
    ]) {
      expect(within(hero).queryByText(ask)).not.toBeInTheDocument();
    }
  });

  it("keeps the header's demo route and account links", () => {
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

    // Header, hero, the connect section, and the call to action at the foot: a
    // visitor should not have to scroll back up to find it.
    expect(demoLinks.length).toBeGreaterThanOrEqual(3);
  });

  it("still says somewhere that the demo needs no account", () => {
    render(<HomePage />);

    // Out of the hero, but not off the page: the closing call to action is
    // where a visitor who read that far decides whether to look.
    expect(screen.getByText(/No account, nothing to sign up/)).toBeInTheDocument();
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
      within(closing).getByRole("link", { name: "Explore the demo" }),
    ).toHaveAttribute("href", "/demo");
  });
});

describe("what the homepage claims", () => {
  it("keeps the Save the posting, Track the process promise below the hero", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { name: "Save the posting. Track the process." }),
    ).toBeInTheDocument();
  });

  it("shows the save, track, and AI-context steps across the connected workspace", () => {
    render(<HomePage />);

    const workflow = screen
      .getByRole("heading", { name: "Save the posting. Track the process." })
      .closest("section") as HTMLElement;
    const steps = within(workflow).getAllByRole("listitem");

    expect(steps).toHaveLength(3);
    for (const [index, title] of [
      "Save opportunities your way",
      "Stay on top of every application",
      "Give your AI the right context",
    ].entries()) {
      expect(
        within(steps[index] as HTMLElement).getByRole("heading", { name: title }),
      ).toBeInTheDocument();
    }
  });

  it("grounds each workflow step in a concrete fact, including where capture is most accurate", () => {
    render(<HomePage />);

    const workflow = screen
      .getByRole("heading", { name: "Save the posting. Track the process." })
      .closest("section") as HTMLElement;

    expect(within(workflow).getByText("LinkedIn · Indeed · Workday")).toBeInTheDocument();
    expect(
      within(workflow).getByText("Saved → Applied → Interview → Outcome"),
    ).toBeInTheDocument();
    expect(
      within(workflow).getByText("Status history · Next action"),
    ).toBeInTheDocument();
  });

  it("names the Chrome extension in the first step, without overclaiming site coverage", () => {
    render(<HomePage />);

    const workflow = screen
      .getByRole("heading", { name: "Save the posting. Track the process." })
      .closest("section") as HTMLElement;
    const text = workflow.textContent ?? "";

    expect(text).toMatch(/Chrome extension can capture jobs across most career sites/);
    expect(text).toMatch(/most accurate on LinkedIn, Indeed, and Workday/);
    expect(text).not.toMatch(/every (career )?site|all (career )?sites/i);
  });

  it("draws the line between the AI and the record", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", {
        name: "Your AI gets the context. You stay in control.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Interndex does not include an assistant/),
    ).toBeInTheDocument();
  });

  it("shows what a connected AI is asked, beside the promise it keeps", () => {
    render(<HomePage />);

    const connect = screen
      .getByRole("heading", {
        name: "Your AI gets the context. You stay in control.",
      })
      .closest("section") as HTMLElement;

    // Three ordinary sentences, each one a registered tool, below the fold
    // rather than stacked under the hero preview.
    for (const ask of [
      "“Show jobs I have applied to.”",
      "“Which applications need a follow-up this week?”",
      "“Update this application to Interview.”",
    ]) {
      expect(within(connect).getByText(ask)).toBeInTheDocument();
    }
    expect(
      within(connect).getByText(ASSISTANT_OWNERSHIP_NOTE),
    ).toBeInTheDocument();
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

  it("never claims ChatGPT publicly, and refers only to MCP-compatible AI", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    // The ChatGPT app is not publicly launched, so the page never names it;
    // MCP-compatible AI is the only public framing for the connection.
    expect(text).not.toMatch(/ChatGPT/);
    expect(text).toMatch(/MCP-compatible AI/);
    expect(text).toMatch(/The connection uses MCP, the open standard/);
  });

  it("promises no AI client it has not verified, and says which one it tested", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).toContain("tested with Claude");
    // Nothing on the page claims a listing in an app directory.
    expect(text).not.toMatch(/app store|app directory|available in ChatGPT/i);
    expect(text).not.toMatch(/Gemini|Copilot/i);
  });

  it("promotes the Chrome extension and links it to the live Chrome Web Store listing", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    expect(text).toMatch(/Chrome extension/);
    const storeLink = screen.getByRole("link", { name: "Add the Chrome extension" });
    expect(storeLink).toHaveAttribute("href", CHROME_WEB_STORE_URL);
  });

  it("never uses an em dash anywhere in the homepage's own copy", () => {
    const { container } = render(<HomePage />);

    // Scoped to the copy this page authors. The embedded `ApplicationRecords`
    // preview is the real product component rendering real record labels
    // ("Saved — reached") that belong to that component, not homepage copy.
    const preview = container.querySelector('ul[aria-label="Applications"]');
    preview?.remove();

    expect(container.textContent ?? "").not.toMatch(/—/);
  });

  it("promises no action the connection cannot perform", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";

    for (const absent of [
      /applies for you|auto-?appl/i,
      /resume builder|build your resume/i,
      /career coach/i,
      /ATS/,
      /scans? your resume/i,
    ]) {
      expect(text).not.toMatch(absent);
    }
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
