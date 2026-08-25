import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Notice } from "@/components/ui/notice";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

describe("what a notice announces", () => {
  it("reports an outcome as a status", () => {
    render(<Notice tone="success">Application permanently deleted.</Notice>);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Application permanently deleted.",
    );
  });

  it("reports a problem as an alert", () => {
    render(<Notice tone="error">That application could not be deleted.</Notice>);

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("lets the caller decide when the default is wrong", () => {
    render(
      <Notice role="status" tone="error">
        Something a page was rendered with.
      </Notice>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("how a notice reads", () => {
  it("never leaves the meaning to colour alone", () => {
    const { container } = render(
      <Notice tone="error">Nothing has been lost.</Notice>,
    );

    // The words carry it, and the icon differs by tone. Both are readable
    // without seeing the ground colour at all.
    expect(container).toHaveTextContent("Nothing has been lost.");
    expect(container.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("puts a failed read under a heading at the level the caller asks for", () => {
    render(
      <Notice heading="Archived applications could not be loaded" tone="error">
        Refresh the page to try again.
      </Notice>,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Archived applications could not be loaded",
      }),
    ).toBeInTheDocument();
  });

  it("drops to a third level inside a section that already has one", () => {
    render(
      <Notice heading="Could not be loaded" headingLevel={3} tone="warning">
        Refresh the page to try again.
      </Notice>,
    );

    expect(
      screen.getByRole("heading", { level: 3, name: "Could not be loaded" }),
    ).toBeInTheDocument();
  });

  it("stays flat: no card, no rounding, no shadow", () => {
    const { container } = render(<Notice tone="success">Saved.</Notice>);

    const notice = container.firstElementChild;
    expect(notice?.className).not.toMatch(/rounded/);
    expect(notice?.className).not.toMatch(/shadow/);
  });
});
