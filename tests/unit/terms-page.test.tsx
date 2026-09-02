import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TermsPage from "@/app/terms/page";
import { HomePage } from "@/components/public/home-page";

afterEach(cleanup);

describe("the public terms route", () => {
  it("states what Interndex is and is not", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "The agreement for using Interndex." }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not find jobs, apply on/i),
    ).toBeInTheDocument();
  });

  it("covers the connected AI assistant as acting on the user's own data", () => {
    render(<TermsPage />);

    expect(
      screen.getByRole("heading", { name: "Connecting an AI assistant" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/only reach data your own account already has access to/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/review and revoke a connected assistant/i)).toBeInTheDocument();
  });

  it("links a support contact", () => {
    render(<TermsPage />);

    const supportLinks = screen.getAllByRole("link", {
      name: "support@interndex.dev",
    });
    expect(supportLinks.length).toBeGreaterThan(0);
    for (const link of supportLinks) {
      expect(link).toHaveAttribute("href", "mailto:support@interndex.dev");
    }
  });

  it("keeps the public page accessible and linked home", () => {
    render(<TermsPage />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "Interndex" })).toHaveAttribute("href", "/");
  });
});

describe("the public footer", () => {
  it("links the homepage to the terms route", () => {
    render(<HomePage />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });
});
