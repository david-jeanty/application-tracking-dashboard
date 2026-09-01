import { describe, expect, it } from "vitest";

import { collectAdapterEvidence, selectCaptureAdapter } from "../src/adapters.js";
import { buildCaptureRecord } from "../src/capture.js";
import {
  extractJob,
  extractJobReport,
  toExtractedJob,
} from "../src/extractor.js";
import { formFor } from "../src/popup-state.js";
import { employerDomainFromUrl } from "../src/source.js";
import { readRulesFor } from "../src/sites.js";
import { jsonLd, readSitePage } from "./fixtures.js";

const JOB_A = "JR6403";
const JOB_B = "JR6803";
const DIRECT_B =
  "https://bdo.wd3.myworkdayjobs.com/en-US/BDO/job/Vancouver/Capital-Markets-Intern_JR6803";
const DETAILS_B =
  "https://bdo.wd3.myworkdayjobs.com/en-US/BDO/details/Capital-Markets-Intern_JR6803";

type WorkdayRootOptions = {
  root?: "jobPostingPage" | "jobDetails";
  requisitions?: readonly string[];
  title?: string;
  locations?: readonly string[];
  description?: string;
  heading?: string;
  logoLinkLabel?: string;
  logoName?: string;
  employerUrl?: string;
  before?: string;
  includeApply?: boolean;
};

function workdayRoot({
  root = "jobPostingPage",
  requisitions = [JOB_B],
  title = "Co-op or Intern, M&A and Capital Markets",
  locations = ["Vancouver", "Calgary - 8th Ave SW", "Edmonton - 103 St"],
  description = "Selected posting marker B. Join the advisory practice.",
  heading = "Canada",
  logoLinkLabel = "Careers home",
  logoName = "BDO logo",
  employerUrl = "https://www.bdo.ca/en-ca/careers/",
  before = "",
  includeApply = false,
}: WorkdayRootOptions = {}): string {
  const locationMarkup = `<div data-automation-id="locations"><dl><dt>locations</dt>${locations.map((location) => `<dd>${location}</dd>`).join("")}</dl></div>`;
  const requisitionMarkup = requisitions.map((id) => `<div data-automation-id="requisitionId"><dl><dt>job requisition id</dt><dd>${id}</dd></dl></div>`).join("");
  const detailMarkup = root === "jobDetails"
    ? `${locationMarkup}${requisitionMarkup}`
    : `<div data-automation-id="job-posting-details">${locationMarkup}</div>${requisitionMarkup}`;

  return `<body>
    <h1>${heading}</h1>
    <a aria-label="${logoLinkLabel}" data-automation-id="logoLink" href="${employerUrl}"><img data-automation-id="logo" alt="${logoName}" /></a>
    ${before}
    <section data-automation-id="${root}" aria-label="Job Details">
      <h2 data-automation-id="jobPostingHeader">${title}</h2>
      ${detailMarkup}
      <div data-automation-id="jobPostingDescription"><p>${description}</p></div>
      ${includeApply ? `<a data-automation-id="adventureButton" href="${DIRECT_B}/apply">Apply</a>` : ""}
    </section>
  </body>`;
}

describe("Workday route and selected-root identity", () => {
  it("routes only supported direct and selected details pages", () => {
    expect(readRulesFor(DIRECT_B)).toMatchObject({
      strategy: "workday-job-detail",
      jobId: JOB_B,
    });
    expect(readRulesFor(DETAILS_B)).toMatchObject({
      strategy: "workday-split-pane",
      jobId: JOB_B,
    });
    expect(
      readRulesFor("https://bdo.wd3.myworkdayjobs.com/en-US/BDO"),
    ).not.toHaveProperty("strategy");
  });

  it("normalizes Workday's copied-route suffix to the displayed requisition", () => {
    const copied =
      "https://td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers/job/Analyst_R_1499751-1";
    expect(readRulesFor(copied).jobId).toBe("R_1499751");
  });

  it.each([
    [DIRECT_B, "jobPostingPage"],
    [DETAILS_B, "jobDetails"],
  ] as const)("captures a matching selected root at %s", (url, root) => {
    const signals = readSitePage(workdayRoot({ root }), url);
    const result = collectAdapterEvidence(signals);
    const job = extractJob(signals);

    expect(result.adapter).toBe("workday_identity_aware");
    expect(result.postingIdentity).toEqual({
      support: "supported",
      observed: "verified",
    });
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "company",
          method: "board_branding",
          identity: "verified",
          decision: "accepted",
        }),
      ]),
    );
    expect(job).toMatchObject({
      company: "BDO",
      jobTitle: "Co-op or Intern, M&A and Capital Markets",
      location: "Vancouver • Calgary - 8th Ave SW • Edmonton - 103 St",
      jobDescription: expect.stringContaining("Selected posting marker B"),
      companyDomain: "bdo.ca",
      jobUrl: url,
    });
  });

  it("captures every location stated by the selected split pane", () => {
    const job = extractJob(
      readSitePage(workdayRoot({ root: "jobDetails" }), DETAILS_B),
    );
    expect(job.location?.split(" • ")).toEqual([
      "Vancouver",
      "Calgary - 8th Ave SW",
      "Edmonton - 103 St",
    ]);
  });
});

describe("stale Workday evidence rejection", () => {
  it("keeps selected root A out of extraction, popup defaults, and save payload on route B", () => {
    const signals = readSitePage(
      workdayRoot({
        root: "jobDetails",
        requisitions: [JOB_A],
        title: "STALE A TITLE",
        locations: ["STALE A LOCATION"],
        description: "STALE_A_UNIQUE_MARKER",
        logoName: "BDO logo",
        employerUrl: "https://stale-employer.example/careers",
      }),
      DETAILS_B,
    );
    const report = extractJobReport(signals);
    const job = toExtractedJob(report);
    const form = formFor(job);
    const record = buildCaptureRecord(job, {
      company: "Manual Company",
      jobTitle: "Manual Title",
      status: "Interested",
    });

    expect(report.postingIdentity.observed).toBe("mismatched");
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
    expect(form).toMatchObject({ company: "", jobTitle: "", location: "" });
    expect(record).not.toHaveProperty("company_domain");
    expect(JSON.stringify({ job, form, record })).not.toContain("STALE_A");
    expect(JSON.stringify({ job, form, record })).not.toContain(
      "stale-employer.example",
    );
  });

  it("does not let route B's id in the results rail verify selected root A", () => {
    const rail = `<section data-automation-id="jobResults">
      <a href="/en-US/BDO/job/Somewhere/Current_${JOB_B}">Current result ${JOB_B}</a>
    </section>`;
    const signals = readSitePage(
      workdayRoot({
        root: "jobDetails",
        requisitions: [JOB_A],
        title: "A title from the wrong selected root",
        before: rail,
      }),
      DETAILS_B,
    );

    expect(extractJob(signals).jobTitle).toBeUndefined();
    expect(collectAdapterEvidence(signals).postingIdentity.observed).toBe(
      "mismatched",
    );
  });

  it("never reads field-shaped content from the results rail beside a verified pane", () => {
    const rail = `<section data-automation-id="jobResults">
      <h2 data-automation-id="jobPostingHeader">STALE_RAIL_TITLE</h2>
      <div data-automation-id="locations"><dl><dd>STALE_RAIL_LOCATION</dd></dl></div>
      <div data-automation-id="jobPostingDescription">STALE_RAIL_DESCRIPTION</div>
    </section>`;
    const job = extractJob(
      readSitePage(
        workdayRoot({ root: "jobDetails", before: rail }),
        DETAILS_B,
      ),
    );

    expect(job).toMatchObject({
      company: "BDO",
      jobTitle: "Co-op or Intern, M&A and Capital Markets",
      location: "Vancouver • Calgary - 8th Ave SW • Edmonton - 103 St",
      companyDomain: "bdo.ca",
    });
    expect(JSON.stringify(job)).not.toContain("STALE_RAIL");
  });

  it.each([
    [[], "unobserved"],
    [[JOB_A, JOB_B], "ambiguous"],
  ] as const)("refuses %s identity rather than projecting it", (ids, state) => {
    const signals = readSitePage(
      workdayRoot({ root: "jobDetails", requisitions: ids }),
      DETAILS_B,
    );
    const result = collectAdapterEvidence(signals);
    const job = extractJob(signals);

    expect(result.postingIdentity.observed).toBe(state);
    expect(result.fields).toEqual({});
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });
});

describe("Workday structured and employer-domain safety", () => {
  it("does not treat a generic tenant-correlated board heading as the employer", () => {
    const url =
      "https://canada.wd3.myworkdayjobs.com/en-US/Careers/job/Toronto/Analyst_JR6803";
    const html = workdayRoot({
      heading: "Canada",
      logoName: "Canada logo",
      employerUrl: "https://canada.wd3.myworkdayjobs.com/en-US/Careers",
      description: "Selected posting text with no employer declaration.",
    });

    const job = extractJob(readSitePage(html, url));

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  /**
   * Live BDO: a decorative logo label beside an employer-owned destination.
   *
   * The board states where the employer's site is and does not state what the
   * employer is called. Those are different facts and they fail for different
   * reasons, so the name is refused and the destination is not: the dashboard
   * draws the right mark, and the student types the name they can see. Tying
   * the two together left a page that named its employer's site publishing no
   * domain at all.
   */
  it("keeps a safe destination when the logo name is only decorative", () => {
    const job = extractJob(
      readSitePage(
        workdayRoot({
          heading: "Canada",
          logoLinkLabel: "Careers home",
          logoName: "Company logo",
          employerUrl: "https://www.bdo.ca/en-ca/careers/",
          description: "Selected posting text with no employer declaration.",
        }),
        DIRECT_B,
      ),
    );

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBe("bdo.ca");
    expect(job.jobTitle).toBe("Co-op or Intern, M&A and Capital Markets");
  });

  it("keeps the same destination on the selected split pane", () => {
    const job = extractJob(
      readSitePage(
        workdayRoot({
          root: "jobDetails",
          before: '<section data-automation-id="jobResults"><ul><li>Another posting</li></ul></section>',
          heading: "Canada",
          logoLinkLabel: "Careers home",
          logoName: "Company logo",
          employerUrl: "https://www.bdo.ca/en-ca/careers/",
          description: "Selected posting text with no employer declaration.",
        }),
        DETAILS_B,
      ),
    );

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBe("bdo.ca");
  });

  /** A decorative label never becomes the employer, whatever the destination. */
  it("does not turn a generic logo name into the employer", () => {
    const job = extractJob(
      readSitePage(
        workdayRoot({
          heading: "Canada",
          logoName: "Canada logo",
          description: "Selected posting text with no employer declaration.",
        }),
        DIRECT_B,
      ),
    );

    expect(job.company).toBeUndefined();
  });

  /** The destination is still the only thing a domain may come from. */
  it("refuses a decorative-label board whose destination is the tenant itself", () => {
    const job = extractJob(
      readSitePage(
        workdayRoot({
          heading: "Canada",
          logoLinkLabel: "Careers home",
          logoName: "Company logo",
          employerUrl: "https://bdo.wd3.myworkdayjobs.com/en-US/BDO",
          description: "Selected posting text with no employer declaration.",
        }),
        DIRECT_B,
      ),
    );

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  /** A nameless destination is still bound to the verified selected root. */
  it("suppresses a nameless board domain when the selected root mismatches", () => {
    const job = extractJob(
      readSitePage(
        workdayRoot({
          requisitions: [JOB_A],
          heading: "Canada",
          logoLinkLabel: "Careers home",
          logoName: "Company logo",
          employerUrl: "https://www.bdo.ca/en-ca/careers/",
          description: "Selected posting text with no employer declaration.",
        }),
        DIRECT_B,
      ),
    );

    expect(job.companyDomain).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
  });

  it("requires a safe employer destination before a logo name can establish company", () => {
    const job = extractJob(
      readSitePage(
        workdayRoot({
          heading: "Canada",
          logoName: "BDO logo",
          employerUrl: "https://bdo.wd3.myworkdayjobs.com/en-US/BDO",
          description: "Selected posting text with no employer declaration.",
        }),
        DIRECT_B,
      ),
    );

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  it("accepts the equivalent safe TD logo-link pair", () => {
    const tdUrl =
      "https://td.wd3.myworkdayjobs.com/en-US/TD_Bank_Careers/job/Analyst_R_1499751";
    const job = extractJob(
      readSitePage(
        workdayRoot({
          requisitions: ["R_1499751"],
          heading: "TD Careers",
          logoName: "TD Careers logo",
          employerUrl: "https://careers.td.com/",
          description: "Selected posting text with no employer declaration.",
        }),
        tdUrl,
      ),
    );

    expect(job.company).toBe("TD");
    expect(job.companyDomain).toBe("td.com");
  });

  /**
   * The live BDO board, whose one logo link carries two accessible names.
   *
   * `aria-label` describes where the link goes and `alt` describes the mark,
   * and both are plausible employer names. An earlier version collected both
   * and then required exactly one, so a board that labels its logo twice looked
   * like a board that could not say who it belonged to: title, locations and
   * description all filled while Company stayed blank on a page that named the
   * employer plainly. These are the cases that caught it.
   */
  describe("one logo link that states its employer more than once", () => {
    const twiceLabelled = (options = {}) =>
      workdayRoot({
        heading: "Canada",
        logoLinkLabel: "BDO Canada",
        logoName: "BDO logo",
        employerUrl: "https://www.bdo.ca/en-ca/careers/",
        description: "Selected posting text with no employer declaration.",
        ...options,
      });

    it("establishes the employer on a direct posting page", () => {
      const job = extractJob(readSitePage(twiceLabelled(), DIRECT_B));

      expect(job.company).toBe("BDO");
      expect(job.companyDomain).toBe("bdo.ca");
      // The rest of the verified root still projects exactly as before.
      expect(job.jobTitle).toBe("Co-op or Intern, M&A and Capital Markets");
      expect(job.location).toBe("Vancouver • Calgary - 8th Ave SW • Edmonton - 103 St");
    });

    it("establishes the employer on a selected split pane", () => {
      const job = extractJob(
        readSitePage(
          twiceLabelled({
            root: "jobDetails",
            before: '<section data-automation-id="jobResults"><ul><li>Another posting</li></ul></section>',
          }),
          DETAILS_B,
        ),
      );

      expect(job.company).toBe("BDO");
      expect(job.companyDomain).toBe("bdo.ca");
      expect(job.jobTitle).toBe("Co-op or Intern, M&A and Capital Markets");
    });

    /** A generic mark description is passed over, not treated as a conflict. */
    it("falls through a generic alt to the label that names the employer", () => {
      const job = extractJob(
        readSitePage(
          twiceLabelled({ logoName: "logo", logoLinkLabel: "BDO" }),
          DIRECT_B,
        ),
      );

      expect(job.company).toBe("BDO");
      expect(job.companyDomain).toBe("bdo.ca");
    });

    /** Two links naming two employers is a real conflict and still refused. */
    it("refuses two logo links that name different employers", () => {
      const job = extractJob(
        readSitePage(
          twiceLabelled({
            before:
              '<a aria-label="Northwind" data-automation-id="logoLink" href="https://www.northwind.example/"><img data-automation-id="logo" alt="Northwind logo" /></a>',
          }),
          DIRECT_B,
        ),
      );

      expect(job.company).toBeUndefined();
      expect(job.companyDomain).toBeUndefined();
    });

    /** Board evidence is employer identity; the root is what binds the job. */
    it("suppresses board company and domain when the selected root mismatches", () => {
      const job = extractJob(
        readSitePage(twiceLabelled({ requisitions: [JOB_A] }), DIRECT_B),
      );

      expect(job.company).toBeUndefined();
      expect(job.companyDomain).toBeUndefined();
      expect(job.jobTitle).toBeUndefined();
    });

    it("suppresses board company and domain when the root is ambiguous", () => {
      const job = extractJob(
        readSitePage(
          twiceLabelled({ requisitions: [JOB_B, JOB_A] }),
          DIRECT_B,
        ),
      );

      expect(job.company).toBeUndefined();
      expect(job.companyDomain).toBeUndefined();
    });

    it("cannot establish an employer with no selected root at all", () => {
      const html = `<body>
        <h1>Canada</h1>
        <a aria-label="BDO Canada" data-automation-id="logoLink" href="https://www.bdo.ca/en-ca/careers/"><img data-automation-id="logo" alt="BDO logo" /></a>
        <section data-automation-id="jobResults"><ul><li>A posting</li></ul></section>
      </body>`;

      const job = extractJob(readSitePage(html, DETAILS_B));

      expect(job.company).toBeUndefined();
      expect(job.companyDomain).toBeUndefined();
    });

    it("still refuses a Workday destination however the logo is labelled", () => {
      const job = extractJob(
        readSitePage(
          twiceLabelled({
            employerUrl: "https://bdo.wd3.myworkdayjobs.com/en-US/BDO",
          }),
          DIRECT_B,
        ),
      );

      expect(job.company).toBeUndefined();
      expect(job.companyDomain).toBeUndefined();
    });
  });

  it("keeps correlated Workday structured data observable but untrusted", () => {
    const structured = jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      url: DIRECT_B,
      title: "Structured title must not win",
      description: "Structured stale marker",
      hiringOrganization: {
        "@type": "Organization",
        name: "Structured Employer",
        url: "https://structured-wrong.example",
      },
    });
    const signals = readSitePage(
      `<head>${structured}</head>${workdayRoot()}`,
      DIRECT_B,
    );
    const report = extractJobReport(signals);
    const job = toExtractedJob(report);

    expect(job.jobTitle).toBe("Co-op or Intern, M&A and Capital Markets");
    expect(job.company).toBe("BDO");
    expect(job.companyDomain).toBe("bdo.ca");
    expect(JSON.stringify(job)).not.toContain("Structured stale marker");
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      rejected: [
        {
          source: "json_ld_job_posting",
          reason: "workday_structured_data_untrusted",
        },
      ],
    });
  });

  it.each([
    "https://bdo.wd3.myworkdayjobs.com/BDO",
    "https://wd3.myworkdaycdn.com/assets/logo",
    "https://boards.greenhouse.io/bdo",
    "https://www.linkedin.com/company/bdo",
    "https://can01.safelinks.protection.outlook.com/?url=https://bdo.ca",
  ])("never treats the posting, ATS, CDN, social, or redirect host as employer domain: %s", (url) => {
    expect(employerDomainFromUrl(url)).toBeUndefined();
    const job = extractJob(
      readSitePage(workdayRoot({ employerUrl: url }), DIRECT_B),
    );
    expect(job.companyDomain).toBeUndefined();
  });

  it("carries a verified board employer domain through the save wire field", () => {
    const job = extractJob(readSitePage(workdayRoot(), DIRECT_B));
    const record = buildCaptureRecord(job, {
      company: job.company ?? "",
      jobTitle: job.jobTitle ?? "",
      location: job.location,
      status: "Interested",
    });

    expect(job.companyDomain).toBe("bdo.ca");
    expect(record.company_domain).toBe("bdo.ca");
  });
});

describe("adapter compatibility around Workday", () => {
  it("leaves LinkedIn identity-aware and other pages on their prior adapters", () => {
    const urls = [
      ["https://www.linkedin.com/jobs/view/222/", "linkedin_identity_aware"],
      [
        "https://boards.greenhouse.io/acme/jobs/1",
        "greenhouse_identity_aware",
      ],
      ["https://careers.ibm.com/job/1", "generic_page"],
      ["https://careers.example.com/jobs/1", "generic_page"],
    ] as const;

    for (const [pageUrl, adapter] of urls) {
      expect(
        selectCaptureAdapter({ jsonLdBlocks: [], meta: {}, pageUrl }).id,
      ).toBe(adapter);
    }
  });
});
