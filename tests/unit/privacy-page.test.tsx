import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { HomePage } from "@/components/public/home-page";

afterEach(cleanup);

describe("the public privacy route", () => {
  it("distinguishes the current web app from the unreleased extension", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your application records stay yours." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/extension is not publicly released/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The web app today" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The planned browser extension" }),
    ).toBeInTheDocument();
  });

  it("states the planned extension's narrow privacy boundary", () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/only after explicit user invocation/i)).toBeInTheDocument();
    expect(screen.getByText(/will not continuously monitor browsing/i)).toBeInTheDocument();
    expect(screen.getByText(/not sold or used for personalized advertising/i)).toBeInTheDocument();
    expect(screen.getByText(/edit or delete captured records/i)).toBeInTheDocument();
  });

  it("keeps the public page accessible and linked home", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "JobTrack" })).toHaveAttribute("href", "/");
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
