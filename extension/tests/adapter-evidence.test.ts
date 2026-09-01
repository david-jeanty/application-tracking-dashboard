import { describe, expect, it } from "vitest";
import {
  CAPTURE_ADAPTERS,
  collectAdapterEvidence,
  selectCaptureAdapter,
  type CaptureAdapter,
  type CaptureAdapterResult,
} from "../src/adapters.js";
import { buildCaptureRecord } from "../src/capture.js";
import { projectEvidence, type FieldEvidence } from "../src/evidence.js";
import {
  extractJob,
  extractJobReport,
  extractionDiagnostics,
} from "../src/extractor.js";
import { correlateObservedPosting } from "../src/identity.js";
import {
  isPageSignals,
  type ObservedPostingField,
  type PageSignals,
} from "../src/types.js";
import { readSitePage } from "./fixtures.js";

const JOB_A = "111";
const JOB_B = "222";
const LINKEDIN_B = `https://www.linkedin.com/jobs/view/${JOB_B}/`;

function observation(
  field: ObservedPostingField,
  ...jobIds: string[]
) {
  return { field, jobIds };
}

function linkedInSignals(
  overrides: Partial<PageSignals> = {},
): PageSignals {
  return {
    jsonLdBlocks: [],
    meta: {},
    pageUrl: LINKEDIN_B,
    siteFields: {
      company: "Northwind",
      title: "Analyst Intern",
      location: "Toronto, ON",
      description: "Support the selected team.",
    },
    observedPosting: {
      fields: [
        observation("company", JOB_B),
        observation("title", JOB_B),
        observation("location", JOB_B),
        observation("description", JOB_B),
      ],
    },
    ...overrides,
  };
}

function blankResult(adapter: CaptureAdapterResult["adapter"]): CaptureAdapterResult {
  return {
    adapter,
    fields: {},
    rejected: {},
    postingIdentity: { support: "unsupported", observed: "unsupported" },
    admitsSelectedLinks: true,
    evidence: [],
  };
}

describe("the deterministic capture-adapter registry", () => {
  it.each([
    [LINKEDIN_B, "linkedin_identity_aware"],
    ["https://ca.indeed.com/viewjob?jk=abc", "legacy_site_fields"],
    ["https://acme.wd5.myworkdayjobs.com/job/one", "legacy_site_fields"],
    [
      "https://boards.greenhouse.io/acme/jobs/1",
      "greenhouse_identity_aware",
    ],
    ["https://jobs.lever.co/acme/1", "generic_page"],
    ["https://jobs.smartrecruiters.com/Acme/1", "generic_page"],
    ["https://careers.example.com/jobs/1", "generic_page"],
  ] as const)("selects %s as %s", (pageUrl, expected) => {
    const signals = linkedInSignals({ pageUrl, siteFields: undefined });
    expect(selectCaptureAdapter(signals).id).toBe(expected);
  });

  it("takes the first declared match even when a later adapter also matches", () => {
    const first: CaptureAdapter = {
      id: "legacy_site_fields",
      matches: () => true,
      collect: () => blankResult("legacy_site_fields"),
    };
    const second: CaptureAdapter = {
      id: "generic_page",
      matches: () => true,
      collect: () => blankResult("generic_page"),
    };

    expect(selectCaptureAdapter(linkedInSignals(), [first, second])).toBe(first);
  });

  it("keeps the fallback last and every registered id unique", () => {
    expect(CAPTURE_ADAPTERS.at(-1)?.id).toBe("generic_page");
    expect(new Set(CAPTURE_ADAPTERS.map((adapter) => adapter.id)).size).toBe(
      CAPTURE_ADAPTERS.length,
    );
  });

  it("reports page-local identity as unsupported on Workday", () => {
    const result = collectAdapterEvidence({
      jsonLdBlocks: [],
      meta: {},
      pageUrl: "https://acme.wd5.myworkdayjobs.com/job/one",
      siteFields: { title: "Analyst Intern" },
    });
    expect(result.postingIdentity).toEqual({
      support: "unsupported",
      observed: "unsupported",
    });
  });
});

describe("posting identity observed at an evidence root", () => {
  it.each([
    [[JOB_B], JOB_B, "verified"],
    [[JOB_A], JOB_B, "mismatched"],
    [[], JOB_B, "unobserved"],
    [[JOB_A, JOB_B], JOB_B, "ambiguous"],
    [[JOB_B], undefined, "unobserved"],
  ] as const)("correlates %j against %s as %s", (seen, route, expected) => {
    expect(correlateObservedPosting(seen, route)).toBe(expected);
  });

  it("projects every field whose own root names the route posting", () => {
    const result = collectAdapterEvidence(linkedInSignals());
    expect(result.fields).toEqual({
      company: "Northwind",
      jobTitle: "Analyst Intern",
      location: "Toronto, ON",
      jobDescription: "Support the selected team.",
    });
    expect(result.postingIdentity).toEqual({
      support: "supported",
      observed: "verified",
    });
  });

  it("rejects every mismatched field before the ExtractedJob projection", () => {
    const fields = ["company", "title", "location", "description"] as const;
    const signals = linkedInSignals({
      observedPosting: {
        fields: fields.map((field) => observation(field, JOB_A)),
      },
    });
    const report = extractJobReport(signals);
    const job = extractJob(signals);

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(report.fields.company).toMatchObject({
      state: "ambiguous",
      reason: "posting_identity_mismatch",
    });
    expect(report.postingIdentity.observed).toBe("mismatched");
  });

  it("rejects fields whose roots name no posting", () => {
    const signals = linkedInSignals({
      observedPosting: {
        fields: [
          observation("company"),
          observation("title"),
          observation("location"),
          observation("description"),
        ],
      },
    });
    const report = extractJobReport(signals);

    expect(extractJob(signals)).toMatchObject({
      jobUrl: LINKEDIN_B,
      source: "LinkedIn",
    });
    expect(extractJob(signals).company).toBeUndefined();
    expect(report.fields.company).toMatchObject({
      reason: "posting_identity_unobserved",
    });
    expect(extractionDiagnostics(report).postingIdentity.observed).toBe(
      "unobserved",
    );
  });

  it("rejects all contributing fields when their roots name two postings", () => {
    const signals = linkedInSignals({
      observedPosting: {
        fields: [
          observation("company", JOB_B),
          observation("title", JOB_A),
          observation("location", JOB_B),
          observation("description", JOB_A),
        ],
      },
    });
    const result = collectAdapterEvidence(signals);

    expect(result.fields).toEqual({});
    expect(result.postingIdentity.observed).toBe("ambiguous");
    expect(new Set(Object.values(result.rejected))).toEqual(
      new Set(["posting_identity_ambiguous"]),
    );
  });

  it("does not let one matching id verify another id in the same field", () => {
    const result = collectAdapterEvidence(
      linkedInSignals({
        siteFields: { company: "Wrong Company" },
        observedPosting: {
          fields: [observation("company", JOB_A), observation("company", JOB_B)],
        },
      }),
    );
    expect(result.fields.company).toBeUndefined();
    expect(result.rejected.company).toBe("posting_identity_ambiguous");
  });

  it("does not let a verified root lend authority to an unobserved root", () => {
    const result = collectAdapterEvidence(
      linkedInSignals({
        siteFields: { company: "Unattributed Company" },
        observedPosting: {
          fields: [observation("company", JOB_B), observation("company")],
        },
      }),
    );
    expect(result.fields.company).toBeUndefined();
    expect(result.rejected.company).toBe("posting_identity_unobserved");
  });

  it("ignores a route id observed for evidence that supplied no candidate", () => {
    const result = collectAdapterEvidence(
      linkedInSignals({
        siteFields: { company: "Job A Company" },
        observedPosting: {
          fields: [
            observation("company", JOB_A),
            // No selectedLinks exist, so this observation contributed no value.
            observation("selectedLinks", JOB_B),
          ],
        },
      }),
    );
    expect(result.fields.company).toBeUndefined();
    expect(result.rejected.company).toBe("posting_identity_mismatch");
  });

  it("keeps the selected posting's canonical URL even when fields are refused", () => {
    const job = extractJob(
      linkedInSignals({
        observedPosting: {
          fields: [
            observation("company", JOB_A),
            observation("title", JOB_A),
            observation("location", JOB_A),
            observation("description", JOB_A),
          ],
        },
      }),
    );
    expect(job.jobUrl).toBe(LINKEDIN_B);
  });

  it("does not revive refused LinkedIn DOM through generic metadata", () => {
    const job = extractJob(
      linkedInSignals({
        headingText: "Job A Heading",
        documentTitle: "Job A Document",
        meta: { "og:title": "Job A Metadata" },
        observedPosting: {
          fields: [observation("company", JOB_A), observation("title", JOB_A)],
        },
      }),
    );
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("Job A");
  });

  it("does not revive refused DOM through identity-less structured data", () => {
    const job = extractJob(
      linkedInSignals({
        jsonLdBlocks: [
          JSON.stringify({
            "@context": "https://schema.org",
            "@type": "JobPosting",
            title: "Job A Structured",
            hiringOrganization: { name: "Job A Company" },
          }),
        ],
        observedPosting: {
          fields: [observation("company", JOB_A), observation("title", JOB_A)],
        },
      }),
    );
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("Job A");
  });
});

describe("central evidence projection", () => {
  it("cannot project a rejected value", () => {
    const evidence: FieldEvidence[] = [
      {
        field: "company",
        value: "Wrong Company",
        method: "site_dom",
        identity: "mismatched",
        decision: "rejected",
        reason: "posting_identity_mismatch",
      },
    ];
    expect(projectEvidence(evidence)).toEqual({
      values: {},
      rejected: { company: "posting_identity_mismatch" },
    });
  });

  it("keeps compatibility evidence accepted while reporting identity unsupported", () => {
    const result = collectAdapterEvidence({
      jsonLdBlocks: [],
      meta: {},
      pageUrl: "https://ca.indeed.com/viewjob?jk=abc",
      siteFields: { title: "Analyst Intern - job post", company: "Northwind" },
    });
    expect(result.fields).toMatchObject({
      company: "Northwind",
      jobTitle: "Analyst Intern",
    });
    expect(result.postingIdentity).toEqual({
      support: "unsupported",
      observed: "unsupported",
    });
  });

  it("can project a future company-domain evidence field without a new boundary", () => {
    expect(
      projectEvidence([
        {
          field: "companyDomain",
          value: "northwind.example",
          method: "site_dom",
          identity: "verified",
          decision: "accepted",
        },
      ]).values.companyDomain,
    ).toBe("northwind.example");
  });
});

describe("observed-posting message validation", () => {
  it("accepts the closed, bounded attribution shape", () => {
    expect(isPageSignals(linkedInSignals())).toBe(true);
  });

  it("rejects an unknown attribution field", () => {
    const candidate = linkedInSignals() as unknown as Record<string, unknown>;
    candidate.observedPosting = {
      fields: [{ field: "employerLogo", jobIds: [JOB_B] }],
    };
    expect(isPageSignals(candidate)).toBe(false);
  });

  it("rejects malformed or unbounded job-id observations", () => {
    for (const jobIds of [
      ["not an id"],
      Array.from({ length: 9 }, (_, index) => String(index + 1)),
    ]) {
      const candidate = linkedInSignals() as unknown as Record<string, unknown>;
      candidate.observedPosting = {
        fields: [{ field: "company", jobIds }],
      };
      expect(isPageSignals(candidate)).toBe(false);
    }
  });
});

describe("selected links and company-domain safety", () => {
  const selectedLinks = {
    descriptionUrls: ["https://careers.northwind.example/jobs/222"],
  };

  function withLinks(...ids: string[]): PageSignals {
    return linkedInSignals({
      siteFields: {},
      selectedLinks,
      observedPosting: {
        fields: [observation("selectedLinks", ...ids)],
      },
    });
  }

  it("admits links only when their own root names the route posting", () => {
    const result = collectAdapterEvidence(withLinks(JOB_B));
    expect(result.admitsSelectedLinks).toBe(true);
    expect(extractJob(withLinks(JOB_B)).companyDomain).toBe(
      "northwind.example",
    );
  });

  it.each([
    ["mismatched", [JOB_A], "posting_identity_mismatch"],
    ["unobserved", [], "posting_identity_unobserved"],
    ["ambiguous", [JOB_A, JOB_B], "posting_identity_ambiguous"],
  ] as const)("refuses %s selected links", (_label, ids, reason) => {
    const signals = withLinks(...ids);
    const result = collectAdapterEvidence(signals);
    const report = extractJobReport(signals);
    const extracted = extractJob(signals);

    expect(result.admitsSelectedLinks).toBe(false);
    expect(extracted.companyDomain).toBeUndefined();
    expect(report.fields.companyDomain).toMatchObject({ reason });
    expect(
      buildCaptureRecord(extracted, {
        company: "Manual Company",
        jobTitle: "Manual Title",
        status: "Interested",
      }),
    ).not.toHaveProperty("company_domain");
  });

  it("rejects all links when one contributing link root is unobserved", () => {
    const signals = linkedInSignals({
      siteFields: {},
      selectedLinks,
      observedPosting: {
        fields: [observation("selectedLinks", JOB_B), observation("selectedLinks")],
      },
    });
    expect(collectAdapterEvidence(signals).admitsSelectedLinks).toBe(false);
    expect(extractJob(signals).companyDomain).toBeUndefined();
  });

  it.each([
    "https://www.linkedin.com/jobs/view/222",
    "https://acme.wd5.myworkdayjobs.com/job/222",
    "https://boards.greenhouse.io/acme/jobs/222",
  ])("never turns the posting platform %s into the employer domain", (url) => {
    const signals = linkedInSignals({
      siteFields: {},
      selectedLinks: { descriptionUrls: [url] },
      observedPosting: {
        fields: [observation("selectedLinks", JOB_B)],
      },
    });
    expect(extractJob(signals).companyDomain).toBeUndefined();
  });
});

describe("collector same-root attribution", () => {
  const topCard = (jobIdAttribute = "") => `
    <div ${jobIdAttribute}>
      <div data-display-contents="true"><p>Analyst Intern</p></div>
      <div aria-label="Company, Northwind.">Northwind</div>
      <p><span>Toronto, ON</span></p>
    </div>`;

  it("records each collected value with the id on its own root", () => {
    const signals = readSitePage(
      `<body><main data-job-id="${JOB_B}">${topCard()}
        <section><h2>About the job</h2>
          <div data-testid="expandable-text-box">Selected description.</div>
        </section>
      </main></body>`,
      LINKEDIN_B,
    );
    expect(signals.observedPosting?.fields).toEqual(
      expect.arrayContaining([
        observation("company", JOB_B),
        observation("title", JOB_B),
        observation("location", JOB_B),
        observation("description", JOB_B),
      ]),
    );
  });

  it("does not use a matching id elsewhere in the document", () => {
    const signals = readSitePage(
      `<body><aside data-job-id="${JOB_B}">Unrelated result</aside>
        <main>${topCard()}</main>
      </body>`,
      LINKEDIN_B,
    );
    expect(
      signals.observedPosting?.fields.find((entry) => entry.field === "company"),
    ).toEqual(observation("company"));
    expect(extractJob(signals).company).toBeUndefined();
  });

  it("makes mixed selected roots ambiguous even when one root matches", () => {
    const signals = readSitePage(
      `<body><main>
        ${topCard(`data-job-id="${JOB_B}"`)}
        <section data-job-id="${JOB_A}"><h2>About the job</h2>
          <div data-testid="expandable-text-box">Job A marker.</div>
        </section>
      </main></body>`,
      LINKEDIN_B,
    );
    const result = collectAdapterEvidence(signals);
    expect(result.postingIdentity.observed).toBe("ambiguous");
    expect(result.fields).toEqual({});
    expect(JSON.stringify(extractJob(signals))).not.toContain("Job A marker");
  });
});
