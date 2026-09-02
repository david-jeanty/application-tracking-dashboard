import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

// Every form here posts to a Server Action, which cannot run in a unit
// environment. This suite is about the signed-out journey around them, and it
// asserts each page is still wired to the action it always was.
const loginAction = vi.fn();
const signupAction = vi.fn();
const forgotPasswordAction = vi.fn();
const resetPasswordAction = vi.fn();
vi.mock("@/lib/auth/actions", () => ({
  loginAction: (...a: unknown[]) => loginAction(...a),
  signupAction: (...a: unknown[]) => signupAction(...a),
  forgotPasswordAction: (...a: unknown[]) => forgotPasswordAction(...a),
  resetPasswordAction: (...a: unknown[]) => resetPasswordAction(...a),
}));

const { default: LoginPage } = await import("@/app/(auth)/login/page");
const { default: SignupPage } = await import("@/app/(auth)/signup/page");
const { default: ForgotPasswordPage } = await import(
  "@/app/(auth)/forgot-password/page"
);
const { default: ResetPasswordPage } = await import(
  "@/app/(auth)/reset-password/page"
);

const login = () => LoginPage({ searchParams: Promise.resolve({}) });

describe("finding the demo from a signed-out page", () => {
  it("offers it from the sign-in page", async () => {
    render(await login());

    const demoLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/demo");
    // Somebody who arrived straight at `/login` has not seen the homepage, and
    // should not have to make an account to find out what it is for.
    expect(demoLinks.length).toBeGreaterThan(0);
  });

  it("offers it from the create-account page", () => {
    render(SignupPage());

    const demoLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("href") === "/demo");
    expect(demoLinks.length).toBeGreaterThan(0);
  });

  it("sends the wordmark home on every signed-out page", async () => {
    for (const page of [
      await login(),
      SignupPage(),
      ForgotPasswordPage(),
      ResetPasswordPage(),
    ]) {
      cleanup();
      render(page);
      expect(screen.getByTestId("brand")).toHaveAttribute("href", "/");
    }
  });
});

describe("the forms themselves are untouched", () => {
  it("keeps sign-in on its own action, with both fields", async () => {
    render(await login());

    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Sign in" }),
    ).toHaveAttribute("type", "submit");
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/forgot-password");
  });

  it("keeps the account form's fields", () => {
    render(SignupPage());

    expect(screen.getByLabelText("Full name")).toBeRequired();
    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute("minLength", "8");
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toHaveAttribute("type", "submit");
  });

  it("keeps both recovery forms", () => {
    render(ForgotPasswordPage());
    expect(screen.getByLabelText("Email address")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Send reset link" }),
    ).toBeInTheDocument();

    cleanup();
    render(ResetPasswordPage());
    expect(screen.getByLabelText("New password")).toBeRequired();
    expect(screen.getByLabelText("Confirm new password")).toBeRequired();
    expect(
      screen.getByRole("button", { name: "Update password" }),
    ).toBeInTheDocument();
  });

  it("keeps one h1 and the links between the pages", async () => {
    render(await login());

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Create an account" }),
    ).toHaveAttribute("href", "/signup");

    cleanup();
    render(SignupPage());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });

  it("frames the form with a rule rather than a card", async () => {
    const { container } = render(await login());

    // The old shell put every form inside a `Card` beside an accent-filled
    // marketing panel. Neither belongs on a page the homepage now introduces.
    expect(container.querySelector('[class*="rounded-record"]')).toBeNull();

    // The one accent-grounded thing left is the submit button, where the
    // accent means "this is the action" rather than "this is a poster".
    const accented = [...container.querySelectorAll('[class*="bg-accent"]')];
    expect(accented).toHaveLength(1);
    expect(accented[0]).toBe(screen.getByRole("button", { name: "Sign in" }));
  });
});

describe("clickwrap consent on signup", () => {
  it("starts unchecked and blocks account creation until it is checked", () => {
    render(SignupPage());

    const checkbox = screen.getByRole("checkbox", {
      name: /agree to the terms of service and privacy policy/i,
    });
    const submit = screen.getByRole("button", { name: "Create account" });

    expect(checkbox).not.toBeChecked();
    expect(submit).toBeDisabled();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(submit).toBeEnabled();

    fireEvent.click(checkbox);
    expect(submit).toBeDisabled();
  });

  it("does not gate login, which has no consent checkbox at all", async () => {
    render(await login());

    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("links Terms and Privacy so they open in a new tab, not the signup form", () => {
    render(SignupPage());

    const terms = screen.getByRole("link", { name: "Terms of Service" });
    const privacy = screen.getByRole("link", { name: "Privacy Policy" });

    expect(terms).toHaveAttribute("href", "/terms");
    expect(terms).toHaveAttribute("target", "_blank");
    expect(privacy).toHaveAttribute("href", "/privacy");
    expect(privacy).toHaveAttribute("target", "_blank");
  });

  it("keeps the checkbox properly labelled and keyboard-operable", () => {
    render(SignupPage());

    const checkbox = screen.getByLabelText(
      /agree to the terms of service and privacy policy/i,
    );
    expect(checkbox.tagName).toBe("INPUT");
    expect(checkbox).toHaveAttribute("type", "checkbox");
    expect(checkbox).toHaveAttribute("id", "termsAccepted");
  });
});
