import { describe, expect, it } from "vitest";
import { extractJob } from "../src/extractor.js";
import { canonicalPostingUrl, readRulesFor, siteFor } from "../src/sites.js";
import { readSitePage } from "./fixtures.js";

/**
 * The three surfaces JobTrack Capture reads by name.
 *
 * The markup below is synthetic and minimal: the container, the attribute and
 * the nesting each read path depends on, and invented words inside them. No
 * real posting is reproduced here — a real one would be somebody else's
 * copyrighted text, and it would prove nothing a structure cannot.
 *
 * The assertions that matter most are again the negative ones. Manual testing
 * in real Chrome found the previous version storing "Welcome back" from Indeed
 * and "Search for Jobs" from Workday as job titles, so the tests that keep page
 * furniture out are the ones this file exists for.
 */

const LINKEDIN_JOB = "https://www.linkedin.com/jobs/view/4123456789/";
const LINKEDIN_SEARCH =
  "https://www.linkedin.com/jobs/search/?currentJobId=4123456789&keywords=intern";
/** The route that shows one posting while keeping the last one's markup. */
const LINKEDIN_SIMILAR =
  "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4457185005&referenceJobId=4449683666";
const INDEED_JOB = "https://ca.indeed.com/viewjob?jk=a1b2c3d4e5f6a7b8";
const WORKDAY_JOB =
  "https://kpmg.wd3.myworkdayjobs.com/en-US/External/job/Toronto/Senior-Consultant_12345";

describe("recognizing a site", () => {
  it("names the three surfaces it reads and nothing else", () => {
    expect(siteFor(LINKEDIN_JOB)).toBe("linkedin");
    expect(siteFor(INDEED_JOB)).toBe("indeed");
    expect(siteFor(WORKDAY_JOB)).toBe("workday");
    expect(siteFor("https://boards.greenhouse.io/acme/jobs/1")).toBeUndefined();
    expect(siteFor("https://careers.example.com/job/1")).toBeUndefined();
  });

  it("hands the collector nothing for a site it does not know", () => {
    expect(readRulesFor("https://careers.example.com/job/1")).toEqual({
      fields: [],
    });
  });

  it("gives LinkedIn a named strategy rather than a list of class names", () => {
    const rules = readRulesFor(LINKEDIN_JOB);

    expect(rules.strategy).toBe("linkedin-job-detail");
    expect(rules.fields).toEqual([]);
  });

  it("leaves Indeed and Workday on their selector tables", () => {
    expect(readRulesFor(INDEED_JOB).strategy).toBeUndefined();
    expect(readRulesFor(WORKDAY_JOB).strategy).toBeUndefined();
    expect(readRulesFor(WORKDAY_JOB).fields.length).toBeGreaterThan(0);
  });

  /**
   * LinkedIn's routes do not all behave alike, and the address says which is
   * which. Only the route that carries a reference job needs the stricter read.
   */
  it("keeps the verified LinkedIn routes on the read that works for them", () => {
    for (const url of [
      LINKEDIN_JOB,
      LINKEDIN_SEARCH,
      "https://www.linkedin.com/jobs/search-results/?currentJobId=4123456789",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4123456789",
    ]) {
      expect(readRulesFor(url).strategy).toBe("linkedin-job-detail");
    }
  });

  it("routes a page carrying a reference job to the stricter read", () => {
    for (const url of [
      LINKEDIN_SIMILAR,
      "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4457185005",
      "https://www.linkedin.com/jobs/search-results/?currentJobId=4457185005&referenceJobId=4449683666",
    ]) {
      expect(readRulesFor(url).strategy).toBe("linkedin-similar-jobs");
    }
  });

  it("passes the selected job's identity, never the reference job's", () => {
    const rules = readRulesFor(LINKEDIN_SIMILAR);

    expect(rules.jobId).toBe("4457185005");
    expect(JSON.stringify(rules)).not.toContain("4449683666");
  });
});

/**
 * LinkedIn, read the way the live page is actually built.
 *
 * The first version of this adapter used LinkedIn's older component class
 * names. Real-Chrome testing found that none of them match what LinkedIn
 * serves: company, title, location and description all came back blank. What
 * the live markup does expose is an `aria-label` of the form
 * `Company, <employer>.`, a `data-testid` on the description container, and —
 * for the title and the location — nothing at all except their position inside
 * the same card as the company. Every class name on those leaves is a
 * generated hash such as `_c753af09`, which is why the fixtures below carry
 * hashes too: a test that passed because of one would be worthless.
 *
 * So the title and the location are reached through the company, and the
 * fixtures exist mostly to prove what cannot reach them: a result-list card, a
 * recommended job, a hiring-insights upsell.
 */
describe("LinkedIn", () => {
  /** The top card as the live page builds it, with its hashed classes. */
  const topCard = `
    <div class="_c753af09">
      <div data-display-contents="true">
        <p class="_0508a270">Summer Intern: Spectroscopy and Nanoscale Materials</p>
      </div>
      <div class="_72963fa6" aria-label="Company, Northwind Photonics.">
        <a href="/company/northwind-photonics">Northwind Photonics</a>
      </div>
      <div data-display-contents="true">
        <p class="_a1b2c3d4"><span>Boise, ID</span><span> · 2 weeks ago · 40 applicants</span></p>
      </div>
      <button>Easy Apply</button>
    </div>`;

  const aboutTheJob = `
    <section>
      <h2>About the job</h2>
      <div><span data-testid="expandable-text-box">
        <p>You will run spectroscopy experiments.</p><ul><li>Optics</li></ul>
      </span></div>
    </section>`;

  /** The upsell that shares the description container's own test id. */
  const hiringInsights = `
    <section>
      <h2>Hiring insights</h2>
      <span data-testid="expandable-text-box">Unlock hiring insights on Northwind Photonics.</span>
    </section>`;

  /** The results rail beside the pane, and the rest of the page's furniture. */
  const resultsList = `
    <ul>
      <li class="_ff11aa22" aria-label="Company, Southgate Robotics.">
        <div data-display-contents="true"><p>Sales Development Representative</p></div>
        <p><span>Austin, TX</span></p>
      </li>
    </ul>`;

  const detail = (...parts: string[]) =>
    `<body><main><h1>Jobs</h1>${parts.join("")}</main></body>`;

  it("reads the selected posting from a job detail page", () => {
    const job = extractJob(
      readSitePage(detail(topCard, aboutTheJob), LINKEDIN_JOB),
    );

    expect(job.company).toBe("Northwind Photonics");
    expect(job.jobTitle).toBe(
      "Summer Intern: Spectroscopy and Nanoscale Materials",
    );
    expect(job.location).toBe("Boise, ID");
    expect(job.jobDescription).toBe(
      "You will run spectroscopy experiments.\nOptics",
    );
    expect(job.source).toBe("LinkedIn");
    expect(job.warnings).toEqual([]);
  });

  /**
   * LinkedIn is a single-page application: the student picks a job in the list
   * and the pane beside it changes without a navigation. The extension only
   * ever runs on an explicit click, so it reads whatever is selected at that
   * moment — and files it under that job's own address rather than under the
   * search page they happen to be standing on.
   */
  it("files a posting selected inside a search page under its own URL", () => {
    const job = extractJob(
      readSitePage(
        detail(resultsList, topCard, aboutTheJob),
        LINKEDIN_SEARCH,
      ),
    );

    expect(job.jobTitle).toBe(
      "Summer Intern: Spectroscopy and Nanoscale Materials",
    );
    expect(job.jobUrl).toBe("https://www.linkedin.com/jobs/view/4123456789/");
  });

  it("keeps the student's own LinkedIn host when rebuilding the URL", () => {
    expect(
      canonicalPostingUrl("https://ca.linkedin.com/jobs/view/4123456789/"),
    ).toBe("https://ca.linkedin.com/jobs/view/4123456789/");
  });

  it("refuses a search page's canonical link in favour of the selected job", () => {
    const html = `<head><link rel="canonical" href="https://www.linkedin.com/jobs/search/" /></head>${detail(
      topCard,
    )}`;

    expect(extractJob(readSitePage(html, LINKEDIN_SEARCH)).jobUrl).toBe(
      "https://www.linkedin.com/jobs/view/4123456789/",
    );
  });

  it("leaves everything blank when the detail pane is not there", () => {
    const html = detail('<div class="_ab12cd34">Recommended for you</div>');

    const job = extractJob(readSitePage(html, LINKEDIN_SEARCH));

    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
    // The source is the one thing the host settles on its own.
    expect(job.source).toBe("LinkedIn");
  });

  describe("the company, from the one attribute that names it", () => {
    const withLabel = (label: string, text = "") =>
      detail(
        `<div class="_11aa22bb" aria-label="${label}">${text}</div>${topCard.replace(
          'aria-label="Company, Northwind Photonics."',
          'data-was-the-company="true"',
        )}`,
      );

    it("reads the employer out of the aria-label", () => {
      const html = detail(
        '<div aria-label="Company, Micron Technology.">Micron Technology</div>',
      );

      expect(extractJob(readSitePage(html, LINKEDIN_JOB)).company).toBe(
        "Micron Technology",
      );
    });

    it("drops the punctuation the spoken label ends on", () => {
      expect(
        extractJob(readSitePage(withLabel("Company, Halden Optics."), LINKEDIN_JOB))
          .company,
      ).toBe("Halden Optics");
    });

    it("tolerates the whitespace around a label", () => {
      expect(
        extractJob(
          readSitePage(withLabel("  Company,   Halden Optics  "), LINKEDIN_JOB),
        ).company,
      ).toBe("Halden Optics");
    });

    it("prefers the rendered text to the spoken sentence", () => {
      const html = detail(
        '<div aria-label="Company, Halden Optics."><a href="/c/h">Halden Optics</a></div>',
      );

      expect(extractJob(readSitePage(html, LINKEDIN_JOB)).company).toBe(
        "Halden Optics",
      );
    });

    it("refuses a label that names no company at all", () => {
      for (const label of ["Company,", "Company, ", "Company,   ."]) {
        const job = extractJob(readSitePage(withLabel(label), LINKEDIN_JOB));

        expect(job.company).toBeUndefined();
      }
    });

    it("ignores every other labelled control on the page", () => {
      const html = detail(
        `<button aria-label="Save job">Save</button>
         <img alt="" aria-label="Company logo" />
         <button aria-label="Dismiss">×</button>`,
      );

      expect(extractJob(readSitePage(html, LINKEDIN_JOB)).company).toBeUndefined();
    });

    it("never takes the company from a result in the list beside the pane", () => {
      const job = extractJob(
        readSitePage(detail(resultsList), LINKEDIN_SEARCH),
      );

      expect(job.company).toBeUndefined();
      expect(job.jobTitle).toBeUndefined();
      expect(job.location).toBeUndefined();
    });
  });

  describe("the title and the location, reached only through the company", () => {
    it("takes them from the card the company belongs to, not the page", () => {
      const job = extractJob(
        readSitePage(detail(resultsList, topCard), LINKEDIN_SEARCH),
      );

      expect(job.jobTitle).toBe(
        "Summer Intern: Spectroscopy and Nanoscale Materials",
      );
      expect(job.location).toBe("Boise, ID");
    });

    it("leaves them blank when the card holds no title leaf", () => {
      const html = detail(
        `<div class="_c753af09">
           <div class="_72963fa6" aria-label="Company, Northwind Photonics.">Northwind Photonics</div>
           <p><span>Boise, ID</span></p>
         </div>`,
      );

      const job = extractJob(readSitePage(html, LINKEDIN_JOB));

      // The company is labelled, so it is known; nothing else is.
      expect(job.company).toBe("Northwind Photonics");
      expect(job.jobTitle).toBeUndefined();
      expect(job.location).toBeUndefined();
    });

    it("never reads a recommended job or a distractor beside the card", () => {
      const distractors = `
        <div data-display-contents="true"><p>Use AI to assess how you fit</p></div>
        <p><span>Remote — Anywhere</span></p>
        <ul><li><div data-display-contents="true"><p>Premium: see who viewed you</p></div></li></ul>`;

      const job = extractJob(
        readSitePage(detail(distractors, topCard), LINKEDIN_JOB),
      );

      expect(job.jobTitle).toBe(
        "Summer Intern: Spectroscopy and Nanoscale Materials",
      );
      expect(job.location).toBe("Boise, ID");
    });

    it("takes the location leading the metadata paragraph, not the whole line", () => {
      const job = extractJob(readSitePage(detail(topCard), LINKEDIN_JOB));

      expect(job.location).toBe("Boise, ID");
      expect(job.location).not.toContain("applicants");
    });
  });

  describe("the description, anchored to About the job", () => {
    /**
     * The regression this fixture exists for: more than one element on a live
     * LinkedIn page carries the description container's own test id, and one of
     * them is an upsell. Taking the first on the page would store an
     * advertisement as the student's saved posting.
     */
    it("refuses an unrelated expandable box that shares the test id", () => {
      const job = extractJob(
        readSitePage(
          detail(topCard, hiringInsights, aboutTheJob),
          LINKEDIN_JOB,
        ),
      );

      expect(job.jobDescription).toBe(
        "You will run spectroscopy experiments.\nOptics",
      );
      expect(job.jobDescription).not.toContain("Unlock hiring insights");
    });

    it("refuses the upsell even when it comes first in the document", () => {
      const job = extractJob(
        readSitePage(
          detail(hiringInsights, topCard, aboutTheJob),
          LINKEDIN_JOB,
        ),
      );

      expect(job.jobDescription).not.toContain("Unlock hiring insights");
    });

    it("stores no description at all when nothing says which box is the job", () => {
      const job = extractJob(
        readSitePage(detail(topCard, hiringInsights), LINKEDIN_JOB),
      );

      expect(job.jobDescription).toBeUndefined();
    });
  });
});

/**
 * LinkedIn's Similar Jobs route, where the labelled company belongs to the job
 * the student navigated away from.
 *
 * Real-Chrome testing found this filing an entirely different posting: the
 * screen showed one employer, title and city, and the extension stored the
 * previous one — because the page keeps the earlier posting's markup, including
 * a perfectly valid `aria-label="Company, …"` for it. The anchor is real. It is
 * simply the wrong job's, and no selector fixes that.
 *
 * What separates them is that the stale markup is not drawn. jsdom gives every
 * element zero geometry, so these tests stub `getBoundingClientRect` to model a
 * laid-out page — narrowly, here, rather than by weakening the production test.
 * Anything inside `data-rendered="false"` reports zero size, exactly as the
 * stale subtree does in Chrome.
 */
describe("LinkedIn Similar Jobs", () => {
  /** Lays the page out: drawn by default, zero-sized inside a stale subtree. */
  function withRenderedGeometry<T>(run: () => T): T {
    const original = Element.prototype.getBoundingClientRect;

    Element.prototype.getBoundingClientRect = function (this: Element) {
      const drawn = !this.closest('[data-rendered="false"]');
      const width = drawn ? 640 : 0;
      const height = drawn ? 32 : 0;

      return {
        width,
        height,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        toJSON: () => ({}),
      } as DOMRect;
    };

    try {
      return run();
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  }

  /** The posting the student came from, still in the document, undrawn. */
  const referenceJob = `
    <div class="_stale11" data-rendered="false">
      <div data-display-contents="true"><p>Operations Program Enablement Student</p></div>
      <div class="_stale22" aria-label="Company, Bird Construction.">
        <a href="/company/bird-construction">Bird Construction</a>
      </div>
      <div data-display-contents="true">
        <p><span>Calgary, AB</span><span> · 3 weeks ago</span></p>
      </div>
      <a href="/jobs/view/4449683666/">Apply</a>
      <section>
        <h2>About the job</h2>
        <span data-testid="expandable-text-box">Support the operations programs team.</span>
      </section>
    </div>`;

  /** The posting on screen. */
  const currentJob = (options: { label?: boolean; idAnchor?: boolean } = {}) => `
    <div class="_live11">
      <div data-display-contents="true"><p>Business Development Representative - Ottawa Region</p></div>
      <div class="_live22" ${
        options.label === false
          ? ""
          : 'aria-label="Company, Bondi Produce and Specialty Foods."'
      }>
        <a href="/company/bondi-produce">Bondi Produce and Specialty Foods</a>
      </div>
      <div data-display-contents="true">
        <p><span>Ottawa, ON</span><span> · 2 days ago · 12 applicants</span></p>
      </div>
      ${options.idAnchor === false ? "" : '<a href="/jobs/view/4457185005/">Easy Apply</a>'}
      <button>Save</button>
      <section>
        <h2>About the job</h2>
        <span data-testid="expandable-text-box">
          <p>Grow the Ottawa wholesale accounts.</p><ul><li>Cold calling</li></ul>
        </span>
      </section>
    </div>`;

  /** The rail the student picked the current posting out of. */
  const similarRail = `
    <ul>
      <li aria-label="Company, Southgate Robotics.">
        <div data-display-contents="true"><p>Warehouse Coordinator</p></div>
        <p><span>Mississauga, ON</span></p>
        <a href="/jobs/view/4457185005/">Business Development Representative - Ottawa Region</a>
      </li>
    </ul>`;

  /** Everything else LinkedIn puts on the page. */
  const distractors = `
    <section>
      <h2>Hiring insights</h2>
      <span data-testid="expandable-text-box">Unlock hiring insights with Premium.</span>
    </section>
    <div data-display-contents="true"><p>Use AI to assess how you fit</p></div>
    <div style="display: none">
      <div data-display-contents="true"><p>Business Development Representative - Ottawa Region</p></div>
      <div aria-label="Company, Bondi Produce and Specialty Foods.">Bondi Produce and Specialty Foods</div>
    </div>`;

  const page = (...parts: string[]) =>
    `<body><main><h1>Jobs</h1>${parts.join("")}</main></body>`;

  const capture = (html: string, url = LINKEDIN_SIMILAR) =>
    withRenderedGeometry(() => extractJob(readSitePage(html, url)));

  it("reads the posting on screen, not the one the page came from", () => {
    const job = capture(
      page(referenceJob, currentJob(), similarRail, distractors),
    );

    expect(job.company).toBe("Bondi Produce and Specialty Foods");
    expect(job.jobTitle).toBe(
      "Business Development Representative - Ottawa Region",
    );
    expect(job.location).toBe("Ottawa, ON");
    expect(job.jobDescription).toBe(
      "Grow the Ottawa wholesale accounts.\nCold calling",
    );
  });

  /** The exact failure, stated as the thing that must never happen again. */
  it("never lets the reference job reach the record by any field", () => {
    const job = capture(
      page(referenceJob, currentJob(), similarRail, distractors),
    );

    expect(JSON.stringify(job)).not.toContain("Bird Construction");
    expect(JSON.stringify(job)).not.toContain("Calgary");
    expect(JSON.stringify(job)).not.toContain("Operations Program Enablement");
    expect(job.jobDescription).not.toContain("operations programs team");
  });

  it("files the record under the selected job, never the reference job", () => {
    const job = capture(
      page(referenceJob, currentJob(), similarRail, distractors),
    );

    expect(job.jobUrl).toBe("https://www.linkedin.com/jobs/view/4457185005/");
    expect(job.source).toBe("LinkedIn");
  });

  it("resolves the pane from the About-the-job region with no id anchor", () => {
    const job = capture(
      page(referenceJob, currentJob({ idAnchor: false }), similarRail),
    );

    expect(job.company).toBe("Bondi Produce and Specialty Foods");
    expect(job.jobTitle).toBe(
      "Business Development Representative - Ottawa Region",
    );
    expect(job.location).toBe("Ottawa, ON");
  });

  it("names the employer from its company link when no label is drawn", () => {
    const job = capture(
      page(referenceJob, currentJob({ label: false }), similarRail),
    );

    expect(job.company).toBe("Bondi Produce and Specialty Foods");
  });

  it("ignores an undrawn duplicate of the posting it is already reading", () => {
    const job = capture(page(distractors, referenceJob, currentJob()));

    expect(job.company).toBe("Bondi Produce and Specialty Foods");
    expect(job.jobTitle).toBe(
      "Business Development Representative - Ottawa Region",
    );
  });

  it("takes nothing from the similar-jobs rail the student chose from", () => {
    const job = capture(page(referenceJob, currentJob(), similarRail));

    expect(job.company).not.toBe("Southgate Robotics");
    expect(job.location).not.toBe("Mississauga, ON");
    expect(job.jobTitle).not.toBe("Warehouse Coordinator");
  });

  it("refuses the Premium upsell sharing the description container's test id", () => {
    const job = capture(page(distractors, referenceJob, currentJob()));

    expect(job.jobDescription).not.toContain("Unlock hiring insights");
  });

  /**
   * The safety half. Nothing on this page connects the visible content to the
   * selected posting, and the reference job's markup is right there — so the
   * only correct answer is blanks, which the student can type over.
   */
  it("returns blanks rather than the reference job when nothing is drawn", () => {
    const job = capture(page(referenceJob, similarRail));

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
    // The address still knows which posting the student selected.
    expect(job.jobUrl).toBe("https://www.linkedin.com/jobs/view/4457185005/");
  });

  it("returns blanks when the page has no detail pane at all", () => {
    const job = capture(page(similarRail, distractors));

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
  });

  it("stays blank without the geometry that says what is on screen", () => {
    // No stub: every element reports zero size, as an undrawn page would.
    const job = extractJob(
      readSitePage(page(referenceJob, currentJob()), LINKEDIN_SIMILAR),
    );

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("Bird Construction");
  });

  it("keeps the selected job's URL even when the reference id comes first", () => {
    expect(
      canonicalPostingUrl(
        "https://www.linkedin.com/jobs/collections/similar-jobs/?referenceJobId=4449683666&currentJobId=4457185005",
      ),
    ).toBe("https://www.linkedin.com/jobs/view/4457185005/");
  });
});

describe("Indeed", () => {
  it("reads the employer, title, location and description", () => {
    const html = `<body>
       <h1>Welcome back</h1>
       <h2 data-testid="jobsearch-JobInfoHeader-title">Marketing Co-op<span> - job post</span></h2>
       <div data-testid="inlineHeader-companyName">Bright Harbour Media</div>
       <div data-testid="inlineHeader-companyLocation">Ottawa, ON</div>
       <div id="jobDescriptionText"><p>Support the campaigns team.</p></div>
     </body>`;

    const job = extractJob(readSitePage(html, INDEED_JOB));

    expect(job.company).toBe("Bright Harbour Media");
    expect(job.jobTitle).toBe("Marketing Co-op");
    expect(job.location).toBe("Ottawa, ON");
    expect(job.jobDescription).toBe("Support the campaigns team.");
    expect(job.source).toBe("Indeed");
  });

  /**
   * The failure that made this adapter necessary. A signed-in Indeed page
   * greets the student in its first heading, and the old generic fallback
   * stored that greeting as the job title.
   */
  it("never lets the page's own greeting become a job title", () => {
    for (const heading of [
      "Welcome back",
      "Jobs for you",
      "Job search",
      "Sign in",
    ]) {
      const html = `<body><h1>${heading}</h1><a href="/apply">Apply now</a></body>`;

      const job = extractJob(readSitePage(html, INDEED_JOB));

      expect(job.jobTitle).toBeUndefined();
      expect(job.company).toBeUndefined();
    }
  });

  it("files a job selected from a results list under its own URL", () => {
    const html = `<body>
       <h2 data-testid="jobsearch-JobInfoHeader-title">Marketing Co-op</h2>
     </body>`;

    const job = extractJob(
      readSitePage(html, "https://ca.indeed.com/jobs?q=intern&vjk=a1b2c3d4e5f6a7b8"),
    );

    expect(job.jobUrl).toBe("https://ca.indeed.com/viewjob?jk=a1b2c3d4e5f6a7b8");
  });
});

describe("Workday", () => {
  const posting = `<body>
     <h1>Search for Jobs</h1>
     <h2 data-automation-id="jobPostingHeader">Senior Consultant, Internship</h2>
     <div data-automation-id="locations"><dl><dt>locations</dt><dd>Toronto, Ontario</dd></dl></div>
     <div data-automation-id="jobPostingDescription"><p>Join the consulting practice.</p></div>
   </body>`;

  it("reads the selected posting rather than the page around it", () => {
    const job = extractJob(readSitePage(posting, WORKDAY_JOB));

    expect(job.jobTitle).toBe("Senior Consultant, Internship");
    expect(job.location).toBe("Toronto, Ontario");
    expect(job.jobDescription).toBe("Join the consulting practice.");
  });

  /**
   * Workday is an applicant-tracking system, not a place a student found a job,
   * and its tenant hostname names whoever bought Workday rather than an
   * employer's own site. Both stay empty.
   */
  it("never names Workday as the source or the employer's domain", () => {
    const job = extractJob(readSitePage(posting, WORKDAY_JOB));

    expect(job.source).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  it("leaves the employer empty when the posting does not establish it", () => {
    const job = extractJob(readSitePage(posting, WORKDAY_JOB));

    expect(job.company).toBeUndefined();
    expect(job.warnings).toContain("missing_company");
  });

  it("stores nothing at all from a Workday search page", () => {
    const html = `<body><h1>Search for Jobs</h1><input type="submit" value="Search" /></body>`;

    const job = extractJob(readSitePage(html, "https://kpmg.wd3.myworkdayjobs.com/External"));

    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });
});
