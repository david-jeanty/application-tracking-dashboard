import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApplicationStatusLabel } from "@/components/applications/application-status";
import { LifecycleRail } from "@/components/applications/lifecycle-rail";
import { buildLifecycle } from "@/lib/applications/lifecycle";

// This suite does not run with Vitest globals, so Testing Library's automatic
// cleanup is never registered and renders would otherwise accumulate.
afterEach(cleanup);

describe("the rail as a whole", () => {
  it("is announced as one description rather than five stray dots", () => {
    render(
      <LifecycleRail lifecycle={buildLifecycle("Applied", ["Applied"])} />,
    );

    expect(
      screen.getByRole("list", { name: /lifecycle progress/i }),
    ).toBeInTheDocument();
  });

  it("says which stages were reached and which is current", () => {
    render(
      <LifecycleRail
        lifecycle={buildLifecycle("Rejected", ["Applied", "Interview", "Rejected"])}
      />,
    );

    const rail = screen.getByRole("list");
    const description = rail.getAttribute("aria-label") ?? "";

    expect(description).toContain("Applied reached");
    expect(description).toContain("In process not reached");
    expect(description).toContain("Outcome current stage");
  });

  it("adds no tab stops, because the dots are information and not controls", () => {
    const { container } = render(
      <LifecycleRail lifecycle={buildLifecycle("Applied")} />,
    );

    expect(container.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  });
});

describe("the stage labels", () => {
  it("names every stage in order", () => {
    render(<LifecycleRail lifecycle={buildLifecycle("Applied")} />);

    const stages = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(stages).toHaveLength(5);
    expect(stages.map((stage) => stage.textContent)).toEqual([
      expect.stringContaining("Saved"),
      expect.stringContaining("Applied"),
      // Both the full and the short label are rendered; CSS chooses.
      expect.stringContaining("process"),
      expect.stringContaining("Interview"),
      expect.stringContaining("Outcome"),
    ]);
  });

  it("states each stage's state in words, not only in colour", () => {
    render(
      <LifecycleRail
        lifecycle={buildLifecycle("Interview", ["Applied", "Interview"])}
      />,
    );

    const stages = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(stages[1].textContent).toContain("reached");
    expect(stages[2].textContent).toContain("not reached");
    expect(stages[3].textContent).toContain("current stage");
  });

  it("uses an ordered list, because the stages are a sequence", () => {
    const { container } = render(
      <LifecycleRail lifecycle={buildLifecycle("Applied")} />,
    );

    expect(container.querySelector("ol")).toBeInTheDocument();
  });

  it("adds no tab stops either", () => {
    const { container } = render(
      <LifecycleRail lifecycle={buildLifecycle("Offer")} />,
    );

    expect(container.querySelectorAll("button, a, [tabindex]")).toHaveLength(0);
  });
});

describe("the exact status beside the rail", () => {
  it("stays neutral for the stages an application passes through", () => {
    // The rail already shows progress; colouring every step as well would
    // leave nothing for an outcome to stand out against.
    for (const status of ["Interested", "Applied", "Screening", "Interview"] as const) {
      cleanup();
      render(<ApplicationStatusLabel status={status} variant="text" />);
      expect(screen.getByText(status).className).toContain(
        "text-foreground-secondary",
      );
    }
  });

  it("keeps a verdict semantic, and never accent-coloured", () => {
    cleanup();
    render(<ApplicationStatusLabel status="Rejected" variant="text" />);
    expect(screen.getByText("Rejected").className).toContain("text-danger");

    cleanup();
    render(<ApplicationStatusLabel status="Offer" variant="text" />);
    expect(screen.getByText("Offer").className).toContain("text-success");

    cleanup();
    render(<ApplicationStatusLabel status="Preparing" variant="text" />);
    expect(screen.getByText("Preparing").className).toContain("text-warning");
  });

  it("announces what the label is", () => {
    cleanup();
    render(<ApplicationStatusLabel status="Applied" variant="text" />);
    expect(screen.getByText("Status:")).toBeInTheDocument();
  });
});
