import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { HomePage } from "@/components/public/home-page";

afterEach(cleanup);

describe("the public privacy route", () => {
  it("distinguishes the web app from the locally testable extension", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your application records stay yours." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not currently distributed through the Chrome Web Store/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The web app today" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The browser extension" }),
    ).toBeInTheDocument();
  });

  it("states the extension's narrow privacy boundary", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/only after the user explicitly invokes/i)).toBeInTheDocument();
    expect(screen.getByText(/does not continuously monitor browsing/i)).toBeInTheDocument();
    expect(screen.getByText(/not sold or used for personalized advertising/i)).toBeInTheDocument();
    expect(screen.getByText(/edit, archive, or delete captured records/i)).toBeInTheDocument();
    expect(screen.getByText(/does not use built-in AI/i)).toBeInTheDocument();
  });

  it("keeps the public page accessible and linked home", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "Interndex home" })).toHaveAttribute("href", "/");
  });
});

describe("the public footer", () => {
  it("links the homepage to the privacy route", () => {
    render(<HomePage />);

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });
});
