import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("@/components/settings/delete-account-form", () => ({
  DeleteAccountForm: ({ email, userId }: { email: string; userId: string }) => (
    <div data-testid="delete-account-form">
      {email} / {userId}
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
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const { default: DeleteAccountPage } = await import(
  "@/app/(app)/settings/delete-account/page"
);

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("DeleteAccountPage", () => {
  it("sends a signed-out visitor to login, carrying its own path back", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(DeleteAccountPage()).rejects.toThrow(
      "redirect:/login?next=/settings/delete-account",
    );
  });

  it("passes the session's own id and email to the confirmation form", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });

    render(await DeleteAccountPage());

    expect(screen.getByTestId("delete-account-form")).toHaveTextContent(
      "student@example.com / aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });

  it("names the consequence in the page title, once", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: "student@example.com" } },
    });

    render(await DeleteAccountPage());

    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Permanently delete your account?");
  });
});
