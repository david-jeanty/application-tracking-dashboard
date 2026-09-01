import { describe, expect, it } from "vitest";

import { collectAdapterEvidence } from "../src/adapters.js";
import { buildCaptureRecord } from "../src/capture.js";
import {
  extractJob,
  extractJobReport,
  toExtractedJob,
} from "../src/extractor.js";
import { formFor } from "../src/popup-state.js";
import { readRulesFor } from "../src/sites.js";
import { jobPosting, jsonLd, readSitePage } from "./fixtures.js";

const JOB_A = "3752632";
const JOB_B = "3752633";
const DIRECT_B = `https://job-boards.greenhouse.io/northbridge/jobs/${JOB_B}?gh_jid=${JOB_B}`;

type GreenhouseRootOptions = {
  jobIds?: readonly string[];
  title?: string;
  location?: string;
  description?: string;
  employerName?: string;
  employerUrl?: string;
  includeLogo?: boolean;
};

/**
 * Synthetic prose inside the current public Greenhouse renderer's observed DOM.
 *
 * Read-only inspection of live Canonical and Greenhouse postings on 1 September
 * 2026 established the structure: one `main.job-post`, `.job__title h1`,
 * `.job__location`, `.job__description`, and `form#application-form` whose
 * action repeats the route job id. Canonical additionally rendered the optional
 * linked board logo used here. The words are invented; no real description is
 * copied into the repository.
 */
function greenhouseRoot({
  jobIds = [JOB_B],
  title = "Platform Reliability Engineer",
  location = "Home based - Worldwide",
  description = "Build dependable systems with the selected platform team.",
  employerName = "Northbridge Robotics",
  employerUrl = "https://www.northbridgerobotics.example/careers",
  includeLogo = true,
}: GreenhouseRootOptions = {}): string {
  return `<main class="main font-secondary job-post">
    <div class="job-post-container">
      ${
        includeLogo
          ? `<div class="image-container"><a class="logo" href="${employerUrl}"><img alt="${employerName} Logo" /></a></div>`
          : ""
      }
      <div class="job__header">
        <div class="job__title"><h1>${title}</h1></div>
        ${location ? `<div class="job__location"><svg></svg><div>${location}</div></div>` : ""}
        <button aria-label="Apply">Apply</button>
      </div>
      <div class="job__description"><p>${description}</p></div>
      ${jobIds
        .map(
          (jobId) =>
            `<form id="application-form" action="/northbridge/jobs/${jobId}"></form>`,
        )
        .join("")}
    </div>
  </main>`;
}

describe("Greenhouse direct-route and selected-root identity", () => {
  it("recognizes only the exact direct posting route and keeps the tenant out of identity", () => {
    expect(readRulesFor(DIRECT_B)).toMatchObject({
      strategy: "greenhouse-job-detail",
      jobId: JOB_B,
    });
    expect(
      readRulesFor("https://job-boards.greenhouse.io/northbridge"),
    ).not.toHaveProperty("strategy");
    expect(
      readRulesFor(
        "https://boards.greenhouse.io/embed/job_app?for=northbridge&token=3752633",
      ),
    ).not.toHaveProperty("strategy");
  });

  it("projects the fields and employer evidence explicitly tied to the current root", () => {
    const signals = readSitePage(greenhouseRoot(), DIRECT_B);
    const result = collectAdapterEvidence(signals);
    const job = extractJob(signals);

    expect(result.adapter).toBe("greenhouse_identity_aware");
    expect(result.postingIdentity).toEqual({
      support: "supported",
      observed: "verified",
    });
    expect(signals.selectedLinks?.applyUrl).toContain(
      `/northbridge/jobs/${JOB_B}`,
    );
    expect(job).toMatchObject({
      company: "Northbridge Robotics",
      jobTitle: "Platform Reliability Engineer",
      location: "Home based - Worldwide",
      jobDescription: expect.stringContaining("selected platform team"),
      companyDomain: "northbridgerobotics.example",
      // The direct Greenhouse page is itself the stable apply/posting link.
      jobUrl: `https://job-boards.greenhouse.io/northbridge/jobs/${JOB_B}`,
    });
    expect(result.admitsSelectedLinks).toBe(false);
  });
});

describe("Greenhouse fail-closed evidence", () => {
  it("leaves company and location blank when the root does not state them", () => {
    const job = extractJob(
      readSitePage(
        greenhouseRoot({ includeLogo: false, location: "" }),
        DIRECT_B,
      ),
    );

    expect(job.jobTitle).toBe("Platform Reliability Engineer");
    expect(job.jobDescription).toContain("selected platform team");
    expect(job.company).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  it("never derives company from the board slug, title prose, or a generic logo label", () => {
    const job = extractJob(
      readSitePage(
        `<head><title>Job Application for Platform Engineer at Guessed Company</title></head>${greenhouseRoot(
          {
            employerName: "Company",
            description: "The current posting does not explicitly name an employer.",
          },
        )}`,
        DIRECT_B,
      ),
    );

    expect(job.company).toBeUndefined();
    // A safe explicit destination remains independently useful for branding.
    expect(job.companyDomain).toBe("northbridgerobotics.example");
  });

  it.each([
    ["wrong", [JOB_A], "mismatched"],
    ["identity-less", [], "unobserved"],
    ["conflicting", [JOB_A, JOB_B], "ambiguous"],
  ] as const)(
    "keeps a %s posting root out of extraction, popup defaults, and save payload",
    (_label, jobIds, identity) => {
      const signals = readSitePage(
        greenhouseRoot({
          jobIds,
          title: "STALE TITLE",
          location: "STALE LOCATION",
          description: "STALE_DESCRIPTION_MARKER",
          employerName: "Stale Employer",
          employerUrl: "https://stale-employer.example/careers",
        }),
        DIRECT_B,
      );
      const report = extractJobReport(signals);
      const job = toExtractedJob(report);
      const form = formFor(job);
      const record = buildCaptureRecord(job, {
        company: "Manual Company",
        jobTitle: "Manual Title",
        status: "Interested",
      });

      expect(report.postingIdentity.observed).toBe(identity);
      expect(job.company).toBeUndefined();
      expect(job.jobTitle).toBeUndefined();
      expect(job.location).toBeUndefined();
      expect(job.jobDescription).toBeUndefined();
      expect(job.companyDomain).toBeUndefined();
      expect(form).toMatchObject({ company: "", jobTitle: "", location: "" });
      expect(record).not.toHaveProperty("company_domain");
      expect(JSON.stringify({ job, form, record })).not.toContain("STALE");
      expect(JSON.stringify({ job, form, record })).not.toContain(
        "stale-employer.example",
      );
    },
  );

  it("does not resolve two posting roots by document order, even with matching structured data", () => {
    const matched = jobPosting({
      url: `https://job-boards.greenhouse.io/northbridge/jobs/${JOB_B}`,
      title: "STRUCTURED TITLE",
      description: "STRUCTURED_DESCRIPTION_MARKER",
      hiringOrganization: {
        "@type": "Organization",
        name: "Structured Employer",
        url: "https://structured-employer.example",
      },
    });
    const signals = readSitePage(
      `${jsonLd(matched)}${greenhouseRoot()}${greenhouseRoot({ title: "Other root" })}`,
      DIRECT_B,
    );
    const job = extractJob(signals);

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("STRUCTURED");
  });

  it.each([
    "https://boards.greenhouse.io/northbridge/jobs/3752633",
    "https://job-boards.greenhouse.io/northbridge/jobs/3752633",
    "https://www.linkedin.com/company/northbridge",
    "https://job-boards.cdn.greenhouse.io/assets/logo.png",
  ])("never turns %s into an employer domain", (employerUrl) => {
    const job = extractJob(
      readSitePage(
        greenhouseRoot({ employerName: "Northbridge", employerUrl }),
        DIRECT_B,
      ),
    );

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });
});
