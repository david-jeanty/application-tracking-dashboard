import { describe, expect, it } from "vitest";
import {
  extractJobReport,
  extractionDiagnostics,
  toExtractedJob,
} from "../src/extractor.js";
import {
  extractDuration,
  extractWorkArrangement,
  extractWorkTerm,
} from "../src/rich-fields.js";
import type { ExtractionReport } from "../src/types.js";
import { jobPosting, jsonLd, page, readPage, readSitePage } from "./fixtures.js";

/**
 * Rich capture: work arrangement, work term, and duration.
 *
 * These three fields are the easiest in JobTrack to fill in plausibly and
 * wrongly, so most of what is asserted below is refusal. A city is not an
 * arrangement, "flexible working environment" is not Hybrid, a season with no
 * year is not a term, and a two-week training period is not how long the job
 * lasts. Every one of those has a sentence on a real posting that looks like an
 * answer, and a student who asked to save one job has no reason to doubt what
 * the extension filled in for them.
 */

const LINKEDIN_SEARCH =
  "https://www.linkedin.com/jobs/search/?currentJobId=4123456789&keywords=intern";
const WORKDAY_JOB =
  "https://kpmg.wd3.myworkdayjobs.com/en-US/External/job/Toronto/Senior-Consultant_12345";

/** A structured posting, varied by the one field each test is about. */
function structured(overrides: Record<string, unknown>) {
  return readPage(page(jsonLd(jobPosting(overrides))));
}

describe("work arrangement", () => {
  it("reads an arrangement the posting states in its own field", () => {
    for (const [stated, expected] of [
      ["Work arrangement: Remote", "Remote"],
      ["Work arrangement: Hybrid", "Hybrid"],
      ["Work setting: On-site", "On-site"],
      ["Workplace type: Onsite", "On-site"],
      ["Work model: remote", "Remote"],
    ] as const) {
      const report = extractJobReport(
        structured({ description: `${stated}\nYou will join the team.` }),
      );

      expect(toExtractedJob(report).workArrangement).toBe(expected);
      expect(report.fields.workArrangement).toMatchObject({
        state: "established",
        confidence: "exact",
        source: "json_ld_job_posting",
      });
    }
  });

  it("maps the one standardized structured remote signal", () => {
    const report = extractJobReport(structured({ jobLocationType: "TELECOMMUTE" }));

    expect(toExtractedJob(report).workArrangement).toBe("Remote");
    expect(report.fields.workArrangement).toMatchObject({
      state: "established",
      confidence: "exact",
      source: "json_ld_job_posting",
    });
  });

  it("reads the same structured signal from microdata", () => {
    const html = `<head></head><body>
       <div itemscope itemtype="https://schema.org/JobPosting">
         <h1 itemprop="title">Systems Engineering Intern</h1>
         <meta itemprop="jobLocationType" content="TELECOMMUTE" />
         <div itemprop="description"><p>Work on avionics test benches.</p></div>
       </div>
     </body>`;

    const report = extractJobReport(
      readPage(html, "https://careers.beaconaerospace.com/job/48213"),
    );

    expect(toExtractedJob(report).workArrangement).toBe("Remote");
    expect(report.fields.workArrangement).toMatchObject({
      source: "microdata_job_posting",
    });
  });

  it("takes an arrangement the title states as its own", () => {
    const bracketed = extractJobReport(
      structured({ title: "Analytics Intern (Hybrid)" }),
    );
    const suffixed = extractJobReport(
      structured({ title: "Analytics Intern — Remote" }),
    );

    expect(toExtractedJob(bracketed).workArrangement).toBe("Hybrid");
    expect(bracketed.fields.workArrangement).toMatchObject({
      confidence: "strong",
      source: "json_ld_job_posting",
    });
    expect(toExtractedJob(suffixed).workArrangement).toBe("Remote");
  });

  it("infers nothing from vague flexibility language", () => {
    for (const description of [
      "We offer a flexible working environment.",
      "You may work remotely on Fridays.",
      "Hybrid work is common across our teams, and some roles are remote.",
      "Remote sensing experience is an asset.",
    ]) {
      const report = extractJobReport(structured({ description }));

      expect(toExtractedJob(report).workArrangement).toBeUndefined();
      expect(report.fields.workArrangement.state).toBe("absent");
    }
  });

  it("infers nothing from an office location", () => {
    const report = extractJobReport(
      structured({
        description: "Must be able to commute to our Toronto office.",
      }),
    );

    expect(toExtractedJob(report).workArrangement).toBeUndefined();
    expect(toExtractedJob(report).location).toBe("Ottawa, ON");
  });

  it("refuses two explicit arrangements that disagree", () => {
    const withinThePosting = extractJobReport(
      structured({
        title: "Analytics Intern (Hybrid)",
        description: "Work arrangement: Remote",
      }),
    );
    const againstStructuredData = extractJobReport(
      structured({
        jobLocationType: "TELECOMMUTE",
        description: "Work arrangement: Hybrid",
      }),
    );

    for (const report of [withinThePosting, againstStructuredData]) {
      expect(toExtractedJob(report).workArrangement).toBeUndefined();
      expect(report.fields.workArrangement).toMatchObject({
        state: "ambiguous",
        confidence: "ambiguous",
        reason: "conflicting_evidence",
      });
    }
  });

  it("keeps Workday's stale structured arrangement out of the selected posting", () => {
    const html = `<head>${jsonLd(
      jobPosting({
        title: "Stale backend title",
        description: "Work arrangement: Remote",
        jobLocationType: "TELECOMMUTE",
      }),
    )}</head><body>
       <div data-automation-id="jobPostingPage">
         <h2 data-automation-id="jobPostingHeader">Senior Consultant, Internship</h2>
         <div data-automation-id="jobPostingDescription"><p>Work arrangement: Hybrid</p></div>
       </div>
     </body>`;

    const report = extractJobReport(readSitePage(html, WORKDAY_JOB));

    expect(toExtractedJob(report).workArrangement).toBe("Hybrid");
    expect(report.fields.workArrangement).toMatchObject({
      state: "established",
      source: "workday_selected_posting",
      rejected: [
        {
          source: "json_ld_job_posting",
          reason: "workday_structured_data_untrusted",
        },
      ],
    });
  });
});

describe("work term", () => {
  it("reads a term the title names", () => {
    for (const [title, expected] of [
      ["Summer 2027 Internship", "Summer 2027"],
      ["Fall 2026 Co-op, Data Analytics", "Fall 2026"],
      ["Winter 2027 Student, Finance", "Winter 2027"],
      ["Spring 2027 Marketing Intern", "Spring 2027"],
    ] as const) {
      const report = extractJobReport(structured({ title }));

      expect(toExtractedJob(report).workTerm).toBe(expected);
      expect(report.fields.workTerm).toMatchObject({
        state: "established",
        confidence: "strong",
        source: "json_ld_job_posting",
      });
    }
  });

  it("reads a term the posting labels, and calls that exact", () => {
    const report = extractJobReport(
      structured({ description: "Work term: Summer 2027\nApply early." }),
    );

    expect(toExtractedJob(report).workTerm).toBe("Summer 2027");
    expect(report.fields.workTerm).toMatchObject({ confidence: "exact" });
  });

  it("normalizes casing without rewriting the words", () => {
    expect(
      toExtractedJob(extractJobReport(structured({ title: "SUMMER 2027 INTERNSHIP" })))
        .workTerm,
    ).toBe("Summer 2027");
    expect(
      toExtractedJob(extractJobReport(structured({ title: "fall 2026 co-op" })))
        .workTerm,
    ).toBe("Fall 2026");
  });

  it("refuses a season with no year, and a season buried in prose", () => {
    for (const overrides of [
      { title: "Summer Internship, Analytics" },
      { description: "Our summer events are a highlight of the year." },
      { description: "Fall is our busiest season for client work." },
    ]) {
      const report = extractJobReport(structured(overrides));

      expect(toExtractedJob(report).workTerm).toBeUndefined();
      expect(report.fields.workTerm.state).toBe("absent");
    }
  });

  it("refuses two terms rather than picking the first", () => {
    for (const title of [
      "Summer/Fall 2027 opportunities",
      "Summer 2027 Intern, with possible extension into Fall 2027",
      "Winter 2027 or Summer 2027 Co-op",
    ]) {
      const report = extractJobReport(structured({ title }));

      expect(toExtractedJob(report).workTerm).toBeUndefined();
      expect(report.fields.workTerm).toMatchObject({
        state: "ambiguous",
        reason: "conflicting_evidence",
      });
    }
  });

  it("refuses a term the title and the description disagree about", () => {
    const report = extractJobReport(
      structured({
        title: "Fall 2026 Co-op",
        description: "Work term: Summer 2027",
      }),
    );

    expect(toExtractedJob(report).workTerm).toBeUndefined();
  });

  it("never builds a term out of a deadline, a posting date, or today", () => {
    const report = extractJobReport(
      structured({
        title: "Analytics Intern",
        validThrough: "2026-11-30",
        datePosted: "2026-08-01",
        description:
          "Applications close on 30 November 2026. The role starts in May.",
      }),
    );

    expect(toExtractedJob(report).deadline).toBe("2026-11-30");
    expect(toExtractedJob(report).workTerm).toBeUndefined();
  });

  it("reads the term of the selected LinkedIn posting, not a neighbour's", () => {
    const selected = `
      <div class="_c753af09">
        <div data-display-contents="true"><p class="_0508a270">Summer 2027 Marketing Intern</p></div>
        <div class="_72963fa6" aria-label="Company, Northwind Photonics.">
          <a href="/company/northwind-photonics">Northwind Photonics</a>
        </div>
        <div data-display-contents="true"><p class="_a1b2c3d4"><span>Boise, ID</span></p></div>
      </div>`;
    const about = `
      <section><h2>About the job</h2>
        <div><span data-testid="expandable-text-box"><p>You will support campaigns.</p></span></div>
      </section>`;
    const rail = `
      <ul>
        <li data-occludable-job-id="4470000002" aria-label="Company, Southgate Robotics.">
          <div data-display-contents="true"><p>Fall 2026 Co-op, 8-month term</p></div>
          <a href="/jobs/view/4470000002/">Fall 2026 Co-op</a>
        </li>
      </ul>`;

    const report = extractJobReport(
      readSitePage(
        `<body><main><h1>Jobs</h1>
           <section aria-label="Primary content">${selected}${about}${rail}</section>
         </main></body>`,
        LINKEDIN_SEARCH,
      ),
    );

    expect(toExtractedJob(report).workTerm).toBe("Summer 2027");
    expect(report.fields.workTerm).toMatchObject({
      source: "linkedin_selected_posting",
    });
    expect(toExtractedJob(report).duration).toBeUndefined();
  });
});

describe("duration", () => {
  it("reads a length the posting labels", () => {
    for (const [description, expected] of [
      ["Duration: 4 months", "4 months"],
      ["Term length: 8 months", "8 months"],
      ["Work term duration is 12 months", "12 months"],
      ["Length of term: 16 weeks", "16 weeks"],
    ] as const) {
      const report = extractJobReport(structured({ description }));

      expect(toExtractedJob(report).duration).toBe(expected);
      expect(report.fields.duration).toMatchObject({ confidence: "exact" });
    }
  });

  it("reads a length stated against the job itself", () => {
    for (const [description, expected] of [
      ["This is an 8-month co-op based in Ottawa.", "8 months"],
      ["A 16-week internship on the platform team.", "16 weeks"],
      ["We are hiring for a 4 month work term.", "4 months"],
      ["A 1-month placement over the winter break.", "1 month"],
    ] as const) {
      const report = extractJobReport(structured({ description }));

      expect(toExtractedJob(report).duration).toBe(expected);
      expect(report.fields.duration).toMatchObject({ confidence: "strong" });
    }
  });

  it("reads a length the title states", () => {
    const report = extractJobReport(
      structured({ title: "4-Month Co-op Student, Finance" }),
    );

    expect(toExtractedJob(report).duration).toBe("4 months");
    expect(report.fields.duration).toMatchObject({
      confidence: "strong",
      source: "json_ld_job_posting",
    });
  });

  it("refuses a length that belongs to something other than the job", () => {
    for (const description of [
      "The role begins with a 2-week training period.",
      "There is a 3-month probation period.",
      "Requires 5 years of experience with Python.",
      "Reports are published every 6 months.",
      "Our 2 week onboarding is fully paid.",
    ]) {
      const report = extractJobReport(structured({ description }));

      expect(toExtractedJob(report).duration).toBeUndefined();
      expect(report.fields.duration.state).toBe("absent");
    }
  });

  it("refuses two lengths that disagree", () => {
    const report = extractJobReport(
      structured({
        description: "A 4-month internship. Duration: 8 months.",
      }),
    );

    expect(toExtractedJob(report).duration).toBeUndefined();
    expect(report.fields.duration).toMatchObject({
      state: "ambiguous",
      reason: "conflicting_evidence",
    });
  });

  it("never subtracts an end date from a start date", () => {
    const report = extractJobReport(
      structured({
        description:
          "Start date: 2027-05-03. End date: 2027-08-27. Interviews run in January.",
        validThrough: "2027-01-15",
      }),
    );

    expect(toExtractedJob(report).duration).toBeUndefined();
  });

  it("keeps weeks as weeks and months as months", () => {
    expect(extractDuration({ description: "Duration: 16 weeks" })).toMatchObject({
      value: "16 weeks",
    });
    expect(extractDuration({ description: "Duration: 4 months" })).toMatchObject({
      value: "4 months",
    });
  });
});

describe("the rich helpers on their own", () => {
  it("returns nothing rather than a guess when nothing was stated", () => {
    expect(extractWorkArrangement({})).toEqual({ state: "absent" });
    expect(extractWorkTerm({})).toEqual({ state: "absent" });
    expect(extractDuration({})).toEqual({ state: "absent" });
  });

  it("names the bounded field each fact was read out of", () => {
    expect(extractWorkArrangement({ jobLocationType: "TELECOMMUTE" })).toMatchObject(
      { origin: "structured", confidence: "exact" },
    );
    expect(extractWorkTerm({ title: "Summer 2027 Intern" })).toMatchObject({
      origin: "title",
      confidence: "strong",
    });
    expect(
      extractDuration({ description: "Term length: 8 months" }),
    ).toMatchObject({ origin: "description", confidence: "exact" });
  });
});

describe("the rich fields' evidence", () => {
  it("gives every established rich field a real source and confidence", () => {
    const report = extractJobReport(
      structured({
        title: "Summer 2027 Co-op Student",
        description: "Work arrangement: Hybrid\nDuration: 4 months",
      }),
    );

    for (const field of [
      report.fields.workArrangement,
      report.fields.workTerm,
      report.fields.duration,
    ]) {
      expect(field.state).toBe("established");
      if (field.state !== "established") continue;
      expect(["exact", "strong"]).toContain(field.confidence);
      expect(field.source).toBe("json_ld_job_posting");
    }

    const job = toExtractedJob(report);
    expect(job.workArrangement).toBe("Hybrid");
    expect(job.workTerm).toBe("Summer 2027");
    expect(job.duration).toBe("4 months");
  });

  it("never projects a rich value from an ambiguous field", () => {
    const report = extractJobReport(structured({}));
    const malformed = {
      ...report,
      fields: {
        ...report.fields,
        // Intentionally violates the type contract to test the runtime boundary.
        workArrangement: {
          state: "ambiguous",
          confidence: "ambiguous",
          source: "json_ld_job_posting",
          reason: "conflicting_evidence",
          value: "Remote",
        },
        workTerm: {
          state: "ambiguous",
          confidence: "ambiguous",
          source: "json_ld_job_posting",
          reason: "conflicting_evidence",
          value: "Summer 2027",
        },
        duration: {
          state: "ambiguous",
          confidence: "ambiguous",
          source: "json_ld_job_posting",
          reason: "conflicting_evidence",
          value: "4 months",
        },
      },
    } as unknown as ExtractionReport;

    const job = toExtractedJob(malformed);

    expect(job.workArrangement).toBeUndefined();
    expect(job.workTerm).toBeUndefined();
    expect(job.duration).toBeUndefined();
  });

  it("keeps the matched posting text out of the diagnostics", () => {
    const description =
      "Work arrangement: Hybrid. Duration: 4 months. Contact recruiting@example.com.";
    const report = extractJobReport(
      structured({ title: "Summer 2027 Co-op Student", description }),
    );

    const diagnostics = extractionDiagnostics(report);
    const serialized = JSON.stringify(diagnostics);

    expect(diagnostics.fields.workArrangement).toEqual({
      state: "established",
      confidence: "exact",
      source: "json_ld_job_posting",
    });
    expect(diagnostics.fields.workTerm.state).toBe("established");
    expect(diagnostics.fields.duration.state).toBe("established");
    expect(serialized).not.toContain(description);
    expect(serialized).not.toContain("Hybrid");
    expect(serialized).not.toContain("Summer 2027");
    expect(serialized).not.toContain("4 months");
    expect(serialized).not.toContain("recruiting@example.com");
  });

  it("cannot project a Workday rich fact that only stale structured data states", () => {
    const html = `<head>${jsonLd(
      jobPosting({
        title: "Stale Summer 2027 backend title",
        description: "Duration: 8 months",
        jobLocationType: "TELECOMMUTE",
      }),
    )}</head><body>
       <div data-automation-id="jobPostingPage">
         <h2 data-automation-id="jobPostingHeader">Senior Consultant, Internship</h2>
         <div data-automation-id="jobPostingDescription"><p>Join the consulting practice.</p></div>
       </div>
     </body>`;

    const report = extractJobReport(readSitePage(html, WORKDAY_JOB));
    const job = toExtractedJob(report);

    expect(job.jobTitle).toBe("Senior Consultant, Internship");
    expect(job.workArrangement).toBeUndefined();
    expect(job.workTerm).toBeUndefined();
    expect(job.duration).toBeUndefined();

    for (const field of [
      report.fields.workArrangement,
      report.fields.workTerm,
      report.fields.duration,
    ]) {
      expect(field).toMatchObject({
        state: "ambiguous",
        source: "json_ld_job_posting",
        reason: "workday_structured_data_untrusted",
      });
    }
  });
});
