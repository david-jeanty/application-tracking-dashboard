import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const signOut = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

const { DeleteAccountForm } = await import(
  "@/components/settings/delete-account-form"
);

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMAIL = "student@example.com";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  signOut.mockClear();
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: "" },
    writable: true,
  });
});

describe("DeleteAccountForm", () => {
  it("keeps the destructive control disabled until a password is entered", () => {
    render(<DeleteAccountForm email={EMAIL} userId={USER_ID} />);

    const submit = screen.getByRole("button", {
      name: "Delete my account permanently",
    });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Confirm your password"), {
      target: { value: "hunter2" },
    });
    expect(submit).toBeEnabled();
  });

  it("posts the session's own userId and the entered password as JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { status: "deleted" }));

    render(<DeleteAccountForm email={EMAIL} userId={USER_ID} />);
    fireEvent.change(screen.getByLabelText("Confirm your password"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete my account permanently" }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("/api/account/delete");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      userId: USER_ID,
      password: "hunter2",
    });
  });

  it("clears the local session and leaves for login on success", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { status: "deleted" }));

    render(<DeleteAccountForm email={EMAIL} userId={USER_ID} />);
    fireEvent.change(screen.getByLabelText("Confirm your password"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete my account permanently" }),
    );

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: "local" }));
    expect(window.location.href).toBe("/login?deleted=true");
  });

  it("shows the incorrect-password message and never navigates away on rejection", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(401, { status: "invalid_password" }),
    );

    render(<DeleteAccountForm email={EMAIL} userId={USER_ID} />);
    fireEvent.change(screen.getByLabelText("Confirm your password"), {
      target: { value: "wrong" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete my account permanently" }),
    );

    expect(
      await screen.findByText("That password is incorrect. Check it and try again."),
    ).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();
    expect(window.location.href).toBe("");
  });

  it("shows a message when a different account is rejected by the server", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(403, { status: "forbidden" }));

    render(<DeleteAccountForm email={EMAIL} userId={USER_ID} />);
    fireEvent.change(screen.getByLabelText("Confirm your password"), {
      target: { value: "hunter2" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Delete my account permanently" }),
    );

    expect(
      await screen.findByText(
        "This confirmation does not match your signed-in account.",
      ),
    ).toBeInTheDocument();
  });
});
