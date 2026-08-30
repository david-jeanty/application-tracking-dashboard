import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import { HomePage } from "@/components/public/home-page";

afterEach(cleanup);

describe("the public privacy route", () => {
  it("distinguishes the web app from the browser extension", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Your application records stay yours." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The web app today" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "The Interndex Capture browser extension" }),
    ).toBeInTheDocument();
  });

  it("covers the extension across both its Chrome Web Store and unpacked forms", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/chrome web store or loaded locally as/i),
    ).toBeInTheDocument();
    // The page must not imply a review or approval it has not had.
    expect(screen.queryByText(/approved by the chrome web store/i)).toBeNull();
  });

  it("states the extension's narrow privacy boundary as implemented", () => {
    render(<PrivacyPage />);

    expect(
      screen.getByText(/read only after you open the extension on a page/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/full contents are never transmitted/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not continuously monitor browsing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/never given to the job page/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not sold or used for personalized advertising/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/edit or delete captured records/i)).toBeInTheDocument();
    expect(screen.getByText(/provides no AI of its own/i)).toBeInTheDocument();
  });

  it("keeps the public page accessible and linked home", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("link", { name: "Interndex" })).toHaveAttribute("href", "/");
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
