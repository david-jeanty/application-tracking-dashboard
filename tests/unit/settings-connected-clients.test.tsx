import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// The disconnect control posts to a Server Action, which cannot run in a unit
// environment. The identity of the action is not what these tests are about —
// the rendered choices are.
vi.mock("@/lib/oauth/actions", () => ({ revokeGrantAction: vi.fn() }));

const { ConnectedClients } = await import(
  "@/components/settings/connected-clients"
);

const CLAUDE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Claude",
  grantedAt: "2026-08-22T14:30:00.000Z",
};
const OTHER = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Another Assistant",
  grantedAt: "2026-08-20T09:00:00.000Z",
};

describe("with nothing connected", () => {
  it("explains the state instead of showing an empty area", () => {
    render(<ConnectedClients clients={[]} />);

    expect(
      screen.getByText(/no authorized connections yet/i),
    ).toBeInTheDocument();
  });

  it("offers no disconnect control", () => {
    render(<ConnectedClients clients={[]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("with connected assistants", () => {
  it("names each one so the student can recognize it", () => {
    render(<ConnectedClients clients={[CLAUDE, OTHER]} />);

    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Another Assistant")).toBeInTheDocument();
  });

  it("gives every assistant its own disconnect control", () => {
    render(<ConnectedClients clients={[CLAUDE, OTHER]} />);

    expect(
      screen.getByRole("button", { name: /disconnect claude/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disconnect another assistant/i }),
    ).toBeInTheDocument();
  });

  it("submits the client id of the assistant being disconnected", () => {
    const { container } = render(<ConnectedClients clients={[CLAUDE, OTHER]} />);

    const values = [...container.querySelectorAll('input[name="clientId"]')].map(
      (input) => input.getAttribute("value"),
    );

    expect(values).toEqual([CLAUDE.id, OTHER.id]);
  });

  it("says when access was granted", () => {
    render(<ConnectedClients clients={[CLAUDE]} />);

    expect(screen.getByText(/^Connected /)).toBeInTheDocument();
  });

  it("still lists an assistant whose grant date is unusable", () => {
    render(
      <ConnectedClients clients={[{ ...CLAUDE, grantedAt: "not a date" }]} />,
    );

    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /disconnect claude/i }),
    ).toBeInTheDocument();
  });

  it("keeps each assistant's control inside its own row", () => {
    render(<ConnectedClients clients={[CLAUDE, OTHER]} />);

    const rows = screen.getAllByRole("listitem");

    expect(rows).toHaveLength(2);
    expect(
      within(rows[0]).getByRole("button", { name: /disconnect claude/i }),
    ).toBeInTheDocument();
  });
});
