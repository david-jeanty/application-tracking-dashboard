import { describe, expect, it } from "vitest";
import { buildCaptureRecord } from "../src/capture.js";
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
import {
  applyControl,
  jobPosting,
  jsonLd,
  page,
  readPage,
  readSitePage,
} from "./fixtures.js";

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
const WORKDAY_SEARCH = "https://kpmg.wd3.myworkdayjobs.com/en-US/External";

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

/**
 * LinkedIn states the arrangement beside the location of the card its address
 * names — `Toronto, Ontario, Canada (Hybrid)`. The collector was already
 * removing that suffix to normalize the location and discarding it; it is now
 * kept as its own bounded fact about the selected posting. Nothing about which
 * posting is selected, or how the location is normalized, changed.
 */
describe("the arrangement a LinkedIn selected posting states", () => {
  /** The selected card as the live `/preload/` document builds one. */
  const card = (
    jobId: string,
    title: string,
    company: string,
    location: string,
    pill = "",
  ) => `<article data-job-id="${jobId}">
      <div>
        <div><div><div><div>
          <a href="/jobs/view/${jobId}/" aria-label="${title} with verification">
            <span>${title}</span><span>${title}</span>
          </a>
        </div></div></div></div>
        <div><span>${company}</span></div>
        <div><ul><li><span>${location}</span></li></ul></div>
        ${pill ? `<div><ul><li>${pill}</li><li>Internship</li></ul></div>` : ""}
      </div>
    </article>`;

  const selectedIn = (jobId: string) =>
    `https://www.linkedin.com/jobs/search/?currentJobId=${jobId}`;

  it("keeps the normalized location and establishes the arrangement", () => {
    for (const [stated, expected] of [
      ["Toronto, Ontario, Canada (Hybrid)", "Hybrid"],
      ["Toronto, Ontario, Canada (Remote)", "Remote"],
      ["Toronto, Ontario, Canada (On-site)", "On-site"],
    ] as const) {
      const report = extractJobReport(
        readSitePage(
          `<head></head><body>${card("4446257399", "Analyst Intern", "Northwind", stated)}</body>`,
          selectedIn("4446257399"),
        ),
      );
      const job = toExtractedJob(report);

      expect(job.location).toBe("Toronto, Ontario, Canada");
      expect(job.workArrangement).toBe(expected);
      expect(report.fields.workArrangement).toMatchObject({
        state: "established",
        confidence: "exact",
        source: "linkedin_selected_posting",
      });
      expect(report.fields.location).toMatchObject({
        state: "established",
        source: "linkedin_selected_posting",
      });
    }
  });

  it("establishes no arrangement from a location that states none", () => {
    const report = extractJobReport(
      readSitePage(
        `<head></head><body>${card("4446257399", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada")}</body>`,
        selectedIn("4446257399"),
      ),
    );

    expect(toExtractedJob(report).location).toBe("Toronto, Ontario, Canada");
    expect(toExtractedJob(report).workArrangement).toBeUndefined();
    expect(report.fields.workArrangement.state).toBe("absent");
  });

  it("takes the arrangement of the selected posting, not a neighbour's", () => {
    const html = `<head></head><body>
       ${card("4446257399", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada (Hybrid)")}
       ${card("4470000002", "Warehouse Coordinator", "Southgate Robotics", "Mississauga, ON (Remote)")}
     </body>`;

    const selected = toExtractedJob(
      extractJobReport(readSitePage(html, selectedIn("4446257399"))),
    );
    const theOtherOne = toExtractedJob(
      extractJobReport(readSitePage(html, selectedIn("4470000002"))),
    );

    expect(selected.company).toBe("Northwind");
    expect(selected.workArrangement).toBe("Hybrid");
    expect(theOtherOne.company).toBe("Southgate Robotics");
    expect(theOtherOne.workArrangement).toBe("Remote");
  });

  it("establishes the arrangement the selected card states on its own", () => {
    for (const [pill, expected] of [
      ["Hybrid", "Hybrid"],
      ["Remote", "Remote"],
      ["On-site", "On-site"],
    ] as const) {
      const report = extractJobReport(
        readSitePage(
          `<head></head><body>${card("4446257399", "Analyst Intern", "Northwind", "Greater Toronto Area, Canada", pill)}</body>`,
          selectedIn("4446257399"),
        ),
      );

      expect(toExtractedJob(report).workArrangement).toBe(expected);
      expect(toExtractedJob(report).location).toBe("Greater Toronto Area, Canada");
      expect(report.fields.workArrangement).toMatchObject({
        state: "established",
        confidence: "exact",
        source: "linkedin_selected_posting",
      });
    }
  });

  it("refuses a card that states two arrangements, rather than picking one", () => {
    const report = extractJobReport(
      readSitePage(
        `<head></head><body>${card("4446257399", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada (Hybrid)", "Remote")}</body>`,
        selectedIn("4446257399"),
      ),
    );

    expect(toExtractedJob(report).workArrangement).toBeUndefined();
    expect(report.fields.workArrangement).toMatchObject({
      state: "ambiguous",
      confidence: "ambiguous",
      source: "linkedin_selected_posting",
      reason: "conflicting_evidence",
    });
  });

  it("refuses a Similar Jobs reference posting's arrangement", () => {
    // The address names the selected posting; the document also holds the one
    // the student came from. Only the selected card may state this fact.
    const report = extractJobReport(
      readSitePage(
        `<head></head><body>
           ${card("4443429701", "Solutions Consultant", "Exacare AI", "Remote — Canada (Remote)")}
           ${card("4446257399", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada (Hybrid)")}
         </body>`,
        "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4446257399&referenceJobId=4443429701",
      ),
    );

    expect(toExtractedJob(report).company).toBe("Northwind");
    expect(toExtractedJob(report).workArrangement).toBe("Hybrid");
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

/**
 * The term formats live Canadian student postings actually use.
 *
 * `Summer 2027` was the only shape PR #30 recognized, and real Chrome testing
 * found three postings stating their term perfectly plainly in shapes it did
 * not read: `Winter Intern 2027` in a title, `Internship (Jan-April '27)` in a
 * title, `The Co-op term is from January to August, 2027` in a description.
 *
 * What is added is recognition, not inference. A month range stays a month
 * range — it is never mapped onto a university season, and its length is never
 * counted — and a range in prose is still not a term, because a description
 * states real date ranges for training, for benefits, and for when applications
 * close, every one of which reads exactly like the sentence that is the answer.
 */
describe("the term formats a title states", () => {
  it("reads a season and a year an employment word stands between", () => {
    for (const [title, expected] of [
      ["Winter Intern 2027", "Winter 2027"],
      ["Winter Internship 2027", "Winter 2027"],
      ["Winter Co-op 2027", "Winter 2027"],
      ["Winter CoOp 2027", "Winter 2027"],
      ["Winter Co op 2027", "Winter 2027"],
      ["Summer Student 2027", "Summer 2027"],
      ["Fall Work Term 2026", "Fall 2026"],
      ["2027 Winter Intern", "Winter 2027"],
      ["2027 Winter Internship", "Winter 2027"],
      ["2027 Winter Co-op", "Winter 2027"],
      ["2027 Winter CoOp", "Winter 2027"],
      ["2026 Fall Student, Data Analytics", "Fall 2026"],
    ] as const) {
      expect(extractWorkTerm({ title })).toMatchObject({
        state: "established",
        value: expected,
        confidence: "strong",
        origin: "title",
      });
    }
  });

  it("refuses a season and a year that only share a sentence", () => {
    for (const title of [
      "Winter recruiting events for our 2027 strategy",
      "Winter opportunities across our 2027 portfolio",
      "Winter and beyond: our 2027 hiring plans",
      "Available during the winter",
      "Summer Internship, Analytics",
    ]) {
      expect(extractWorkTerm({ title }).state).toBe("absent");
    }
  });

  it("reads a term the title states in parentheses beside the job word", () => {
    for (const [title, expected] of [
      [
        "Management Consulting OTTAWA: Consultant, Internship (Jan-April '27)",
        "January-April 2027",
      ],
      ["Consultant, Internship (Jan-April 2027)", "January-April 2027"],
      ["Marketing Co-op (January to August 2027)", "January-August 2027"],
      ["Finance Student [May-August 2027]", "May-August 2027"],
    ] as const) {
      expect(extractWorkTerm({ title })).toMatchObject({
        state: "established",
        value: expected,
        confidence: "strong",
        origin: "title",
      });
    }
  });

  it("refuses a parenthetical that is not a term, and a term with no job word", () => {
    for (const title of [
      "Consultant, Internship (Hybrid)",
      "Consultant, Internship (Ottawa)",
      "Consultant, Internship (2027)",
      "Client offsite (January to April 2027)",
    ]) {
      expect(extractWorkTerm({ title }).state).toBe("absent");
    }
  });
});

describe("the term formats a description labels", () => {
  it("reads a month range the posting calls the term", () => {
    for (const [description, expected] of [
      ["Work term: Jan-April '27", "January-April 2027"],
      ["Co-op term: January-April 2027", "January-April 2027"],
      ["Internship term: January to April 2027", "January-April 2027"],
      ["The Co-op term is from January to August, 2027.", "January-August 2027"],
      ["Term is from January 2027 to April 2027.", "January-April 2027"],
      ["The work term runs from January through April 2027.", "January-April 2027"],
      ["The internship runs from January to April 2027.", "January-April 2027"],
      ["The co-op is scheduled for from May to August 2027.", "May-August 2027"],
    ] as const) {
      expect(extractWorkTerm({ description })).toMatchObject({
        state: "established",
        value: expected,
        confidence: "exact",
        origin: "description",
      });
    }
  });

  it("keeps both years of a term that crosses one", () => {
    expect(
      extractWorkTerm({
        description: "Work term: September 2026 to April 2027",
      }),
    ).toMatchObject({ value: "September 2026-April 2027" });
  });

  it("refuses every date range in a description that is not the term", () => {
    for (const description of [
      "Applications close in January 2027.",
      "Training runs from January to April 2027.",
      "Benefits enrollment period is January to April 2027.",
      "The office is open from January to August 2027.",
      "Our client engagement spans January to April 2027.",
      "Possible extension into Fall 2027.",
      "Winter recruiting events for our 2027 strategy.",
      "Available during the winter.",
      "January 2027",
      "2027",
      "Please note that the internship/coop is for a 4-month term.",
    ]) {
      expect(extractWorkTerm({ description }).state).toBe("absent");
    }
  });

  it("refuses two month ranges that disagree", () => {
    expect(
      extractWorkTerm({
        title: "Consultant, Internship (Jan-April '27)",
        description: "Co-op term: January to August 2027.",
      }),
    ).toMatchObject({ state: "conflict" });

    expect(
      extractWorkTerm({
        title: "Winter Intern 2027",
        description: "Work term: Summer 2027",
      }),
    ).toMatchObject({ state: "conflict" });
  });

  it("never counts a month range into a duration", () => {
    expect(
      extractDuration({
        description: "The Co-op term is from January to August, 2027.",
      }).state,
    ).toBe("absent");
    expect(
      extractDuration({ title: "Consultant, Internship (Jan-April '27)" }).state,
    ).toBe("absent");
  });
});

/**
 * The three live postings this follow-up exists for.
 *
 * Each is the real title and the real stated term, over the minimum markup the
 * live card actually uses. None carries a copied job description: what is
 * asserted is the sentence that states the fact, which is all the parser reads.
 *
 * Passing these is not the acceptance test. The acceptance test is opening the
 * same three postings in Chrome, because a fixture proves the parser and only
 * the live page proves the selector.
 */
describe("the three live postings that failed in Chrome", () => {
  const linkedInPosting = (
    jobId: string,
    title: string,
    company: string,
    location: string,
    pill: string,
    description = "",
  ) => `<head></head><body>
      <article data-job-id="${jobId}">
        <div>
          <div><div><div><div>
            <a href="/jobs/view/${jobId}/" aria-label="${title} with verification">
              <span>${title}</span><span>${title}</span>
            </a>
          </div></div></div></div>
          <div><span>${company}</span></div>
          <div><ul><li><span>${location}</span></li></ul></div>
          <div><ul><li>${pill}</li><li>Internship</li></ul></div>
        </div>
      </article>
      ${description ? `<section id="job-details"><h2>About the job</h2><p>${description}</p></section>` : ""}
    </body>`;

  const captured = (html: string, jobId: string) =>
    toExtractedJob(
      extractJobReport(
        readSitePage(
          html,
          `https://www.linkedin.com/jobs/search/?currentJobId=${jobId}`,
        ),
      ),
    );

  it("captures Mackenzie's Hybrid arrangement and its Winter 2027 term", () => {
    const job = captured(
      linkedInPosting(
        "4459045300",
        "Winter Intern 2027 - Value Delivery Office",
        "Mackenzie Investments",
        "Greater Toronto Area, Canada",
        "Hybrid",
      ),
      "4459045300",
    );

    expect(job.company).toBe("Mackenzie Investments");
    expect(job.jobTitle).toBe("Winter Intern 2027 - Value Delivery Office");
    expect(job.location).toBe("Greater Toronto Area, Canada");
    expect(job.workArrangement).toBe("Hybrid");
    expect(job.workTerm).toBe("Winter 2027");
    expect(job.duration).toBeUndefined();
  });

  it("captures KPMG's On-site arrangement, its 4-month length and its term", () => {
    const job = captured(
      linkedInPosting(
        "4459045301",
        "Management Consulting OTTAWA: Consultant, Internship (Jan-April '27)",
        "KPMG Canada",
        "Ottawa, ON",
        "On-site",
        "Please note that the internship/coop is for a 4-month term. The placement is starting in January 2027 to April 2027.",
      ),
      "4459045301",
    );

    expect(job.company).toBe("KPMG Canada");
    expect(job.location).toBe("Ottawa, ON");
    expect(job.workArrangement).toBe("On-site");
    expect(job.duration).toBe("4 months");
    expect(job.workTerm).toBe("January-April 2027");
  });

  it("captures J&J's Hybrid arrangement and its January-August 2027 term", () => {
    const job = captured(
      linkedInPosting(
        "4459045302",
        "Marketing Co-Op",
        "Johnson & Johnson MedTech",
        "Toronto, ON",
        "Hybrid",
        "The Co-op term is from January to August, 2027.",
      ),
      "4459045302",
    );

    expect(job.company).toBe("Johnson & Johnson MedTech");
    expect(job.workArrangement).toBe("Hybrid");
    expect(job.workTerm).toBe("January-August 2027");
    // Eight months is arithmetic the posting never did, so the field stays blank.
    expect(job.duration).toBeUndefined();
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

  it("refuses a length whose label measures something other than the term", () => {
    // Each of these states a real duration of a real thing, and none of them is
    // how long the job lasts. The word `duration` is in every one.
    for (const description of [
      "Training duration: 2 weeks.",
      "Probation duration is 3 months.",
      "The warranty duration is 6 months.",
      "Onboarding duration: 1 week.",
      "Notice period duration: 2 weeks.",
    ]) {
      const report = extractJobReport(structured({ description }));

      expect(toExtractedJob(report).duration).toBeUndefined();
      expect(report.fields.duration.state).toBe("absent");
    }
  });

  it("still reads every label that names the term's own length", () => {
    for (const [description, expected] of [
      ["Duration: 4 months", "4 months"],
      ["Duration is 4 months", "4 months"],
      ["Work term duration: 4 months", "4 months"],
      ["Term duration: 4 months", "4 months"],
      ["Term length: 16 weeks", "16 weeks"],
      ["Length of the work term: 8 months", "8 months"],
      ["Internship duration: 4 months", "4 months"],
      ["Co-op duration: 4 months", "4 months"],
      ["Contract duration: 6 months", "6 months"],
      ["About the role.\nDuration: 4 months", "4 months"],
      ["About the role.\n- Duration: 4 months", "4 months"],
    ] as const) {
      const report = extractJobReport(structured({ description }));

      expect(toExtractedJob(report).duration).toBe(expected);
      expect(report.fields.duration).toMatchObject({ confidence: "exact" });
    }
  });

  it("refuses a length attached to bare `intern` rather than to the job", () => {
    const report = extractJobReport(
      structured({ description: "Our 2-week intern orientation is paid." }),
    );

    expect(toExtractedJob(report).duration).toBeUndefined();
    expect(report.fields.duration.state).toBe("absent");

    // The nouns that do name the job keep working.
    for (const [description, expected] of [
      ["A 4-month internship on the platform team.", "4 months"],
      ["An 8-month co-op based in Ottawa.", "8 months"],
      ["A 16-week internship starting in May.", "16 weeks"],
    ] as const) {
      expect(
        toExtractedJob(extractJobReport(structured({ description }))).duration,
      ).toBe(expected);
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

  it("clamps a rich fact to the evidence of the field it was read out of", () => {
    // Page metadata describes the page rather than the job, so the description
    // it yields is only strong. `Work arrangement: Hybrid` is an exact
    // statement, but a fact derived from a strong field cannot outrank it.
    const report = extractJobReport(
      readPage(
        page(
          '<meta property="og:description" content="Work arrangement: Hybrid. Duration: 4 months. Work term: Summer 2027." />',
          `<h1>Analytics Intern</h1>${applyControl()}`,
        ),
        "https://careers.example.com/job/analytics-intern-48213",
      ),
    );

    expect(report.fields.jobDescription).toMatchObject({
      state: "established",
      confidence: "strong",
      source: "generic_metadata",
    });

    for (const field of [
      report.fields.workArrangement,
      report.fields.workTerm,
      report.fields.duration,
    ]) {
      expect(field).toMatchObject({
        state: "established",
        confidence: "strong",
        source: "generic_metadata",
      });
    }

    // The clamp is about evidence, not about capture: the values are unchanged.
    const job = toExtractedJob(report);
    expect(job.workArrangement).toBe("Hybrid");
    expect(job.workTerm).toBe("Summer 2027");
    expect(job.duration).toBe("4 months");
  });

  it("projects no rich field from a Workday search page that selected nothing", () => {
    // PR #28's rule, applied to the three new fields: Workday can retain a
    // backend posting after the student has navigated back to the results
    // list, and a search state establishes no selected posting to attach it to.
    const html = `<head>${jsonLd(
      jobPosting({
        title: "Stale Summer 2027 backend title",
        description: "Work arrangement: Remote\nDuration: 8 months",
        jobLocationType: "TELECOMMUTE",
      }),
    )}</head><body>
       <section data-automation-id="jobResults">
         <ul><li><a href="/job/Toronto/Analyst_54321">Analyst, Advisory</a></li></ul>
       </section>
     </body>`;

    const report = extractJobReport(readSitePage(html, WORKDAY_SEARCH));
    const job = toExtractedJob(report);

    expect(job.jobTitle).toBeUndefined();
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

  it("carries an established rich fact all the way onto the record", () => {
    // extractJobReport -> toExtractedJob -> buildCaptureRecord, on the wire
    // name the record contract uses. The three hops are the whole test.
    const report = extractJobReport(
      readSitePage(
        `<head></head><body><article data-job-id="4446257399">
           <div>
             <div><div><div><div>
               <a href="/jobs/view/4446257399/" aria-label="Analyst Intern with verification">
                 <span>Analyst Intern</span><span>Analyst Intern</span>
               </a>
             </div></div></div></div>
             <div><span>Northwind</span></div>
             <div><ul><li><span>Toronto, Ontario, Canada (Hybrid)</span></li></ul></div>
           </div>
         </article></body>`,
        "https://www.linkedin.com/jobs/search/?currentJobId=4446257399",
      ),
    );

    const job = toExtractedJob(report);
    const record = buildCaptureRecord(job, {
      company: "Northwind",
      jobTitle: "Analyst Intern",
      location: "Toronto, Ontario, Canada",
      status: "Interested",
    });

    expect(job.workArrangement).toBe("Hybrid");
    expect(record.work_arrangement).toBe("Hybrid");
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
