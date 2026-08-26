import { describe, expect, it } from "vitest";
import { extractJob, DESCRIPTION_LIMIT } from "../src/extractor.js";
import { jobPosting, jsonLd, page, rawJsonLd, readPage } from "./fixtures.js";

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
    const job = extractJob(readPage(page(jsonLd(jobPosting()))));

    expect(job.company).toBe("IBM");
    expect(job.jobTitle).toBe("Business Technology Analyst Intern");
    expect(job.location).toBe("Ottawa, ON");
    expect(job.jobDescription).toContain("analytics team");
    expect(job.warnings).toEqual([]);
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
    const html = page(rawJsonLd("<<<"), "<h1>Analytics Intern</h1>");

    const job = extractJob(readPage(html));

    expect(job.warnings).toContain("no_job_posting_found");
    expect(job.jobTitle).toBe("Analytics Intern");
    expect(job.company).toBeUndefined();
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
});

describe("the employer's domain", () => {
  it("uses an explicit hiringOrganization URL", () => {
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

    const job = extractJob(readPage(html));

    expect(job.jobTitle).toBe("Finance Co-op Student");
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
  it("reads a valid validThrough as a date-only deadline", () => {
    const html = page(
      jsonLd(jobPosting({ validThrough: "2026-11-30T23:59:59Z" })),
    );

    expect(extractJob(readPage(html)).deadline).toBe("2026-11-30");
  });

  it("ignores a validThrough that is not a real date", () => {
    const html = page(jsonLd(jobPosting({ validThrough: "2026-02-31" })));

    expect(extractJob(readPage(html)).deadline).toBeUndefined();
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
    expect(job.jobTitle).toBe("Five ways to write a résumé");
  });

  it("drops a trailing site name the page declared itself", () => {
    const html = page(
      '<meta property="og:site_name" content="IBM Careers" />' +
        '<meta property="og:title" content="Business Technology Analyst Intern | IBM Careers" />',
      "<div>no heading</div>",
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
