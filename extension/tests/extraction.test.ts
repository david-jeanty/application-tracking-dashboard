import { describe, expect, it } from "vitest";
import {
  extractJob,
  extractJobReport,
  extractionDiagnostics,
  toExtractedJob,
  DESCRIPTION_LIMIT,
} from "../src/extractor.js";
import type { ExtractionReport } from "../src/types.js";
import { unwrapLinkedInSafetyGoDestination } from "../src/source.js";
import {
  applyControl,
  jobPosting,
  jsonLd,
  page,
  rawJsonLd,
  readPage,
  readSitePage,
} from "./fixtures.js";

const JNJ_LINKEDIN_POSTING = `<head></head><body>
  <aside><a href="https://other.example/careers">Neighbouring role</a></aside>
  <main><section>
    <div aria-label="Company, Johnson &amp; Johnson MedTech.">Johnson &amp; Johnson MedTech</div>
    <div data-display-contents="true"><p>Marketing Co-Op</p></div>
    <p><span>Toronto, ON</span></p>
  </section></main>
  <section><h2>About the job</h2><div data-testid="expandable-text-box">
    <a href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fwww.jnj.com%2Fmedtech&amp;trk=test">jnj.com</a>
  </div></section>
</body>`;

const KPMG_SELECTED_APPLY = {
  applyUrl: "https://kpmg.com/ca/en/home/careers.html",
} as const;

/**
 * What the extension is willing to claim about a page.
 *
 * The assertions that matter most here are the negative ones. A parser that
 * finds a title on a well-marked-up posting is table stakes; a parser that
 * refuses to call Greenhouse the employer, refuses to guess a company from a
 * page that has none, and refuses to follow a canonical link to another site is
 * the actual product requirement. Wrong information is worse than a blank
 * field, because the student has no reason to doubt what the extension filled
 * in for them.
 */

describe("structured JobPosting data", () => {
  it("reads a single JobPosting object", () => {
    const signals = readPage(page(jsonLd(jobPosting())));
    const report = extractJobReport(signals);
    const job = toExtractedJob(report);

    expect(job.company).toBe("IBM");
    expect(job.jobTitle).toBe("Business Technology Analyst Intern");
    expect(job.location).toBe("Ottawa, ON");
    expect(job.jobDescription).toContain("analytics team");
    expect(job.warnings).toEqual([]);
    // The compatibility entry point remains exactly this projection.
    expect(extractJob(signals)).toEqual(job);
    expect(report.fields.company).toMatchObject({
      state: "established",
      confidence: "exact",
      source: "json_ld_job_posting",
    });
    expect(report.fields.jobDescription).toMatchObject({
      state: "established",
      source: "json_ld_job_posting",
    });
  });

  it("reads a JobPosting from a top-level array", () => {
    const html = page(
      jsonLd([{ "@type": "WebSite", name: "Careers" }, jobPosting()]),
    );

    expect(extractJob(readPage(html)).company).toBe("IBM");
  });

  it("reads a JobPosting nested in an @graph", () => {
    const html = page(
      jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "BreadcrumbList", itemListElement: [] },
          jobPosting({ title: "Marketing Co-op" }),
        ],
      }),
    );

    expect(extractJob(readPage(html)).jobTitle).toBe("Marketing Co-op");
  });

  it("reads across multiple JSON-LD script blocks", () => {
    const html = page(
      jsonLd({ "@type": "Organization", name: "Some Job Board" }) +
        jsonLd(jobPosting({ title: "Data Analyst Intern" })),
    );

    const job = extractJob(readPage(html));

    expect(job.jobTitle).toBe("Data Analyst Intern");
    expect(job.company).toBe("IBM");
  });

  it("skips a malformed block without losing a valid one", () => {
    const html = page(
      rawJsonLd("{ this is not json, ") + jsonLd(jobPosting()),
    );

    const job = extractJob(readPage(html));

    expect(job.company).toBe("IBM");
    expect(job.warnings).toEqual([]);
  });

  it("recognizes a @type array containing JobPosting", () => {
    const html = page(
      jsonLd(jobPosting({ "@type": ["Thing", "JobPosting"] })),
    );

    expect(extractJob(readPage(html)).jobTitle).toBe(
      "Business Technology Analyst Intern",
    );
  });

  it("survives a page whose only JSON-LD is unparseable", () => {
    const html = page(
      rawJsonLd("<<<"),
      `<h1>Analytics Intern</h1>${applyControl()}`,
    );

    const job = extractJob(readPage(html));

    expect(job.jobTitle).toBe("Analytics Intern");
    expect(job.company).toBeUndefined();
    expect(job.warnings).toContain("missing_company");
    // Something was found, so the popup must not claim the page was empty.
    expect(job.warnings).not.toContain("no_job_posting_found");
  });
});

describe("descriptions", () => {
  it("turns an HTML description into readable plain text", () => {
    const html = page(
      jsonLd(
        jobPosting({
          description:
            "<div><p>What you&rsquo;ll do</p><ul><li>Build reports</li><li>Meet stakeholders</li></ul><script>alert(1)</script></div>",
        }),
      ),
    );

    const job = extractJob(readPage(html));

    expect(job.jobDescription).toBe(
      "What you’ll do\nBuild reports\nMeet stakeholders",
    );
    expect(job.jobDescription).not.toContain("alert");
    expect(job.jobDescription).not.toContain("<");
  });

  it("says so when a description is too long, instead of quietly cutting it", () => {
    const html = page(
      jsonLd(jobPosting({ description: "word ".repeat(DESCRIPTION_LIMIT) })),
    );

    const job = extractJob(readPage(html));

    expect(job.warnings).toContain("description_too_long");
    expect(job.jobDescription?.length).toBeLessThanOrEqual(DESCRIPTION_LIMIT);
    expect(job.jobDescription).toContain("was shortened here");
  });

  it("keeps a description that fits without adding a notice", () => {
    const html = page(jsonLd(jobPosting({ description: "Short and complete." })));

    const job = extractJob(readPage(html));

    expect(job.jobDescription).toBe("Short and complete.");
    expect(job.warnings).not.toContain("description_too_long");
  });

  it("marks a generic metadata description strong without changing its projection", () => {
    const report = extractJobReport(
      readPage(
        page('<meta property="og:description" content="Page metadata description." />'),
      ),
    );

    expect(toExtractedJob(report).jobDescription).toBe(
      "Page metadata description.",
    );
    expect(report.fields.jobDescription).toMatchObject({
      state: "established",
      source: "generic_metadata",
      confidence: "strong",
    });
  });
});

describe("the employer's domain", () => {
  it("uses an explicit hiringOrganization URL and canonicalizes www", () => {
    const html = page(
      jsonLd(
        jobPosting({
          hiringOrganization: {
            "@type": "Organization",
            name: "IBM",
            url: "https://www.ibm.com/careers",
          },
        }),
      ),
    );

    expect(extractJob(readPage(html)).companyDomain).toBe("ibm.com");
  });

  it("keeps structured employer identity above selected-link evidence", () => {
    const html = page(
      jsonLd(
        jobPosting({
          hiringOrganization: {
            "@type": "Organization",
            name: "Shopify",
            url: "https://www.shopify.com/careers",
          },
        }),
      ),
    );

    const report = extractJobReport({
      ...readPage(html),
      selectedLinks: { descriptionUrls: ["https://careers.other.example/jobs/1"] },
    });

    expect(toExtractedJob(report).companyDomain).toBe("shopify.com");
    expect(report.fields.companyDomain).toMatchObject({
      state: "established",
      confidence: "exact",
      source: "json_ld_job_posting",
    });
  });

  it("keeps hiringOrganization.sameAs as structured employer identity", () => {
    const html = page(
      jsonLd(
        jobPosting({
          hiringOrganization: {
            "@type": "Organization",
            name: "Shopify",
            sameAs: "https://www.shopify.com/company",
          },
        }),
      ),
    );

    expect(extractJob(readPage(html)).companyDomain).toBe("shopify.com");
  });

  it("uses the selected LinkedIn description and never a neighbouring link", () => {
    const signals = readSitePage(
      JNJ_LINKEDIN_POSTING,
      "https://www.linkedin.com/jobs/view/123",
    );
    const report = extractJobReport(signals);

    expect(signals.selectedLinks?.descriptionUrls).toEqual([
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fwww.jnj.com%2Fmedtech&trk=test",
    ]);
    expect(toExtractedJob(report).companyDomain).toBe("jnj.com");
    expect(report.fields.companyDomain).toMatchObject({
      state: "established",
      confidence: "strong",
      source: "linkedin_selected_posting",
    });
  });

  it.each([
    ["selected Apply", KPMG_SELECTED_APPLY, "kpmg.com"],
    ["recruitment subdomain", { descriptionUrls: ["https://careers.microsoft.com/us/en/"] }, "microsoft.com"],
    ["multi-label suffix", { descriptionUrls: ["https://jobs.example.co.uk/role/123"] }, "example.co.uk"],
    ["ordinary subdomain", { descriptionUrls: ["https://ca.example.com/"] }, "ca.example.com"],
    ["employer-owned Rippling", { descriptionUrls: ["https://www.rippling.com/careers"] }, "rippling.com"],
  ] as const)("canonicalizes %s selected evidence", (_label, selectedLinks, expected) => {
    expect(
      extractJob({
        jsonLdBlocks: [],
        meta: {},
        pageUrl: "https://www.linkedin.com/jobs/view/123",
        selectedLinks,
      }).companyDomain,
    ).toBe(expected);
  });

  it.each([
    [
      "LinkedIn safety URL for a recruitment subdomain",
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fcareers.jnj.com%2Fjobs%2F123",
      "jnj.com",
    ],
    [
      "LinkedIn safety URL for a Greenhouse board",
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fboards.greenhouse.io%2Facme%2Fjobs%2F1",
      undefined,
    ],
    [
      "LinkedIn safety URL for LinkedIn itself",
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fwww.linkedin.com%2Fjobs%2Fview%2F1",
      undefined,
    ],
  ] as const)("handles %s through the existing employer rejection pipeline", (_label, url, expected) => {
    expect(
      extractJob({
        jsonLdBlocks: [],
        meta: {},
        pageUrl: "https://www.linkedin.com/jobs/view/123",
        selectedLinks: { descriptionUrls: [url] },
      }).companyDomain,
    ).toBe(expected);
  });

  it("uses a LinkedIn safety URL for the selected Apply destination", () => {
    expect(
      extractJob({
        jsonLdBlocks: [],
        meta: {},
        pageUrl: "https://www.linkedin.com/jobs/view/123",
        selectedLinks: {
          applyUrl:
            "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fkpmg.com%2Fca%2Fen%2Fhome%2Fcareers.html&trk=test",
        },
      }).companyDomain,
    ).toBe("kpmg.com");
  });

  it.each([
    ["a missing destination", "https://www.linkedin.com/safety/go/?trk=test"],
    ["multiple destinations", "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fjnj.com&url=https%3A%2F%2Fkpmg.com"],
    ["a non-http destination", "https://www.linkedin.com/safety/go/?url=javascript%3Aalert%281%29"],
    ["a malformed destination", "https://www.linkedin.com/safety/go/?url=https%3A%2F%2F%25"],
    ["an unrelated LinkedIn route", "https://www.linkedin.com/jobs/view/123?url=https%3A%2F%2Fjnj.com"],
    ["an unrelated redirect route", "https://example.com/redirect?url=https%3A%2F%2Fjnj.com"],
  ])("does not unwrap %s", (_label, url) => {
    expect(unwrapLinkedInSafetyGoDestination(url)).toBeUndefined();
  });

  it.each([
    "https://www.linkedin.com/jobs/view/1",
    "https://ca.indeed.com/viewjob?jk=1",
    "https://acme.wd5.myworkdayjobs.com/jobs",
    "https://boards.greenhouse.io/acme/jobs/1",
    "https://jobs.lever.co/acme/1",
    "https://ats.rippling.com/acme/jobs/1",
  ])("rejects %s as selected employer evidence", (url) => {
    expect(
      extractJob({
        jsonLdBlocks: [],
        meta: {},
        pageUrl: "https://www.linkedin.com/jobs/view/123",
        selectedLinks: { descriptionUrls: [url] },
      }).companyDomain,
    ).toBeUndefined();
  });

  it("leaves conflicting selected-description domains unprojected", () => {
    const report = extractJobReport({
      jsonLdBlocks: [],
      meta: {},
      pageUrl: "https://www.linkedin.com/jobs/view/123",
      selectedLinks: {
        descriptionUrls: [
          "https://careers.example.com/jobs/1",
          "https://jobs.other.example/role/1",
        ],
      },
    });

    expect(toExtractedJob(report).companyDomain).toBeUndefined();
    expect(report.fields.companyDomain).toMatchObject({
      state: "ambiguous",
      reason: "conflicting_evidence",
    });
  });

  it("never treats the applicant-tracking host as the employer", () => {
    const html = page(
      jsonLd(
        jobPosting({
          hiringOrganization: {
            "@type": "Organization",
            name: "Northwind",
            url: "https://boards.greenhouse.io/northwind",
          },
        }),
      ),
    );

    const job = extractJob(
      readPage(html, "https://boards.greenhouse.io/northwind/jobs/4001"),
    );

    expect(job.company).toBe("Northwind");
    expect(job.companyDomain).toBeUndefined();
  });

  it("never derives an employer domain from the page it is viewing", () => {
    const html = page(jsonLd(jobPosting()));

    const job = extractJob(
      readPage(html, "https://acme.wd1.myworkdayjobs.com/en-US/careers/job/1"),
    );

    expect(job.companyDomain).toBeUndefined();
  });
});

describe("missing information", () => {
  it("leaves location unknown and says so", () => {
    const html = page(jsonLd(jobPosting({ jobLocation: undefined })));

    const job = extractJob(readPage(html));

    expect(job.location).toBeUndefined();
    expect(job.warnings).toContain("missing_location");
  });

  it("falls back to the page heading when the posting has no title", () => {
    const html = page(
      jsonLd(jobPosting({ title: undefined })),
      "<h1>Finance Co-op Student</h1>",
    );

    const report = extractJobReport(readPage(html));
    const job = toExtractedJob(report);

    expect(job.jobTitle).toBe("Finance Co-op Student");
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      source: "generic_fallback",
      confidence: "strong",
      corroboratedBy: ["structured_job_posting"],
    });
  });

  it("reports a missing title when nothing on the page supplies one", () => {
    const html = "<head></head><body><p>No heading here</p></body>";
    document.documentElement.innerHTML = html;

    const job = extractJob({
      jsonLdBlocks: [JSON.stringify(jobPosting({ title: undefined }))],
      meta: {},
      pageUrl: "https://careers.example.com/jobs/1",
    });

    expect(job.jobTitle).toBeUndefined();
    expect(job.warnings).toContain("missing_job_title");
  });

  it("leaves the company blank rather than guessing when none is named", () => {
    const html = page(jsonLd(jobPosting({ hiringOrganization: undefined })));

    const job = extractJob(readPage(html));

    expect(job.company).toBeUndefined();
    expect(job.warnings).toContain("missing_company");
  });
});

describe("dates and pay", () => {
  it("reads a bare-date validThrough as the deadline", () => {
    const html = page(jsonLd(jobPosting({ validThrough: "2026-11-30" })));

    expect(extractJob(readPage(html)).deadline).toBe("2026-11-30");
  });

  it("ignores a validThrough that is not a real date", () => {
    const html = page(jsonLd(jobPosting({ validThrough: "2026-02-31" })));

    expect(extractJob(readPage(html)).deadline).toBeUndefined();
  });

  /**
   * The real failure this rule exists for: a posting whose page said "apply by
   * September 13" while its `validThrough` read September 14. A timestamp is an
   * expiry instant, and both the exclusive-midnight convention and the zone it
   * is written in move it across a calendar boundary — invisibly, and by
   * exactly one day.
   */
  it("refuses a timestamped validThrough rather than guessing its day", () => {
    for (const validThrough of [
      "2026-09-14T00:00:00",
      "2026-09-14T00:00:00Z",
      "2026-09-13T23:59:59-04:00",
      "2026-09-14T03:59:59Z",
      "2026-09-14 00:00:00",
    ]) {
      const html = page(jsonLd(jobPosting({ validThrough })));

      expect(extractJob(readPage(html)).deadline).toBeUndefined();
    }
  });

  it("reads a structured baseSalary", () => {
    const html = page(
      jsonLd(
        jobPosting({
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "CAD",
            value: {
              "@type": "QuantitativeValue",
              minValue: 22,
              maxValue: 25,
              unitText: "HOUR",
            },
          },
        }),
      ),
    );

    expect(extractJob(readPage(html)).salary).toBe("CAD 22–25 per hour");
  });

  it("ignores a baseSalary with no currency to make sense of", () => {
    const html = page(
      jsonLd(
        jobPosting({
          baseSalary: { "@type": "MonetaryAmount", value: { value: 50000 } },
        }),
      ),
    );

    expect(extractJob(readPage(html)).salary).toBeUndefined();
  });

  /**
   * The real failure this rule exists for. A posting published
   * `baseSalary.value.value: 0`, and the first version stored "USD 0 per year"
   * — not an unknown salary but a false one, in a field a student would use to
   * compare offers.
   */
  it("refuses a structured zero rather than storing USD 0 per year", () => {
    const html = page(
      jsonLd(
        jobPosting({
          baseSalary: {
            "@type": "MonetaryAmount",
            currency: "USD",
            value: {
              "@type": "QuantitativeValue",
              value: 0,
              unitText: "YEAR",
            },
          },
        }),
      ),
    );

    expect(extractJob(readPage(html)).salary).toBeUndefined();
  });

  it("refuses amounts that are not money", () => {
    for (const value of [0, -5, "0", "", "not a number", null]) {
      const html = page(
        jsonLd(
          jobPosting({
            baseSalary: {
              currency: "CAD",
              value: { value, unitText: "HOUR" },
            },
          }),
        ),
      );

      expect(extractJob(readPage(html)).salary).toBeUndefined();
    }
  });

  it("refuses a range whose bounds are zero or inverted", () => {
    for (const value of [
      { minValue: 0, maxValue: 0 },
      { minValue: 0, maxValue: -1 },
      { minValue: 90000, maxValue: 40000 },
    ]) {
      const html = page(
        jsonLd(
          jobPosting({
            baseSalary: {
              currency: "CAD",
              value: { ...value, unitText: "YEAR" },
            },
          }),
        ),
      );

      expect(extractJob(readPage(html)).salary).toBeUndefined();
    }
  });

  it("qualifies a half-stated range instead of reading it as the salary", () => {
    const minimumOnly = page(
      jsonLd(
        jobPosting({
          baseSalary: {
            currency: "CAD",
            value: { minValue: 50000, unitText: "YEAR" },
          },
        }),
      ),
    );
    const maximumOnly = page(
      jsonLd(
        jobPosting({
          baseSalary: {
            currency: "CAD",
            value: { maxValue: 80000, unitText: "YEAR" },
          },
        }),
      ),
    );

    expect(extractJob(readPage(minimumOnly)).salary).toBe(
      "CAD 50,000+ per year",
    );
    expect(extractJob(readPage(maximumOnly)).salary).toBe(
      "CAD up to 80,000 per year",
    );
  });

  it("collapses a range whose bounds are the same figure", () => {
    const html = page(
      jsonLd(
        jobPosting({
          baseSalary: {
            currency: "CAD",
            value: { minValue: 25, maxValue: 25, unitText: "HOUR" },
          },
        }),
      ),
    );

    expect(extractJob(readPage(html)).salary).toBe("CAD 25 per hour");
  });

  it("refuses a written-out salary that states nothing but zero", () => {
    const html = page(
      jsonLd(jobPosting({ baseSalary: "USD 0.00 per year" })),
    );

    expect(extractJob(readPage(html)).salary).toBeUndefined();
  });

  it("keeps a written-out salary that states a real figure", () => {
    const html = page(jsonLd(jobPosting({ baseSalary: "$23.50 per hour" })));

    expect(extractJob(readPage(html)).salary).toBe("$23.50 per hour");
  });
});

/**
 * The generic fallback, after real-site testing showed it was too willing.
 *
 * The mechanism is structural: a heading is considered only on a page whose
 * address names one posting, that offers to be applied to, or that declares
 * itself a job page — two of the three. The whole-string furniture check below
 * it is a backstop, not the rule.
 */
describe("the generic fallback", () => {
  const chromeHeadings = [
    "Welcome back",
    "Search for Jobs",
    "Careers",
    "Jobs",
    "Home",
    "Sign in",
    "Job search",
    "Jobs for you",
  ];

  it("refuses page furniture even on a page that looks like a posting", () => {
    for (const heading of chromeHeadings) {
      const html = page("", `<h1>${heading}</h1>${applyControl()}`);

      const job = extractJob(
        readPage(html, "https://careers.example.com/jobs/48213"),
      );

      expect(job.jobTitle).toBeUndefined();
    }
  });

  it("refuses a heading on a page with nothing to corroborate it", () => {
    const html = page("", "<h1>Analytics Intern</h1>");

    expect(
      extractJob(readPage(html, "https://www.example.com/")).jobTitle,
    ).toBeUndefined();
  });

  it("accepts a heading once two signals agree the page is a posting", () => {
    const html = page("", `<h1>Analytics Intern</h1>${applyControl()}`);

    const report = extractJobReport(
      readPage(html, "https://careers.example.com/job/analytics/48213"),
    );

    expect(toExtractedJob(report).jobTitle).toBe("Analytics Intern");
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      confidence: "strong",
      source: "generic_fallback",
      corroboratedBy: ["job_shaped_url", "apply_control"],
    });
    expect(extractionDiagnostics(report).fields.jobTitle.corroboratedBy).toEqual(
      ["job_shaped_url", "apply_control"],
    );
  });

  it("refuses a heading that is only the site's own name", () => {
    const html = page(
      '<meta property="og:site_name" content="Workmill" />',
      `<h1>Workmill</h1>${applyControl()}`,
    );

    expect(
      extractJob(readPage(html, "https://workmill.com/jobs/48213")).jobTitle,
    ).toBeUndefined();
  });

  it("takes a declared job page as one of the two signals", () => {
    const html = page(
      '<meta property="og:type" content="job" />',
      "<h1>Analytics Intern</h1>",
    );

    const report = extractJobReport(
      readPage(html, "https://careers.example.com/job/48213"),
    );

    expect(toExtractedJob(report).jobTitle).toBe("Analytics Intern");
    expect(report.fields.jobTitle).toMatchObject({
      corroboratedBy: ["job_shaped_url", "declared_job_page"],
    });
  });
});

/**
 * JobPosting microdata: the same vocabulary, written on the elements.
 *
 * Employer careers sites publish it far more often than job boards do, and
 * reading it costs no site knowledge at all — which is why a direct careers
 * page that offered nothing to the first version can be read here.
 */
describe("JobPosting microdata", () => {
  const microdataPosting = `<body>
     <div itemscope itemtype="https://schema.org/JobPosting">
       <h1 itemprop="title">Systems Engineering Intern</h1>
       <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
         <span itemprop="name">Beacon Aerospace</span>
         <link itemprop="url" href="https://beaconaerospace.com/" />
       </div>
       <div itemprop="jobLocation" itemscope itemtype="https://schema.org/Place">
         <div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
           <span itemprop="addressLocality">Waterloo</span>
           <span itemprop="addressRegion">ON</span>
         </div>
       </div>
       <meta itemprop="validThrough" content="2026-10-01" />
       <div itemprop="description"><p>Work on avionics test benches.</p></div>
     </div>
   </body>`;

  it("reads a posting a page expressed in attributes", () => {
    const report = extractJobReport(
      readPage(
        `<head></head>${microdataPosting}`,
        "https://careers.beaconaerospace.com/job/48213",
      ),
    );
    const job = toExtractedJob(report);

    expect(job.company).toBe("Beacon Aerospace");
    expect(job.jobTitle).toBe("Systems Engineering Intern");
    expect(job.location).toBe("Waterloo, ON");
    expect(job.jobDescription).toBe("Work on avionics test benches.");
    expect(job.deadline).toBe("2026-10-01");
    expect(job.companyDomain).toBe("beaconaerospace.com");
    expect(job.warnings).toEqual([]);
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      confidence: "exact",
      source: "microdata_job_posting",
    });
  });

  it("still prefers JSON-LD when the page publishes both", () => {
    const html = `<head>${jsonLd(jobPosting())}</head>${microdataPosting}`;
    const report = extractJobReport(readPage(html));

    expect(toExtractedJob(report).company).toBe("IBM");
    expect(report.structuredData).toEqual({
      jsonLdJobPosting: true,
      microdataJobPosting: true,
    });
  });
});

describe("sanitized extraction diagnostics", () => {
  it("keeps values, descriptions, and token-like text out of diagnostics", () => {
    const description = "Private role details bearer very-secret-token";
    const report = extractJobReport(
      readPage(page(jsonLd(jobPosting({ description })))),
    );

    const diagnostics = extractionDiagnostics(report);
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.fields.jobDescription.valueLength).toBe(description.length);
    expect(serialized).not.toContain(description);
    expect(serialized).not.toContain("very-secret-token");
    expect(serialized).not.toContain("<script");
  });

  it("never projects a candidate value from an intentionally malformed ambiguous field", () => {
    const report = extractJobReport(readPage(page(jsonLd(jobPosting()))));
    const malformed = {
      ...report,
      fields: {
        ...report.fields,
        // Intentionally violates the type contract to test the runtime boundary.
        company: {
          state: "ambiguous",
          confidence: "ambiguous",
          source: "json_ld_job_posting",
          reason: "workday_structured_data_untrusted",
          value: "Wrong Employer",
        },
      },
    } as unknown as ExtractionReport;

    expect(toExtractedJob(malformed).company).toBeUndefined();
  });
});

describe("pages that are not job postings", () => {
  it("reports that nothing was found and fills nothing in", () => {
    const html = page(
      '<meta property="og:site_name" content="Example News" />',
      "<h1>Five ways to write a résumé</h1>",
    );

    const job = extractJob(readPage(html, "https://news.example.com/article"));

    expect(job.warnings).toContain("no_job_posting_found");
    expect(job.company).toBeUndefined();
    expect(job.location).toBeUndefined();
    // An article about résumés is not a job, and its headline is not a title.
    expect(job.jobTitle).toBeUndefined();
  });

  it("drops a trailing site name the page declared itself", () => {
    const html = page(
      '<meta property="og:site_name" content="IBM Careers" />' +
        '<meta property="og:title" content="Business Technology Analyst Intern | IBM Careers" />',
      `<div>no heading</div>${applyControl()}`,
    );

    expect(extractJob(readPage(html)).jobTitle).toBe(
      "Business Technology Analyst Intern",
    );
  });
});

describe("the stored posting URL", () => {
  it("prefers a same-host canonical link", () => {
    const html = page(
      '<link rel="canonical" href="https://careers.example.com/jobs/1" />' +
        jsonLd(jobPosting()),
    );

    const job = extractJob(
      readPage(html, "https://careers.example.com/jobs/1?utm_source=email"),
    );

    expect(job.jobUrl).toBe("https://careers.example.com/jobs/1");
  });

  it("uses the page address when there is no canonical link", () => {
    const html = page(jsonLd(jobPosting()));

    const job = extractJob(readPage(html, "https://careers.example.com/jobs/7"));

    expect(job.jobUrl).toBe("https://careers.example.com/jobs/7");
  });

  it("refuses a canonical link that points at another site", () => {
    const html = page(
      '<link rel="canonical" href="https://attacker.example.net/jobs/1" />' +
        jsonLd(jobPosting()),
    );

    const job = extractJob(readPage(html, "https://careers.example.com/jobs/9"));

    expect(job.jobUrl).toBe("https://careers.example.com/jobs/9");
  });
});

describe("where the student found the job", () => {
  it("names a job board whose host settles the question", () => {
    const html = page(jsonLd(jobPosting()));

    expect(
      extractJob(readPage(html, "https://www.linkedin.com/jobs/view/123")).source,
    ).toBe("LinkedIn");
    expect(
      extractJob(readPage(html, "https://ca.indeed.com/viewjob?jk=abc")).source,
    ).toBe("Indeed");
  });

  it("leaves the source unset on an applicant-tracking host", () => {
    const html = page(jsonLd(jobPosting()));

    const job = extractJob(
      readPage(html, "https://acme.wd1.myworkdayjobs.com/careers/job/2"),
    );

    expect(job.source).toBeUndefined();
  });

  it("leaves the source unset on an employer's own careers page", () => {
    const html = page(jsonLd(jobPosting()));

    expect(
      extractJob(readPage(html, "https://careers.ibm.com/job/123")).source,
    ).toBeUndefined();
  });
});
