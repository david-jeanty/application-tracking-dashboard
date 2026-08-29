import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InterndexLogo } from "@/components/branding/interndex-logo";

afterEach(cleanup);

describe("InterndexLogo", () => {
  it("keeps the handheld and wordmark as independently scaled elements", () => {
    const { container } = render(<InterndexLogo size="medium" />);
    const logo = screen.getByRole("img", { name: "Interndex" });

    expect(logo).toHaveTextContent("interndex");
    expect(
      container.querySelector('img[src="/brand/icon/interndex-icon.svg"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src="/brand/icon/interndex-icon-dark.svg"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('img[src*="/brand/logo/"]'),
    ).not.toBeInTheDocument();
  });

  it("offers an icon-only treatment without exposing duplicate accessible text", () => {
    const { container } = render(<InterndexLogo iconOnly size="small" />);

    expect(screen.getByRole("img", { name: "Interndex" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("interndex");
    expect(container.querySelectorAll("img")).toHaveLength(2);
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(2);
  });
});
