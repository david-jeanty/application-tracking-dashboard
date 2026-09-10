import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The consent screen, read as an attacker would like it to be read.
 *
 * Dynamic client registration is open, so `client.name` and `redirect_uri`
 * are chosen by whoever registered the client. The cases below are about what
 * this page is willing to say on their behalf, and where it puts the two
 * things a student needs in order to notice a connection they did not start.
 *
 * The legitimate flows are here too, and matter as much: Claude's connector
 * and the Interndex Capture extension both come through this screen, and a
 * hardening change that broke either would be a worse outcome than the one it
 * was guarding against.
 */

afterEach(cleanup);

vi.mock("@/components/oauth/consent-form", () => ({
  ConsentForm: ({ authorizationId }: { authorizationId: string }) => (
    <div data-testid="consent-form">
      <button type="submit" value="approve">
        Allow access
      </button>
      <span data-testid="authorization-id">{authorizationId}</span>
    </div>
  ),
}));

const redirect = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (...args: [string]) => redirect(...args),
}));

const getUser = vi.fn();
const getAuthorizationDetails = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser, oauth: { getAuthorizationDetails } },
  }),
}));

const { default: ConsentPage } = await import("@/app/oauth/consent/page");

const AUTHORIZATION_ID = "22222222-2222-4222-8222-222222222222";

const WARNING =
  "Interndex has not verified this application. Only continue if you started this connection yourself.";

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    authorization_id: AUTHORIZATION_ID,
    client: { id: "11111111-1111-4111-8111-111111111111", name: "Claude" },
    user: { email: "student@example.com" },
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    ...overrides,
  };
}

/** Renders the page for one authorization request. */
async function renderConsent(details: Record<string, unknown> = {}) {
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  getAuthorizationDetails.mockResolvedValue({
    data: authorization(details),
    error: null,
  });

  return render(
    await ConsentPage({
      searchParams: Promise.resolve({ authorization_id: AUTHORIZATION_ID }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ConsentPage: the request's own words", () => {
  it("keeps every value from the request out of the page's heading", async () => {
    await renderConsent({
      client: { id: "c1", name: "Interndex Capture (official, verified)" },
    });

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("Authorize access to your Interndex account");
    expect(heading).not.toHaveTextContent("official");
    expect(heading).not.toHaveTextContent("Interndex Capture");
  });

  it("shows the client's name as something the application claims", async () => {
    await renderConsent({ client: { id: "c1", name: "Claude" } });

    expect(screen.getByText("Application requesting access")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(
      screen.getByText("This name was chosen by the application, not by Interndex."),
    ).toBeInTheDocument();
  });

  it("truncates a name long enough to bury the buttons", async () => {
    await renderConsent({ client: { id: "c1", name: "A".repeat(400) } });

    const shown = screen.getByText(/^A+…$/);
    expect(shown.textContent).toHaveLength(60);
  });

  it("flattens a name that tries to draw itself as extra page copy", async () => {
    await renderConsent({
      client: { id: "c1", name: "Claude\n\nVerified by Interndex" },
    });

    expect(screen.getByText("Claude Verified by Interndex")).toBeInTheDocument();
  });

  it("says so when a client registered without a name", async () => {
    await renderConsent({ client: { id: "c1", name: "   " } });

    expect(
      screen.getByText("This application did not provide a name."),
    ).toBeInTheDocument();
  });
});

describe("ConsentPage: what is read last, before the decision", () => {
  it("states the unverified warning verbatim, on an ordinary request", async () => {
    await renderConsent();

    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });

  it("puts the warning and the destination above the buttons", async () => {
    await renderConsent();

    const warning = screen.getByText(WARNING);
    const destination = screen.getByText("claude.ai");
    const form = screen.getByTestId("consent-form");

    for (const element of [warning, destination]) {
      expect(
        element.compareDocumentPosition(form) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("gives the destination host its own prominent line", async () => {
    await renderConsent({
      redirect_uri: "https://attacker.example/oauth/callback?next=%2F",
    });

    const host = screen.getByText("attacker.example");
    expect(host).toBeInTheDocument();
    expect(host.className).toContain("font-semibold");

    // The whole address is still shown beneath it, so a path that matters is
    // not hidden by the summary.
    expect(
      screen.getByText("https://attacker.example/oauth/callback?next=%2F"),
    ).toBeInTheDocument();
  });

  it("does not offer the destination as a link", async () => {
    await renderConsent({ redirect_uri: "https://attacker.example/cb" });

    expect(screen.queryByRole("link")).toBeNull();
  });

  it("names a redirect it cannot parse rather than skipping the line", async () => {
    await renderConsent({ redirect_uri: "javascript:alert(1)" });

    expect(
      screen.getByText(/an address that is not a valid web URL/),
    ).toBeInTheDocument();
    expect(screen.getByText(WARNING)).toBeInTheDocument();
  });
});

describe("ConsentPage: the flows that must keep working", () => {
  it("hands the authorization id to the form unchanged", async () => {
    await renderConsent();

    expect(screen.getByTestId("authorization-id")).toHaveTextContent(
      AUTHORIZATION_ID,
    );
    expect(screen.getByRole("button", { name: "Allow access" })).toBeInTheDocument();
  });

  it("still shows what a connected client can and cannot do", async () => {
    await renderConsent();

    expect(screen.getByText("It will be able to")).toBeInTheDocument();
    expect(screen.getByText("It will not be able to")).toBeInTheDocument();
    expect(
      screen.getByText("See the job applications in your tracker"),
    ).toBeInTheDocument();
    expect(screen.getByText("Delete an application")).toBeInTheDocument();
  });

  it("names the account that is granting access", async () => {
    await renderConsent();

    expect(screen.getByText("student@example.com")).toBeInTheDocument();
  });

  it("connects the Interndex Capture extension exactly as before", async () => {
    await renderConsent({
      client: { id: "461d1918-6343-447b-80f8-73f22e75b34d", name: "Interndex Capture" },
      redirect_uri: "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/",
    });

    expect(screen.getByText("Interndex Capture")).toBeInTheDocument();
    expect(
      screen.getByText("abcdefghijklmnopabcdefghijklmnop.chromiumapp.org"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("authorization-id")).toHaveTextContent(
      AUTHORIZATION_ID,
    );
  });

  it("follows the finished redirect when consent was already given", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: "https://claude.ai/cb?code=abc" },
      error: null,
    });

    await expect(
      ConsentPage({
        searchParams: Promise.resolve({ authorization_id: AUTHORIZATION_ID }),
      }),
    ).rejects.toThrow("redirect:https://claude.ai/cb?code=abc");
  });

  it("sends a signed-out visitor to sign in", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      ConsentPage({
        searchParams: Promise.resolve({ authorization_id: AUTHORIZATION_ID }),
      }),
    ).rejects.toThrow("redirect:/login");
  });

  it("refuses a request that names no authorization, and shows no buttons", async () => {
    render(await ConsentPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("heading", { name: "This request cannot be completed" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("consent-form")).toBeNull();
  });

  it("refuses an expired authorization, and shows no buttons", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    getAuthorizationDetails.mockResolvedValue({
      data: null,
      error: { message: "expired" },
    });

    render(
      await ConsentPage({
        searchParams: Promise.resolve({ authorization_id: AUTHORIZATION_ID }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "This request cannot be completed" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("consent-form")).toBeNull();
  });
});
