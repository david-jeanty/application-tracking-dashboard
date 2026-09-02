import { describe, expect, it } from "vitest";

import { collectAdapterEvidence, selectCaptureAdapter } from "../src/adapters.js";
import {
  extractJob,
  extractJobReport,
  toExtractedJob,
} from "../src/extractor.js";
import { readRulesFor, siteFor } from "../src/sites.js";
import { jsonLd, page, readSitePage } from "./fixtures.js";

/**
 * Greenhouse route identity and structured-data correlation.
 *
 * This environment's network egress to every Greenhouse host
 * (`boards.greenhouse.io`, `job-boards.greenhouse.io`, `boards-api.greenhouse.io`,
 * `greenhouse.io`) is blocked, the same restriction already recorded for
 * LinkedIn, Indeed and Workday before their selectors were written. No live
 * Greenhouse DOM was available to verify, so unlike Indeed and Workday this
 * adapter adds no DOM selectors at all. What it adds is `sites.ts`'s route
 * parsing of Greenhouse's own permanent per-posting address
 * (`/<company>/jobs/<id>`) into `jobId`, which strengthens the identity
 * correlation the structured-data path already performs generically for every
 * site through `selectStructuredCandidate`. Every field below is therefore
 * read out of the `schema.org` JobPosting JSON-LD a Greenhouse posting
 * publishes, never out of an invented selector.
 */

const COMPANY = "acme";
const JOB_A = "4001234";
const JOB_B = "4009876";
const DIRECT_B = `https://boards.greenhouse.io/${COMPANY}/jobs/${JOB_B}`;
const DIRECT_A = `https://boards.greenhouse.io/${COMPANY}/jobs/${JOB_A}`;
const NEW_UI_B = `https://job-boards.greenhouse.io/${COMPANY}/jobs/${JOB_B}`;

/** A structurally realistic, synthetic Greenhouse JobPosting record. */
function greenhousePosting(
  jobId: string,
  url: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Software Engineering Intern",
    url,
    identifier: {
      "@type": "PropertyValue",
      name: "Greenhouse Job ID",
      value: jobId,
    },
    description: "Join the platform team for a four-month term.",
    hiringOrganization: { "@type": "Organization", name: "Acme Corp" },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Toronto",
        addressRegion: "ON",
      },
    },
    ...overrides,
  };
}

describe("Greenhouse route identity", () => {
  it("names greenhouse on both board hosts and extracts the numeric job id", () => {
    expect(siteFor(DIRECT_B)).toBe("greenhouse");
    expect(siteFor(NEW_UI_B)).toBe("greenhouse");
    expect(readRulesFor(DIRECT_B)).toMatchObject({ jobId: JOB_B, fields: [] });
    expect(readRulesFor(NEW_UI_B)).toMatchObject({ jobId: JOB_B, fields: [] });
  });

  it("does not name a posting on a listing page or the embed iframe route", () => {
    expect(readRulesFor(`https://boards.greenhouse.io/${COMPANY}`)).toEqual({
      fields: [],
    });
    expect(
      readRulesFor(
        `https://boards.greenhouse.io/embed/job_app?for=${COMPANY}&token=${JOB_B}`,
      ),
    ).toEqual({ fields: [] });
  });
});

describe("Greenhouse structured-data capture", () => {
  it("captures company, title, location and description when correlated", () => {
    const html = page(jsonLd(greenhousePosting(JOB_B, DIRECT_B)));
    const job = extractJob(readSitePage(html, DIRECT_B));

    expect(job).toMatchObject({
      company: "Acme Corp",
      jobTitle: "Software Engineering Intern",
      location: "Toronto, ON",
      jobDescription: expect.stringContaining("platform team"),
      jobUrl: DIRECT_B,
    });
    expect(job.source).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  it("captures the same way on the newer job-boards.greenhouse.io host", () => {
    const html = page(jsonLd(greenhousePosting(JOB_B, NEW_UI_B)));
    const job = extractJob(readSitePage(html, NEW_UI_B));

    expect(job).toMatchObject({
      company: "Acme Corp",
      jobTitle: "Software Engineering Intern",
    });
  });

  it("correlates by the URL's job id even when the record's own url carries a tracking parameter the page does", () => {
    const trackedPageUrl = `${DIRECT_B}?gh_src=newsletter`;
    const html = page(jsonLd(greenhousePosting(JOB_B, DIRECT_B)));
    const job = extractJob(readSitePage(html, trackedPageUrl));

    expect(job.jobTitle).toBe("Software Engineering Intern");
    expect(job.company).toBe("Acme Corp");
  });

  it("does not guess a title from the heading when structured data is absent", () => {
    // A recognized site gets no second chance through the generic heading
    // fallback: blank is the honest answer here, not a guess, exactly as it
    // is for LinkedIn, Indeed and Workday.
    const html = page(
      "",
      '<h1>Software Engineering Intern</h1><a href="#apply">Apply for this job</a>',
    );
    const job = extractJob(readSitePage(html, DIRECT_B));

    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
    expect(job.warnings).toContain("missing_job_title");
  });
});

describe("Greenhouse posting-identity safety", () => {
  it("keeps job A out of the record on route B, even when A is published first", () => {
    const stale = greenhousePosting(JOB_A, DIRECT_A, {
      title: "Stale Job A Title",
      description: "STALE_A_MARKER",
    });
    const current = greenhousePosting(JOB_B, DIRECT_B, {
      title: "Current Job B Title",
    });
    const html = page(`${jsonLd(stale)}${jsonLd(current)}`);

    const job = extractJob(readSitePage(html, DIRECT_B));
    expect(job.jobTitle).toBe("Current Job B Title");
    expect(JSON.stringify(job)).not.toContain("Stale Job A");
    expect(JSON.stringify(job)).not.toContain("STALE_A_MARKER");
  });

  it("blanks every field when the page's only record names a different posting", () => {
    const mismatched = greenhousePosting(JOB_A, DIRECT_A);
    const html = page(jsonLd(mismatched));
    const report = extractJobReport(readSitePage(html, DIRECT_B));
    const job = toExtractedJob(report);

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(report.fields.jobTitle).toMatchObject({
      state: "ambiguous",
      reason: "structured_identity_mismatch",
    });
  });

  it("blanks every field when two records both claim the current posting", () => {
    const one = greenhousePosting(JOB_B, DIRECT_B, { title: "Claimant One" });
    const two = greenhousePosting(JOB_B, DIRECT_B, { title: "Claimant Two" });
    const html = page(`${jsonLd(one)}${jsonLd(two)}`);

    const job = extractJob(readSitePage(html, DIRECT_B));
    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
  });

  it("blanks every field when the only record carries no identity evidence at all", () => {
    // Unlike an unrecognized site, the route here already names a posting —
    // the URL's own job id — so a record that says nothing about which
    // posting it is gets no "only record on the page" concession either; it
    // is ambiguous, not unique_unidentified, and establishes nothing.
    const anonymous = greenhousePosting(JOB_B, DIRECT_B);
    delete anonymous["url"];
    delete anonymous["identifier"];
    const html = page(jsonLd(anonymous));

    const report = extractJobReport(readSitePage(html, DIRECT_B));
    expect(report.structuredData.identity).toBe("ambiguous");
    expect(toExtractedJob(report).jobTitle).toBeUndefined();
  });
});

describe("Greenhouse host and domain safety", () => {
  it("never turns the Greenhouse host itself into a company domain or a source", () => {
    const posting = greenhousePosting(JOB_B, DIRECT_B, {
      hiringOrganization: {
        "@type": "Organization",
        name: "Acme Corp",
        url: `https://boards.greenhouse.io/${COMPANY}`,
      },
    });
    const html = page(jsonLd(posting));
    const job = extractJob(readSitePage(html, DIRECT_B));

    expect(job.company).toBe("Acme Corp");
    expect(job.companyDomain).toBeUndefined();
    expect(job.source).toBeUndefined();
  });

  it("accepts an employer-owned domain the posting explicitly states", () => {
    const posting = greenhousePosting(JOB_B, DIRECT_B, {
      hiringOrganization: {
        "@type": "Organization",
        name: "Acme Corp",
        sameAs: "https://acme.example",
      },
    });
    const html = page(jsonLd(posting));
    const job = extractJob(readSitePage(html, DIRECT_B));

    expect(job.companyDomain).toBe("acme.example");
  });
});

describe("Greenhouse adapter routing", () => {
  it("routes through the compatibility adapter, reporting page-local identity as unsupported", () => {
    const signals = { jsonLdBlocks: [], meta: {}, pageUrl: DIRECT_B };
    const result = collectAdapterEvidence(signals);

    expect(selectCaptureAdapter(signals).id).toBe("legacy_site_fields");
    expect(result.adapter).toBe("legacy_site_fields");
    expect(result.fields).toEqual({});
    expect(result.postingIdentity).toEqual({
      support: "unsupported",
      observed: "unsupported",
    });
  });

  it("leaves LinkedIn, Indeed and Workday adapter selection unchanged", () => {
    const urls = [
      ["https://www.linkedin.com/jobs/view/222/", "linkedin_identity_aware"],
      ["https://ca.indeed.com/viewjob?jk=abc", "legacy_site_fields"],
      ["https://acme.wd5.myworkdayjobs.com/job/one", "legacy_site_fields"],
      ["https://careers.example.com/jobs/1", "generic_page"],
    ] as const;

    for (const [pageUrl, adapter] of urls) {
      expect(
        selectCaptureAdapter({ jsonLdBlocks: [], meta: {}, pageUrl }).id,
      ).toBe(adapter);
    }
  });
});
