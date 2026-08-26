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
/**
 * The route where the previous posting's markup outlives the transition.
 *
 * Live evidence: starting on a Microsoft posting and clicking a similar job
 * left the address naming the newly selected job in `currentJobId` and the
 * Microsoft one in `referenceJobId`, while Microsoft's DOM stayed in the page.
 */
const SELECTED_JOB = "4451682967";
const PREVIOUS_JOB = "4459178947";
const LINKEDIN_SIMILAR = `https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=${SELECTED_JOB}&originToLandingJobPostings=${SELECTED_JOB}&referenceJobId=${PREVIOUS_JOB}`;
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

  it("carries the job the student selected, never the one they came from", () => {
    const rules = readRulesFor(LINKEDIN_SIMILAR);

    expect(rules.strategy).toBe("linkedin-similar-jobs");
    expect(rules.jobId).toBe(SELECTED_JOB);
  });

  /**
   * `currentJobId` is the parameter LinkedIn rewrites when the student picks a
   * different posting, so it names the job they selected — on every route.
   */
  it("files a Similar Jobs capture under currentJobId", () => {
    expect(canonicalPostingUrl(LINKEDIN_SIMILAR)).toBe(
      `https://www.linkedin.com/jobs/view/${SELECTED_JOB}/`,
    );
    expect(canonicalPostingUrl(LINKEDIN_SIMILAR)).not.toContain(PREVIOUS_JOB);
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
 * LinkedIn's Similar Jobs route, where the previous posting's markup lingers.
 *
 * The failure, as it happened: a student captured a Microsoft posting from
 * `/jobs/view/4459178947/` correctly, clicked a similar job, and watched the
 * screen change to a different employer — while Capture went on returning
 * Microsoft. The address had moved to `currentJobId=4451682967`, but Microsoft's
 * rendered-once DOM was still in the document, and the read took the first
 * labelled company it found.
 *
 * Two earlier theories died here and the fixtures below keep both dead. Naming
 * the stale job in `referenceJobId` does not make it avoidable by parameter —
 * that only says which posting the student came from. And `JobDetails_*_<id>`
 * component ids are no better: they go stale across the same transition, which
 * is why the stale block below carries a perfectly well-formed set of them.
 *
 * What separates the two postings is that only one is drawn. jsdom lays nothing
 * out, so these tests stub `getBoundingClientRect` to model a laid-out page —
 * narrowly, here, rather than by weakening the production check. Anything
 * inside `data-stale="true"` measures zero, exactly as the departed posting
 * does in Chrome.
 */
describe("LinkedIn Similar Jobs", () => {
  /** Lays the page out: drawn by default, zero-sized inside a stale subtree. */
  function withRenderedGeometry<T>(run: () => T): T {
    const original = Element.prototype.getBoundingClientRect;

    Element.prototype.getBoundingClientRect = function (this: Element) {
      const drawn = !this.closest('[data-stale="true"]');
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

  /**
   * One posting's detail surface, as the live route builds it.
   *
   * `stale` only changes whether it is drawn — the markup, the component ids
   * and the labels are identical either way, because in Chrome they are.
   */
  const detailSurface = ({
    jobId,
    company,
    title,
    location,
    description,
    stale = false,
  }: {
    jobId: string;
    company: string;
    title: string;
    location: string;
    description: string;
    stale?: boolean;
  }) => `
    <div class="_c753af09"${stale ? ' data-stale="true"' : ""}>
      <div id="JobDetails_ManageJobBanner_${jobId}"></div>
      <div id="JobDetailsPeopleWhoCanHelpSlot_${jobId}"></div>
      <div class="_a11f22e3">
        <div data-display-contents="true"><p class="_0508a270">${title}</p></div>
        <ul><li>
          <div class="_72963fa6" aria-label="Company, ${company}.">
            <a href="/company/${company.toLowerCase().replace(/\s+/g, "-")}">${company}</a>
          </div>
        </li></ul>
        <div data-display-contents="true">
          <p><span>${location}</span><span> · 2 days ago · 12 applicants</span></p>
        </div>
        <button>Easy Apply</button>
      </div>
      <div id="JobDetails_AboutTheJob_${jobId}">
        <h2>About the job</h2>
        <span data-testid="expandable-text-box"><p>${description}</p></span>
      </div>
    </div>`;

  const microsoft = (stale: boolean) =>
    detailSurface({
      jobId: PREVIOUS_JOB,
      company: "Microsoft",
      title: "Software Engineering Intern",
      location: "Redmond, WA",
      description: "Build platform tooling with the Azure team.",
      stale,
    });

  const acadium = (stale = false) =>
    detailSurface({
      jobId: SELECTED_JOB,
      company: "Acadium",
      title: "Multimedia Marketing Intern",
      location: "Canada",
      description: "Produce short-form video for the growth team.",
      stale,
    });

  /** A third posting, for the second hop. */
  const northwind = (stale = false) =>
    detailSurface({
      jobId: "4460000001",
      company: "Northwind Photonics",
      title: "Optics Test Technician",
      location: "Boise, ID",
      description: "Run bench measurements on prototype assemblies.",
      stale,
    });

  /** The rail the student picks the next posting out of. */
  const moreJobs = `
    <div id="JobDetailsSimilarJobsSlot_${PREVIOUS_JOB}">
      <h2>More jobs</h2>
      <ul>
        <li aria-label="Company, Southgate Robotics.">
          <div data-display-contents="true"><p>Warehouse Coordinator</p></div>
          <p><span>Mississauga, ON</span></p>
          <a href="/jobs/view/4470000002/">Warehouse Coordinator</a>
        </li>
      </ul>
    </div>`;

  const distractors = `
    <section>
      <h2>Hiring insights</h2>
      <span data-testid="expandable-text-box">Unlock hiring insights with Premium.</span>
    </section>
    <div data-display-contents="true"><p>Use AI to assess how you fit</p></div>`;

  const page = (...parts: string[]) =>
    `<body><main><h1>Jobs</h1>
       <section aria-label="Primary content">${parts.join("")}</section>
     </main></body>`;

  const capture = (html: string, url = LINKEDIN_SIMILAR) =>
    withRenderedGeometry(() => extractJob(readSitePage(html, url)));

  /** The reported failure, end to end. */
  it("reads the posting on screen after a similar-job click", () => {
    const job = capture(page(microsoft(true), acadium(), moreJobs, distractors));

    expect(job.company).toBe("Acadium");
    expect(job.jobTitle).toBe("Multimedia Marketing Intern");
    expect(job.location).toBe("Canada");
    expect(job.jobDescription).toBe(
      "Produce short-form video for the growth team.",
    );
  });

  it("lets no part of the departed posting reach the record", () => {
    const job = capture(page(microsoft(true), acadium(), moreJobs, distractors));

    expect(JSON.stringify(job)).not.toContain("Microsoft");
    expect(JSON.stringify(job)).not.toContain("Redmond");
    expect(JSON.stringify(job)).not.toContain("Software Engineering Intern");
    expect(job.jobDescription).not.toContain("Azure");
    expect(job.jobDescription).not.toContain("Unlock hiring insights");
  });

  it("files the record under the job the student selected", () => {
    const job = capture(page(microsoft(true), acadium(), moreJobs, distractors));

    expect(job.jobUrl).toBe(
      `https://www.linkedin.com/jobs/view/${SELECTED_JOB}/`,
    );
    expect(job.jobUrl).not.toContain(PREVIOUS_JOB);
    expect(job.source).toBe("LinkedIn");
  });

  /**
   * The stale surface keeps a complete, well-formed set of `JobDetails_*` ids.
   * If those ever decide anything again, this fails.
   */
  it("ignores the component ids the departed posting still carries", () => {
    const job = capture(page(microsoft(true), acadium(), moreJobs));

    expect(job.company).toBe("Acadium");
    expect(JSON.stringify(job)).not.toContain(PREVIOUS_JOB);
  });

  /** A second hop: two postings have now departed and a third is on screen. */
  it("follows a second similar-job click past two stale surfaces", () => {
    const url = `https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4460000001&referenceJobId=${SELECTED_JOB}`;
    const job = capture(
      page(microsoft(true), acadium(true), northwind(), moreJobs, distractors),
      url,
    );

    expect(job.company).toBe("Northwind Photonics");
    expect(job.jobTitle).toBe("Optics Test Technician");
    expect(job.location).toBe("Boise, ID");
    expect(job.jobDescription).toBe(
      "Run bench measurements on prototype assemblies.",
    );
    expect(job.jobUrl).toBe(
      "https://www.linkedin.com/jobs/view/4460000001/",
    );
    expect(JSON.stringify(job)).not.toContain("Microsoft");
    expect(JSON.stringify(job)).not.toContain("Acadium");
  });

  it("takes nothing from the More jobs rail", () => {
    const job = capture(page(microsoft(true), acadium(), moreJobs));

    expect(job.company).not.toBe("Southgate Robotics");
    expect(job.jobTitle).not.toBe("Warehouse Coordinator");
    expect(job.location).not.toBe("Mississauga, ON");
  });

  /**
   * The employer sits inside a list item on this route. A blanket "anything in
   * an `li` is a search result" test would discard the field being looked for,
   * which is why the rail is identified structurally instead.
   */
  it("reads a company the detail header renders inside a list", () => {
    expect(capture(page(acadium(), moreJobs)).company).toBe("Acadium");
  });

  it("stores nothing when two employers are drawn at once", () => {
    const job = capture(page(microsoft(false), acadium(), moreJobs));

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });

  it("stores nothing when nothing is drawn at all", () => {
    const job = capture(page(microsoft(true), acadium(true), moreJobs));

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("Microsoft");
  });

  it("stores nothing when the page has no Primary content region", () => {
    const job = capture(
      `<body><main>${acadium()}${distractors}</main></body>`,
    );

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });

  /**
   * Even with no fields, the address still knows which posting the student
   * chose — so the URL stays right rather than becoming a second failure.
   */
  it("still files an empty capture under the selected job", () => {
    const job = capture(page(microsoft(true), acadium(true), moreJobs));

    expect(job.jobUrl).toBe(
      `https://www.linkedin.com/jobs/view/${SELECTED_JOB}/`,
    );
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
