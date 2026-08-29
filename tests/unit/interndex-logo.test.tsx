import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InterndexLogo } from "@/components/branding/interndex-logo";

afterEach(cleanup);

describe("InterndexLogo", () => {
  it("uses the supplied light and dark PNG lockups without rebuilding them", () => {
    const { container } = render(<InterndexLogo size="medium" />);
    const logo = screen.getByRole("img", { name: "Interndex" });

    expect(logo).not.toHaveTextContent("interndex");
    expect(
      container.querySelector(
        'img[src="/brand/logo/interndex-logo-light.png"]',
      ),
    ).toBeInTheDocument();
    expect(
      container.querySelector(
        'img[src="/brand/logo/interndex-logo-dark.png"]',
      ),
    ).toBeInTheDocument();
  });

  it("uses the supplied standalone PNG for icon-only contexts", () => {
    const { container } = render(<InterndexLogo iconOnly size="small" />);

    expect(screen.getByRole("img", { name: "Interndex" })).toBeInTheDocument();
    expect(container).not.toHaveTextContent("interndex");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(
      container.querySelector('img[src="/brand/icon/interndex-icon.png"]'),
    ).toBeInTheDocument();
  });
});
