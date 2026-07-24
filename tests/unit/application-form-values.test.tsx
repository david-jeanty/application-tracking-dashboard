import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// This project does not enable vitest globals, so Testing Library's automatic
// cleanup never registers and rendered trees would otherwise leak across tests.
afterEach(cleanup);

vi.mock("@/lib/applications/actions", () => ({
  createApplicationAction: vi.fn(),
}));

import { ApplicationCreatePanel } from "@/components/applications/application-form";

const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/job-descriptions");

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, `${name}.txt`), "utf8");
}

function openForm() {
  render(<ApplicationCreatePanel />);
  fireEvent.click(screen.getByRole("button", { name: /add application/i }));
}

function extract(text: string) {
  const paste = screen.queryByRole("button", { name: /paste posting/i });
  if (paste) fireEvent.click(paste);
  fireEvent.change(screen.getByLabelText(/paste the job description/i), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: /extract details/i }));
}

/** Every optional field that carries a realistic example placeholder. */
const EXAMPLE_FIELDS = [
  [/work-term season/i, "Summer 2027"],
  [/^location/i, "Toronto, ON"],
  [/application url/i, "https://company.example/jobs/role"],
  [/application source/i, "Company website"],
  [/work-term duration/i, "4 months"],
  [/^salary/i, "$20–$25/hour"],
  [/next action/i, "Follow up with recruiter"],
] as const;

describe("example values never become submitted values", () => {
  it("renders every realistic example as a placeholder, never as a value", () => {
    openForm();

    for (const [label, sample] of EXAMPLE_FIELDS) {
      const field = screen.getByLabelText(label);
      // The example is visible for guidance but the field submits nothing.
      expect(field).toHaveValue("");
      expect(field).toHaveAttribute("placeholder", expect.stringContaining(sample));
    }
  });

  it("marks examples as examples so they cannot read as extracted data", () => {
    openForm();

    for (const [label] of EXAMPLE_FIELDS) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        "placeholder",
        expect.stringMatching(/^e\.g\. /),
      );
    }
  });

  it("replaces the example with a not-found notice once extraction leaves a field empty", () => {
    // The posting states no salary. Showing "$20–$25/hour" there contradicts
    // the summary, which has just reported salary as unread.
    openForm();
    extract(fixture("no-salary-posting"));

    const salary = screen.getByLabelText(/^salary/i);
    expect(salary).toHaveValue("");
    expect(salary).toHaveAttribute("placeholder", "Not found in the posting");
  });

  it("keeps the example on fields the parser never reports on", () => {
    openForm();
    extract(fixture("no-salary-posting"));

    // The parser makes no claim about these, so their examples are guidance
    // rather than a contradiction of the summary.
    expect(screen.getByLabelText(/next action/i)).toHaveAttribute(
      "placeholder",
      "e.g. Follow up with recruiter",
    );
    expect(screen.getByLabelText(/application url/i)).toHaveValue("");
  });

  it("submits no value for a field the parser could not read", () => {
    openForm();
    extract(fixture("no-salary-posting"));

    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    const data = new FormData(form as HTMLFormElement);

    expect(data.get("salary")).toBe("");
    expect(data.get("applicationUrl")).toBe("");
    expect(data.get("applicationSource")).toBe("");
    expect(data.get("nextAction")).toBe("");
  });
});

describe("re-running extraction", () => {
  it("clears values the previous posting supplied but the new one does not", () => {
    openForm();
    extract(fixture("labelled-marketing-student"));
    expect(screen.getByLabelText(/^salary/i)).toHaveValue("$24.50 - $28.00 per hour");
    expect(screen.getByLabelText(/company name/i)).toHaveValue("Northline Technologies");

    // The second posting states no salary at all.
    extract(fixture("no-salary-posting"));

    expect(screen.getByLabelText(/^salary/i)).toHaveValue("");
    expect(screen.getByLabelText(/company name/i)).toHaveValue("Thornbury Mills");
  });

  it("reports the new posting's summary, not the previous one's", () => {
    openForm();
    extract(fixture("labelled-marketing-student"));
    extract(fixture("minimal-posting"));

    // The minimal posting fills almost nothing; a stale summary would still
    // claim the previous posting's much higher count.
    expect(screen.getByLabelText(/original job title/i)).toHaveValue(
      "Operations Intern",
    );
    expect(screen.getByLabelText(/work-term season/i)).toHaveValue("");
    expect(screen.getByLabelText(/^location/i)).toHaveValue("");
  });
});

describe("the prefill summary and the form agree", () => {
  it("fills exactly the fields the summary lists as filled", () => {
    openForm();
    extract(fixture("labelled-structured-pay-block"));

    // Reported as filled.
    expect(screen.getByLabelText(/company name/i)).toHaveValue(
      "Meridian Talent Cloud",
    );
    expect(screen.getByLabelText(/^salary/i)).toHaveValue("28.20–32.30 CAD per hour");
    expect(screen.getByLabelText(/^location/i)).toHaveValue("Virtual");
    expect(screen.getByLabelText(/work arrangement/i)).toHaveValue("Remote");

    expect(screen.getByText(/filled \d+ of 9 fields/i)).toBeInTheDocument();
  });

  it("leaves a field blank and says so when the posting never states it", () => {
    openForm();
    extract(fixture("metadata-labels-untitled"));

    // The posting names no role. Abstaining is correct; inventing one is not.
    expect(screen.getByLabelText(/original job title/i)).toHaveValue("");
    expect(
      screen.getByText(/could not be read confidently/i),
    ).toBeInTheDocument();
  });
});

describe("manual edits stay authoritative", () => {
  it("keeps a typed value when the posting is extracted only once", () => {
    openForm();
    extract(fixture("labelled-marketing-student"));

    const company = screen.getByLabelText(/company name/i);
    fireEvent.change(company, { target: { value: "Corrected Employer Inc." } });

    expect(company).toHaveValue("Corrected Employer Inc.");
    // Editing one field must not disturb the others.
    expect(screen.getByLabelText(/original job title/i)).toHaveValue(
      "Digital Campaign Marketing Student",
    );
  });
});
