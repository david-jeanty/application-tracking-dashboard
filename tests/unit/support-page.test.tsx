import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SupportPage from "@/app/support/page";
import { HomePage } from "@/components/public/home-page";

afterEach(cleanup);

describe("the public support route", () => {
  it("gives a real contact address", () => {
    render(<SupportPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Reach a person, not a form." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "support@interndex.dev" })).toHaveAttribute(
      "href",
      "mailto:support@interndex.dev",
    );
  });

  it("points connected-assistant management at Settings, not email", () => {
    render(<SupportPage />);

    expect(
      screen.getByText(/done from Settings inside Interndex — no email needed/i),
    ).toBeInTheDocument();
  });

  it("links Privacy and Terms", () => {
    render(<SupportPage />);

    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(within(main).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });

  it("keeps the public page accessible and linked home", () => {
    render(<SupportPage />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "Interndex" })).toHaveAttribute("href", "/");
  });
});

describe("the public footer", () => {
  it("links the homepage to the support route", () => {
    render(<HomePage />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Support" })).toHaveAttribute(
      "href",
      "/support",
    );
  });
});
