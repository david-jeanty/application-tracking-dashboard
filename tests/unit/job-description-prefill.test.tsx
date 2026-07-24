import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This project does not enable vitest globals, so Testing Library's automatic
// cleanup never registers and rendered trees would otherwise leak across tests.
afterEach(cleanup);

// The panel imports a server action, which cannot execute under jsdom. Only the
// prefill wiring is under test here, so the action is stubbed.
vi.mock("@/lib/applications/actions", () => ({
  createApplicationAction: vi.fn(),
}));

import { ApplicationCreatePanel } from "@/components/applications/application-form";

const fixture = readFileSync(
  join(process.cwd(), "tests/fixtures/job-descriptions/labelled-marketing-student.txt"),
  "utf8",
);

function openFormAndExtract(text: string) {
  render(<ApplicationCreatePanel />);
  fireEvent.click(screen.getByRole("button", { name: /add application/i }));
  fireEvent.click(screen.getByRole("button", { name: /paste posting/i }));
  fireEvent.change(screen.getByLabelText(/paste the job description/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: /extract details/i }));
}

describe("job description prefill", () => {
  it("fills the form fields from a pasted posting", () => {
    openFormAndExtract(fixture);

    expect(screen.getByLabelText(/company name/i)).toHaveValue(
      "Northline Technologies",
    );
    expect(screen.getByLabelText(/original job title/i)).toHaveValue(
      "Digital Campaign Marketing Student",
    );
    expect(screen.getByLabelText(/^location/i)).toHaveValue("Ottawa, ON");
    expect(screen.getByLabelText(/work arrangement/i)).toHaveValue("Hybrid");
    expect(screen.getByLabelText(/application deadline/i)).toHaveValue(
      "2026-07-17",
    );
    expect(screen.getByLabelText(/work-term season/i)).toHaveValue("Fall 2026");
  });

  it("carries the pasted text into the job description field", () => {
    openFormAndExtract(fixture);
    // Anchored so it does not also match the import textarea's label.
    expect(screen.getByLabelText(/^job description$/i)).toHaveValue(fixture);
  });

  it("summarizes what was filled and what needs review", () => {
    openFormAndExtract(fixture);
    expect(screen.getByText(/filled \d+ of 9 fields/i)).toBeInTheDocument();
  });

  it("does not prefill fields it could not read confidently", () => {
    const sparse = readFileSync(
      join(process.cwd(), "tests/fixtures/job-descriptions/ambiguous-title.txt"),
      "utf8",
    );
    openFormAndExtract(sparse);

    // The category could not be determined, so the select stays unchosen
    // rather than defaulting to a plausible-looking guess.
    expect(screen.getByLabelText(/normalized category/i)).toHaveValue("");
    expect(screen.getByLabelText(/original job title/i)).toHaveValue("");
  });

  it("leaves the form untouched until an extraction is requested", () => {
    render(<ApplicationCreatePanel />);
    fireEvent.click(screen.getByRole("button", { name: /add application/i }));

    expect(screen.getByLabelText(/company name/i)).toHaveValue("");
    expect(screen.queryByText(/filled \d+ of 9 fields/i)).not.toBeInTheDocument();
  });
});
