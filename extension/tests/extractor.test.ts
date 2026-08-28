import { describe, expect, it } from "vitest";
import { extractCurrentPage } from "../src/extractor.js";
import {
  ARRAY_POSTING,
  CLEAN_POSTING,
  GRAPH_POSTING,
  posting,
  TYPE_ARRAY_POSTING,
} from "./fixtures/extractor.js";

function page(body: string, url = "https://jobs.example.test/opening/123") {
  const document = new DOMParser().parseFromString(
    `<!doctype html><html><head><title></title></head><body>${body}</body></html>`,
    "text/html",
  );
  return extractCurrentPage(document, url);
}

describe("JobPosting JSON-LD extraction", () => {
  it("extracts a clean single JobPosting object", () => {
    expect(page(CLEAN_POSTING)).toMatchObject({
      jobPostingFound: true,
      method: "json_ld",
      record: {
        company: "IBM",
        job_title: "Business Technology Analyst Intern",
        location: "Ottawa, ON",
        job_description: "Build useful systems with a small team.",
      },
    });
  });

  it("finds a JobPosting in a JSON-LD array", () => {
    expect(page(ARRAY_POSTING).record).toMatchObject({
      company: "Nokia",
      job_title: "Data Intern",
    });
  });

  it("finds a JobPosting in @graph", () => {
    expect(page(GRAPH_POSTING).record).toMatchObject({
      company: "Figma",
      job_title: "Design Intern",
    });
  });

  it("considers several JSON-LD script tags and prefers the richer posting", () => {
    const result = page(
      `${posting({ title: "Intern" })}${posting({
        title: "Software Intern",
        hiringOrganization: { name: "Shopify" },
        description: "Build commerce tools.",
      })}`,
    );
    expect(result.record).toMatchObject({
      company: "Shopify",
      job_title: "Software Intern",
      job_description: "Build commerce tools.",
    });
  });

  it("ignores malformed JSON without crashing", () => {
    const result = page(
      '<script type="application/ld+json">{"@type":"JobPosting",</script><h1>Visible heading</h1>',
    );
    expect(result.jobPostingFound).toBe(false);
    expect(result.record.job_title).toBe("Visible heading");
  });

  it("accepts an @type array containing JobPosting", () => {
    expect(page(TYPE_ARRAY_POSTING).record).toMatchObject({
      company: "RBC",
      job_title: "Finance Intern",
    });
  });

  it("turns an HTML description into safe, separated plain text", () => {
    const result = page(
      posting({
        title: "Research Intern",
        hiringOrganization: { name: "Acme" },
        description:
          "<p>First paragraph.</p><ul><li>One</li><li>Two</li></ul><script>steal()</script><style>.x{}</style>",
      }),
    );
    expect(result.record.job_description).toBe(
      "First paragraph.\n• One\n• Two",
    );
    expect(result.record.job_description).not.toContain("steal");
  });

  it("keeps an explicit employer website as the company domain", () => {
    const result = page(
      posting({
        title: "Marketing Intern",
        hiringOrganization: { name: "Nokia", url: "https://www.nokia.com/careers" },
      }),
    );
    expect(result.record.company_domain).toBe("nokia.com");
  });

  it("does not keep an ATS-hosted organization URL as an employer domain", () => {
    const result = page(
      posting({
        title: "Analyst",
        hiringOrganization: {
          name: "Acme",
          url: "https://acme.wd5.myworkdayjobs.com/jobs",
        },
      }),
      "https://acme.wd5.myworkdayjobs.com/job/123",
    );
    expect(result.record.company_domain).toBeUndefined();
  });

  it("leaves a missing location unknown", () => {
    const result = page(posting({ title: "Intern", hiringOrganization: { name: "Acme" } }));
    expect(result.record).not.toHaveProperty("location");
  });

  it("leaves a missing title unknown when metadata has none", () => {
    const result = page(posting({ hiringOrganization: { name: "Acme" } }));
    expect(result.record).not.toHaveProperty("job_title");
  });

  it("leaves a missing employer unknown", () => {
    const result = page(posting({ title: "Intern" }));
    expect(result.record).not.toHaveProperty("company");
  });

  it("keeps a valid date from validThrough", () => {
    const result = page(posting({ validThrough: "2026-09-30T23:59:59-04:00" }));
    expect(result.record.deadline).toBe("2026-09-30");
  });

  it("formats a structured salary without filling missing values", () => {
    const result = page(
      posting({
        salaryCurrency: "CAD",
        baseSalary: {
          "@type": "MonetaryAmount",
          value: {
            "@type": "QuantitativeValue",
            minValue: 22,
            maxValue: 28,
            unitText: "HOUR",
          },
        },
      }),
    );
    expect(result.record.salary).toBe("CAD 22–28 per hour");
  });
});

describe("conservative fallbacks and limits", () => {
  it("marks a non-job webpage as unconfirmed and does not invent an employer", () => {
    const result = page('<meta property="og:title" content="About our team"><h1>About</h1>');
    expect(result.jobPostingFound).toBe(false);
    expect(result.record.job_title).toBe("About our team");
    expect(result.record.company).toBeUndefined();
  });

  it("prefers and resolves the canonical URL", () => {
    const result = page(
      '<link rel="canonical" href="/careers/intern"><h1>Intern</h1>',
      "https://company.example.test/jobs?ref=board",
    );
    expect(result.record.job_url).toBe("https://company.example.test/careers/intern");
  });

  it("uses the current posting URL when no canonical URL exists", () => {
    const result = page("<h1>Intern</h1>", "https://jobs.example.test/opening/456");
    expect(result.record.job_url).toBe("https://jobs.example.test/opening/456");
  });

  it("omits an oversized description and reports the degraded state", () => {
    const result = page(
      posting({
        title: "Intern",
        hiringOrganization: { name: "Acme" },
        description: `A${"x".repeat(50_000)}`,
      }),
    );
    expect(result.record.job_description).toBeUndefined();
    expect(result.warnings).toEqual(["description_oversized"]);
  });

  it("sets source only for an unambiguous discovery platform", () => {
    expect(page(CLEAN_POSTING, "https://www.linkedin.com/jobs/view/1").record.source).toBe(
      "LinkedIn",
    );
    expect(page(CLEAN_POSTING, "https://ca.indeed.com/viewjob?jk=1").record.source).toBe(
      "Indeed",
    );
    expect(page(CLEAN_POSTING).record.source).toBeUndefined();
  });
});
