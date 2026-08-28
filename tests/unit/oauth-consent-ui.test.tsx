import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const getAuthorizationDetails = vi.fn().mockResolvedValue({
  data: {
    authorization_id: "authorization-1",
    client: { name: "Interndex Capture" },
    user: { email: "student@example.com" },
    redirect_uri: "https://abcdefghijklmnop.chromiumapp.org/oauth2",
  },
  error: null,
});

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/oauth/actions", () => ({ decideConsentAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
      oauth: { getAuthorizationDetails },
    },
  }),
}));

const { default: ConsentPage } = await import("@/app/oauth/consent/page");

describe("OAuth consent for more than one client kind", () => {
  it("uses client-neutral, ownership-aware wording for JobTrack Capture", async () => {
    render(
      await ConsentPage({
        searchParams: Promise.resolve({ authorization_id: "authorization-1" }),
      }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Allow Interndex Capture to connect to Interndex?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/connection authenticated as you/i)).toBeInTheDocument();
    expect(screen.getByText(/actions available depend on the client/i)).toBeInTheDocument();
    expect(screen.getByText(/never reach another student/i)).toBeInTheDocument();
    expect(screen.queryByText(/connected assistant/i)).not.toBeInTheDocument();
  });
});
