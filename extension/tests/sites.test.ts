import { describe, expect, it } from "vitest";
import {
  extractJob,
  extractJobReport,
  toExtractedJob,
} from "../src/extractor.js";
import {
  chooseLinkedInFrame,
  planLinkedInRead,
  probeLinkedInFrame,
  withTopLevelIdentity,
} from "../src/linkedin-frames.js";
import { collectPageSignals } from "../src/page-collector.js";
import {
  canonicalPostingUrl,
  readRulesFor,
  siteFor,
  type PageReadRules,
} from "../src/sites.js";
import type { PageSignals } from "../src/types.js";
import { jsonLd, readSitePage } from "./fixtures.js";

/**
 * The recognized surfaces Interndex Capture reads by name.
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
 * The route where the posting on screen is not in the top document at all.
 *
 * Live evidence, captured from a real tab: the address named the IBM posting
 * the student was reading in `currentJobId`, and the exacare ai posting they
 * had come from in `referenceJobId`. The top document held exacare's markup,
 * `JobDetails_*_4443429701` ids and all. The IBM posting — the one on screen —
 * was rendered inside a same-origin `/preload/?_bprMode=vanilla` iframe.
 */
const SELECTED_JOB = "4446257399";
const PREVIOUS_JOB = "4443429701";
const LINKEDIN_SIMILAR = `https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=${SELECTED_JOB}&originToLandingJobPostings=${SELECTED_JOB}&referenceJobId=${PREVIOUS_JOB}`;
const INDEED_JOB = "https://ca.indeed.com/viewjob?jk=a1b2c3d4e5f6a7b8";
const WORKDAY_JOB =
  "https://kpmg.wd3.myworkdayjobs.com/en-US/External/job/Toronto/Senior-Consultant_12345";
const GREENHOUSE_JOB =
  "https://job-boards.greenhouse.io/acme/jobs/4123456789";

describe("recognizing a site", () => {
  it("names the four surfaces it reads and nothing else", () => {
    expect(siteFor(LINKEDIN_JOB)).toBe("linkedin");
    expect(siteFor(INDEED_JOB)).toBe("indeed");
    expect(siteFor(WORKDAY_JOB)).toBe("workday");
    expect(siteFor(GREENHOUSE_JOB)).toBe("greenhouse");
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

  it("keeps Indeed on selectors and gives Workday a bounded detail strategy", () => {
    expect(readRulesFor(INDEED_JOB).strategy).toBeUndefined();
    expect(readRulesFor(WORKDAY_JOB).strategy).toBe("workday-job-detail");
    expect(readRulesFor(WORKDAY_JOB).fields).toEqual([]);
    expect(readRulesFor(WORKDAY_JOB).workdayTenant).toBe("kpmg");
  });

  /**
   * LinkedIn's routes do not all behave alike, and the address says which is
   * which. A job page is one posting at its own address; everything else is a
   * split pane, where the posting on screen may not even be in the document
   * `executeScript` reaches by default.
   */
  it("keeps a job page on the read that is verified for it", () => {
    const rules = readRulesFor(LINKEDIN_JOB);

    expect(rules.strategy).toBe("linkedin-job-detail");
    // Nothing for a second document to disagree with, so no frame is resolved.
    expect(rules.resolveFrame).toBeUndefined();
  });

  it("routes every split pane to the bounded read", () => {
    for (const url of [
      LINKEDIN_SEARCH,
      LINKEDIN_SIMILAR,
      "https://www.linkedin.com/jobs/search-results/?currentJobId=4123456789",
      "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4123456789",
      "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4457185005",
    ]) {
      expect(readRulesFor(url).strategy).toBe("linkedin-split-pane");
    }
  });

  /**
   * The frame probe is corroborated against `currentJobId` and nothing else.
   * `referenceJobId` names the posting the student came *from*, and asking the
   * frames about it would select the document showing the job they left.
   */
  it("asks the frames about the job the student selected, never the one they came from", () => {
    const rules = readRulesFor(LINKEDIN_SIMILAR);

    expect(rules.jobId).toBe(SELECTED_JOB);
    expect(rules.resolveFrame?.jobId).toBe(SELECTED_JOB);
    expect(rules.resolveFrame?.jobId).not.toBe(PREVIOUS_JOB);
  });

  /**
   * The two split-pane routes differ in exactly one respect: what is safe to
   * read when no frame establishes the posting. Search's top document holds the
   * selected posting — the live GE Vernova capture proved it. Similar Jobs' top
   * document holds the previous one, so there is nothing safe to read there.
   */
  it("says what is safe to read when no frame establishes the posting", () => {
    expect(readRulesFor(LINKEDIN_SEARCH).resolveFrame?.unresolved).toBe(
      "top-document",
    );
    expect(
      readRulesFor(
        "https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4123456789",
      ).resolveFrame?.unresolved,
    ).toBe("top-document");

    expect(readRulesFor(LINKEDIN_SIMILAR).resolveFrame?.unresolved).toBe("blank");
    expect(
      readRulesFor(
        "https://www.linkedin.com/jobs/search-results/?currentJobId=4457185005&referenceJobId=4449683666",
      ).resolveFrame?.unresolved,
    ).toBe("blank");
  });

  it("resolves no frame for an address that names no selected posting", () => {
    expect(
      readRulesFor("https://www.linkedin.com/jobs/search/?keywords=intern")
        .resolveFrame,
    ).toBeUndefined();
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

  /**
   * The results rail beside the pane, as LinkedIn actually builds one.
   *
   * `data-occludable-job-id` is LinkedIn's own marker for a card in the
   * virtualized results list, and the card links to the posting it advertises.
   * Both are load-bearing: they are how the bounded read tells a neighbour's
   * card apart from the detail pane without resorting to "anything in a list
   * item is a search result", which on Similar Jobs would discard the employer.
   */
  const resultsList = `
    <ul>
      <li class="_ff11aa22" data-occludable-job-id="4470000002"
          aria-label="Company, Southgate Robotics.">
        <div data-display-contents="true"><p>Sales Development Representative</p></div>
        <p><span>Austin, TX</span></p>
        <a href="/jobs/view/4470000002/">Sales Development Representative</a>
      </li>
    </ul>`;

  const detail = (...parts: string[]) =>
    `<body><main data-job-id="4123456789"><h1>Jobs</h1>${parts.join("")}</main></body>`;

  /**
   * The same page as a split pane, which is what a search route really is.
   *
   * Everything the bounded read is allowed to see lives inside
   * `section[aria-label="Primary content"]`; the rail is in there too, because
   * on the live page it is, and keeping it out is the read's job rather than
   * the fixture's.
   */
  const searchPane = (...parts: string[]) =>
    `<body><main><h1>Jobs</h1>
       <section aria-label="Primary content" data-job-id="4123456789">${parts.join("")}</section>
     </main></body>`;

  it("reads the selected posting from a job detail page", () => {
    const report = extractJobReport(
      readSitePage(detail(topCard, aboutTheJob), LINKEDIN_JOB),
    );
    const job = toExtractedJob(report);

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
    expect(report.fields.company).toMatchObject({
      state: "established",
      source: "linkedin_selected_posting",
      confidence: "exact",
    });
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
        searchPane(resultsList, topCard, aboutTheJob),
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
    const html = `<head><link rel="canonical" href="https://www.linkedin.com/jobs/search/" /></head>${searchPane(
      topCard,
    )}`;

    expect(extractJob(readSitePage(html, LINKEDIN_SEARCH)).jobUrl).toBe(
      "https://www.linkedin.com/jobs/view/4123456789/",
    );
  });

  it("leaves everything blank when the detail pane is not there", () => {
    const html = searchPane('<div class="_ab12cd34">Recommended for you</div>');

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
        readSitePage(searchPane(resultsList), LINKEDIN_SEARCH),
      );

      expect(job.company).toBeUndefined();
      expect(job.jobTitle).toBeUndefined();
      expect(job.location).toBeUndefined();
    });
  });

  describe("the title and the location, reached only through the company", () => {
    it("takes them from the card the company belongs to, not the page", () => {
      const job = extractJob(
        readSitePage(searchPane(resultsList, topCard), LINKEDIN_SEARCH),
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
 * LinkedIn's split panes, where the posting on screen may be in another
 * document entirely.
 *
 * The failure, as it happened: a student reading an IBM posting on
 * `/jobs/collections/similar-jobs/?currentJobId=4446257399&referenceJobId=4443429701`
 * captured the exacare ai posting they had clicked away from. Three theories
 * about that route were wrong before the real cause turned up, and it is worth
 * naming all three, because each one produced a plausible fix that shipped:
 *
 * - `referenceJobId` is not "the stale one"; it only says where the student
 *   came from.
 * - `JobDetails_*_<id>` component ids are not a statement about what is on
 *   screen; they go stale across the same transition.
 * - Rendered geometry cannot decide it either. It cannot see across a frame
 *   boundary, and on the live search page the selected posting measures `0×0`.
 *
 * What was actually true: the top document held the previous posting, and the
 * posting the student was looking at was inside a same-origin
 * `/preload/?_bprMode=vanilla` iframe. `chrome.scripting.executeScript` reads
 * the main frame unless told otherwise, so Capture was reading a document
 * nobody could see.
 *
 * These fixtures therefore model documents rather than one page, and drive the
 * same three steps the popup does: probe every frame, choose one, read it.
 */

/** One frame of a tab: what Chrome would call it, where it is, what is in it. */
type Frame = { frameId: number; url: string; html: string };

/**
 * The whole path the popup takes, with Chrome's frame tree modelled as HTML.
 *
 * Deliberately not a reimplementation of the popup's control flow: the decision
 * itself is `planLinkedInRead`, which is the code that ships. What this adds is
 * the part a unit test cannot otherwise reach — loading each document, probing
 * it, and then collecting from whichever one was chosen.
 */
function captureAcrossFrames(
  frames: readonly Frame[],
  topUrl: string,
): { plan: ReturnType<typeof planLinkedInRead>; job: ReturnType<typeof extractJob> } {
  const rules = readRulesFor(topUrl);
  const resolve = rules.resolveFrame;
  if (!resolve) throw new Error(`${topUrl} resolves no frame`);

  const probes = frames.map((frame) => {
    document.documentElement.innerHTML = frame.html;

    // jsdom serves every document from one address, so the frame's own URL is
    // stated here rather than read — the same way `fixtures.ts` states the page
    // URL. Everything else is genuinely probed out of the document.
    return {
      frameId: frame.frameId,
      ...probeLinkedInFrame(resolve.jobId),
      frameUrl: frame.url,
    };
  });

  const plan = planLinkedInRead(chooseLinkedInFrame(probes), resolve.unresolved);

  const target = frames.find((frame) => frame.frameId === (plan.frameId ?? 0));
  if (!target) throw new Error(`no frame ${plan.frameId} in this tab`);

  // Failing blank means handing the collector no strategy at all: the fields
  // come back empty, and the posting's identity still reaches the record.
  const documentRules: PageReadRules = plan.strategy
    ? rules
    : { fields: rules.fields, ...(rules.jobId ? { jobId: rules.jobId } : {}) };

  document.documentElement.innerHTML = target.html;

  // Chrome reports the address of the document the read ran in — on this route
  // the iframe's. Identity comes from the tab instead, or the record is filed
  // under `/preload/`.
  const signals: PageSignals = {
    ...collectPageSignals(documentRules),
    pageUrl: target.url,
  };

  return { plan, job: extractJob(withTopLevelIdentity(signals, topUrl)) };
}

/**
 * Lays the whole page out at zero, which is what the live search page does.
 *
 * On the failing GE Vernova capture every element of the selected posting —
 * the company, the title, the description, and every ancestor sampled above
 * them — reported `0×0`. Any read that requires positive geometry returns
 * nothing on that page, so these fixtures make sure none does.
 */
function withZeroGeometry<T>(run: () => T): T {
  const original = Element.prototype.getBoundingClientRect;

  Element.prototype.getBoundingClientRect = function (this: Element) {
    return {
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      toJSON: () => ({}),
    } as DOMRect;
  };

  try {
    return run();
  } finally {
    Element.prototype.getBoundingClientRect = original;
  }
}

/** One posting's detail pane, as the live routes build it. */
function detailPane({
  jobId,
  company,
  title,
  location,
  description,
  identified = true,
}: {
  jobId: string;
  company: string;
  title: string;
  location: string;
  description: string;
  /** Whether this document carries the attributes that name its own posting. */
  identified?: boolean;
}): string {
  const slug = company.toLowerCase().replace(/\s+/g, "-");

  return `
    <div class="_c753af09"${identified ? ` data-job-id="${jobId}"` : ""}>
      <div id="JobDetails_ManageJobBanner_${jobId}"></div>
      <div class="_a11f22e3">
        <div data-display-contents="true"><p class="_0508a270">${title}</p></div>
        <ul><li>
          <div class="_72963fa6" aria-label="Company, ${company}.">
            <a href="/company/${slug}">${company}</a>
          </div>
        </li></ul>
        <div data-display-contents="true">
          <p><span>${location}</span><span> · 2 days ago · 12 applicants</span></p>
        </div>
        ${identified ? `<a class="_apply" href="/jobs/view/${jobId}/">Easy Apply</a>` : "<button>Easy Apply</button>"}
      </div>
      <div id="JobDetails_AboutTheJob_${jobId}">
        <h2>About the job</h2>
        <span data-testid="expandable-text-box"><p>${description}</p></span>
      </div>
    </div>`;
}

/** A card in the virtualized results list, with LinkedIn's own markers on it. */
function resultCard(jobId: string, company: string, title: string): string {
  return `
    <li data-occludable-job-id="${jobId}" aria-label="Company, ${company}.">
      <div data-display-contents="true"><p>${title}</p></div>
      <p><span>Somewhere, ON</span></p>
      <a href="/jobs/view/${jobId}/">${title}</a>
    </li>`;
}

/** A whole LinkedIn jobs UI: a rail of postings, and the pane beside it. */
function jobsUi(rail: string, pane: string): string {
  return `<body><main><h1>Jobs</h1>
     <section aria-label="Primary content">${rail}${pane}</section>
   </main></body>`;
}

describe("LinkedIn Similar Jobs, across the frame boundary", () => {
  const exacare = detailPane({
    jobId: PREVIOUS_JOB,
    company: "Exacare AI",
    title: "Solutions Consultant",
    location: "Remote — Canada",
    description: "Support onboarding for care providers.",
  });

  const ibm = detailPane({
    jobId: SELECTED_JOB,
    company: "IBM",
    title: "Senior Managing Consultant SAP HANA SD OTC",
    location: "Vancouver, BC",
    description: "Lead order-to-cash delivery for enterprise clients.",
  });

  /**
   * The top document's More jobs rail, which links to the posting the student
   * clicked — one lone href naming the selected job, in a document that is not
   * showing it. Believing a single href would choose this frame, and this is
   * the fixture that says so.
   */
  const moreJobsRail = `
    <div id="JobDetailsSimilarJobsSlot_${PREVIOUS_JOB}">
      <h2>More jobs</h2>
      <ul>
        <li><a href="/jobs/view/${SELECTED_JOB}/">Senior Managing Consultant</a></li>
        <li aria-label="Company, Southgate Robotics.">
          <div data-display-contents="true"><p>Warehouse Coordinator</p></div>
          <p><span>Mississauga, ON</span></p>
          <a href="/jobs/view/4470000002/">Warehouse Coordinator</a>
        </li>
      </ul>
    </div>`;

  /** The results list inside the frame that is drawing the current posting. */
  const preloadRail = `<ul>
     ${resultCard(SELECTED_JOB, "IBM", "Senior Managing Consultant SAP HANA SD OTC")}
     ${resultCard("4470000002", "Southgate Robotics", "Warehouse Coordinator")}
   </ul>`;

  const distractors = `
    <section>
      <h2>Hiring insights</h2>
      <span data-testid="expandable-text-box">Unlock hiring insights with Premium.</span>
    </section>`;

  /** The top document: the posting the student came from, still intact. */
  const topFrame: Frame = {
    frameId: 0,
    url: LINKEDIN_SIMILAR,
    html: jobsUi(moreJobsRail, exacare + distractors),
  };

  /** An unrelated same-origin frame, of the sort a big page carries several of. */
  const trackingFrame: Frame = {
    frameId: 1,
    url: "https://www.linkedin.com/li/track",
    html: "<body><p>Nothing to do with jobs</p></body>",
  };

  /** The frame the student is actually looking at. */
  const preloadFrame: Frame = {
    frameId: 2,
    url: "https://www.linkedin.com/preload/?_bprMode=vanilla",
    html: jobsUi(preloadRail, ibm + distractors),
  };

  const tab = [topFrame, trackingFrame, preloadFrame];

  const capture = (frames: readonly Frame[] = tab, url = LINKEDIN_SIMILAR) =>
    withZeroGeometry(() => captureAcrossFrames(frames, url));

  /** The reported failure, end to end. */
  it("reads the posting inside the frame the student is looking at", () => {
    const { job } = capture();

    expect(job.company).toBe("IBM");
    expect(job.jobTitle).toBe("Senior Managing Consultant SAP HANA SD OTC");
    expect(job.location).toBe("Vancouver, BC");
    expect(job.jobDescription).toBe(
      "Lead order-to-cash delivery for enterprise clients.",
    );
  });

  it("chooses that frame by corroboration, not by it being the main one", () => {
    const { plan } = capture();

    expect(plan).toEqual({ frameId: 2, strategy: true });
    expect(plan.frameId).not.toBe(0);
  });

  /**
   * The top document's rail links to the selected posting, exactly as the live
   * one does. One href is a coincidence, not an identification.
   */
  it("is not persuaded by the lone link the top document happens to carry", () => {
    const probe = (() => {
      document.documentElement.innerHTML = topFrame.html;

      return probeLinkedInFrame(SELECTED_JOB);
    })();

    expect(probe.currentIdLinks).toBe(1);
    expect(probe.dataJobId).toBe(false);
    expect(probe.dataOccludableJobId).toBe(false);
  });

  it("lets no part of the posting the student came from reach the record", () => {
    const { job } = capture();

    expect(JSON.stringify(job)).not.toContain("Exacare");
    expect(JSON.stringify(job)).not.toContain("Solutions Consultant");
    expect(JSON.stringify(job)).not.toContain(PREVIOUS_JOB);
    expect(job.jobDescription).not.toContain("care providers");
    expect(job.jobDescription).not.toContain("Unlock hiring insights");
  });

  /**
   * Identity is the tab's, not the frame's. The fields came out of
   * `/preload/?_bprMode=vanilla`; the record is filed under the posting the
   * top-level `currentJobId` names.
   */
  it("files the record under the job the top-level address names", () => {
    const { job } = capture();

    expect(job.jobUrl).toBe(
      `https://www.linkedin.com/jobs/view/${SELECTED_JOB}/`,
    );
    expect(job.jobUrl).not.toContain("preload");
    expect(job.jobUrl).not.toContain(PREVIOUS_JOB);
    expect(job.source).toBe("LinkedIn");
  });

  it("takes nothing from the results rail inside the chosen frame", () => {
    const { job } = capture();

    expect(job.company).not.toBe("Southgate Robotics");
    expect(job.jobTitle).not.toBe("Warehouse Coordinator");
    expect(job.location).not.toBe("Somewhere, ON");
  });

  /**
   * The employer sits inside a list item on this route. A blanket "anything in
   * an `li` is a search result" rule would discard the field being looked for,
   * which is why the rail is identified by LinkedIn's own card markers and by
   * links naming another posting instead.
   */
  it("reads a company the detail header renders inside a list", () => {
    const { job } = capture([
      { ...preloadFrame, html: jobsUi("", ibm) },
    ]);

    expect(job.company).toBe("IBM");
  });

  /**
   * `/preload/` is where the posting happened to be, not a rule. A `/preload/`
   * document with nothing to say about `currentJobId` loses to one that has it.
   */
  it("does not choose a document for having a /preload/ address", () => {
    const stalePreload: Frame = {
      ...preloadFrame,
      html: jobsUi(moreJobsRail, exacare),
    };
    const liveFrame: Frame = {
      frameId: 3,
      url: "https://www.linkedin.com/jobs/collections/similar-jobs/",
      html: jobsUi(preloadRail, ibm),
    };

    const { plan, job } = capture([topFrame, stalePreload, liveFrame]);

    expect(plan.frameId).toBe(3);
    expect(job.company).toBe("IBM");
  });

  /** Fixture C: two documents claim the posting and nothing separates them. */
  it("stores nothing when two frames both establish the posting", () => {
    const rival: Frame = {
      frameId: 4,
      url: "https://www.linkedin.com/preload/?_bprMode=vanilla",
      html: jobsUi(
        preloadRail,
        detailPane({
          jobId: SELECTED_JOB,
          company: "Not IBM",
          title: "Something else entirely",
          location: "Nowhere",
          description: "A second document claiming the same job.",
        }),
      ),
    };

    const { plan, job } = capture([topFrame, preloadFrame, rival]);

    expect(plan).toEqual({ strategy: false });
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });

  /** Fixture D: nothing establishes the posting, and the parent is not a guess. */
  it("does not fall back to the posting the parent document still holds", () => {
    const { plan, job } = capture([topFrame, trackingFrame]);

    expect(plan).toEqual({ strategy: false });
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("Exacare");
    expect(JSON.stringify(job)).not.toContain("Solutions Consultant");
  });

  /**
   * Even with no fields, the address still knows which posting the student
   * chose — so the URL stays right rather than becoming a second failure.
   */
  it("still files an empty capture under the selected job", () => {
    const { job } = capture([topFrame, trackingFrame]);

    expect(job.jobUrl).toBe(
      `https://www.linkedin.com/jobs/view/${SELECTED_JOB}/`,
    );
  });

  /**
   * Two employers in one region, neither of them claiming to be another
   * posting. The document is describing two jobs at once and there is no
   * honest way to pick one.
   */
  it("stores nothing when the chosen document names two employers", () => {
    const anonymousRival = detailPane({
      jobId: "4470000009",
      company: "Halden Optics",
      title: "Optics Test Technician",
      location: "Boise, ID",
      description: "Run bench measurements on prototype assemblies.",
      identified: false,
    });

    const confused: Frame = {
      ...preloadFrame,
      html: jobsUi(preloadRail, ibm + anonymousRival),
    };

    const { job } = capture([topFrame, confused]);

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });

  /**
   * A block that says which posting it belongs to, and says a different one, is
   * not a competing claim — it is another job's markup left in the document.
   * `data-job-id` is trusted for that and for nothing else: it excludes, it
   * never selects.
   */
  it("ignores a leftover pane that names a different posting", () => {
    const withLeftovers: Frame = {
      ...preloadFrame,
      html: jobsUi(preloadRail, ibm + exacare),
    };

    const { job } = capture([topFrame, withLeftovers]);

    expect(job.company).toBe("IBM");
    expect(JSON.stringify(job)).not.toContain("Exacare");
  });

  it("stores nothing when the chosen document has no Primary content region", () => {
    const shapeless: Frame = {
      ...preloadFrame,
      html: `<body><main>${preloadRail}${ibm}</main></body>`,
    };

    const { job } = capture([topFrame, shapeless]);

    expect(job.company).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });
});

/**
 * LinkedIn's general search, where the selected posting is present and unread.
 *
 * The second live failure, independently proven. On
 * `/jobs/search/?currentJobId=4459003223` the student saw GE Vernova's Controls
 * Product Management Intern posting and Capture returned four blanks; opening
 * `/jobs/view/4459003223/` directly captured it correctly.
 *
 * The diagnostic said why. `section[aria-label="Primary content"]` held
 * `aria-label="Company, GE Vernova."`, the title leaf, the location and the
 * description — and every one of those elements, and every ancestor sampled
 * above them, reported `0×0`. The old read wanted positive geometry, and it
 * scanned the first labelled elements in the *whole* document, which on a
 * results page means the rail. Both of those are fixed here, and the fixture
 * keeps them fixed: the rail is large, it is inside Primary content, and
 * nothing on the page has a size.
 */
describe("LinkedIn search, where the selected posting measures nothing", () => {
  const GE_JOB = "4459003223";
  const GE_SEARCH = `https://www.linkedin.com/jobs/search/?currentJobId=${GE_JOB}&keywords=product%20management%20intern`;
  const GE_TITLE = "GE Vernova Controls Product Management Intern - Summer 2027";
  const GE_DESCRIPTION =
    "Join the Controls organisation for a summer of product work on grid software.";

  /** The left rail: other people's employers, plenty of them. */
  const rail = `<ul>
     ${resultCard("4470000011", "Northgate Systems", "Operations Analyst")}
     ${resultCard("4470000012", "Halden Optics", "Manufacturing Intern")}
     ${resultCard("4470000013", "Southgate Robotics", "Field Technician")}
     ${resultCard("4470000014", "Bright Harbour Media", "Marketing Co-op")}
   </ul>`;

  /** The rail as it looks once the selected posting's own card is in view. */
  const railWithSelected = `<ul>
     ${resultCard("4470000011", "Northgate Systems", "Operations Analyst")}
     ${resultCard(GE_JOB, "GE Vernova", GE_TITLE)}
     ${resultCard("4470000013", "Southgate Robotics", "Field Technician")}
   </ul>`;

  const geDetail = (identified: boolean) =>
    detailPane({
      jobId: GE_JOB,
      company: "GE Vernova",
      title: GE_TITLE,
      location: "Greenville, SC",
      description: GE_DESCRIPTION,
      identified,
    });

  const search = (frames: readonly Frame[]) =>
    withZeroGeometry(() => captureAcrossFrames(frames, GE_SEARCH));

  /** The tab as Chrome serves it: one document, and it identifies its posting. */
  const identifiedTab: readonly Frame[] = [
    {
      frameId: 0,
      url: GE_SEARCH,
      html: jobsUi(railWithSelected, geDetail(true)),
    },
  ];

  /**
   * The same page with nothing that names the selected posting — the card
   * scrolled out of the virtualized list, and no `data-job-id` on the pane. No
   * frame establishes anything, and search is the route whose top document may
   * still be read.
   */
  const unidentifiedTab: readonly Frame[] = [
    { frameId: 0, url: GE_SEARCH, html: jobsUi(rail, geDetail(false)) },
  ];

  it("reads the selected posting out of Primary content", () => {
    const { job } = search(identifiedTab);

    expect(job.company).toBe("GE Vernova");
    expect(job.jobTitle).toBe(GE_TITLE);
    expect(job.location).toBe("Greenville, SC");
    expect(job.jobDescription).toBe(GE_DESCRIPTION);
    expect(job.jobUrl).toBe(`https://www.linkedin.com/jobs/view/${GE_JOB}/`);
    expect(job.warnings).toEqual([]);
  });

  it("requires no geometry, because the live page has none to offer", () => {
    // Every element on the page measured `0×0` for the assertion above. This
    // says so out loud: the same capture with a laid-out page is identical.
    const laidOut = captureAcrossFrames(identifiedTab, GE_SEARCH);

    expect(laidOut.job.company).toBe("GE Vernova");
    expect(laidOut.job.jobTitle).toBe(GE_TITLE);
  });

  it("lets no employer from the left rail win", () => {
    const { job } = search(identifiedTab);

    for (const other of [
      "Northgate Systems",
      "Halden Optics",
      "Southgate Robotics",
      "Bright Harbour Media",
    ]) {
      expect(job.company).not.toBe(other);
    }
    expect(job.jobTitle).not.toBe("Operations Analyst");
    expect(job.location).not.toBe("Somewhere, ON");
  });

  /**
   * Step three of the search fix: when no frame establishes the posting, this
   * route reads its own top document — bounded to Primary content — rather than
   * falling back to the global scan that returned blanks.
   */
  it("refuses Primary content when no root establishes the posting", () => {
    const { plan, job } = search(unidentifiedTab);

    expect(plan).toEqual({ strategy: true });
    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.jobUrl).toBe(`https://www.linkedin.com/jobs/view/${GE_JOB}/`);
    expect(job.warnings).toContain("no_job_posting_found");
  });

  it("still refuses a search page with no bounded detail region", () => {
    const { job } = search([
      {
        frameId: 0,
        url: GE_SEARCH,
        html: `<body><main><h1>Jobs</h1>${rail}</main></body>`,
      },
    ]);

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
  });

  /** A search tab can render its pane in a frame too, and the same path works. */
  it("follows the posting into a frame when the search tab uses one", () => {
    const { plan, job } = search([
      { frameId: 0, url: GE_SEARCH, html: jobsUi(rail, "") },
      {
        frameId: 5,
        url: "https://www.linkedin.com/preload/?_bprMode=vanilla",
        html: jobsUi(railWithSelected, geDetail(true)),
      },
    ]);

    expect(plan).toEqual({ frameId: 5, strategy: true });
    expect(job.company).toBe("GE Vernova");
    expect(job.jobUrl).toBe(`https://www.linkedin.com/jobs/view/${GE_JOB}/`);
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

    const report = extractJobReport(readSitePage(html, INDEED_JOB));
    const job = toExtractedJob(report);

    expect(job.company).toBe("Bright Harbour Media");
    expect(job.jobTitle).toBe("Marketing Co-op");
    expect(job.location).toBe("Ottawa, ON");
    expect(job.jobDescription).toBe("Support the campaigns team.");
    expect(job.source).toBe("Indeed");
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      source: "indeed_site",
      confidence: "exact",
    });
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

/**
 * General Indeed location/work-arrangement normalization.
 *
 * Indeed frequently states location and work-model metadata in one rendered
 * string, separated by a bullet: `Toronto, ON M5R 3V5 • Hybrid work`. The
 * geographic `location` field must contain only geographic information, and
 * this must generalize across any city, province, postal code, or country —
 * nothing here is anchored to one geography, and nothing strips a bullet
 * segment merely for appearing after one.
 */
describe("Indeed's combined location and arrangement line", () => {
  const posting = (location: string) => `<body>
     <h2 data-testid="jobsearch-JobInfoHeader-title">Analyst Intern</h2>
     <div data-testid="inlineHeader-companyName">Northfield Analytics</div>
     <div data-testid="inlineHeader-companyLocation">${location}</div>
     <div id="jobDescriptionText"><p>Join the analytics team.</p></div>
   </body>`;

  it("separates a postal code and Hybrid work from the geographic location", () => {
    const job = extractJob(
      readSitePage(posting("Toronto, ON M5R 3V5 • Hybrid work"), INDEED_JOB),
    );

    expect(job.location).toBe("Toronto, ON M5R 3V5");
    expect(job.workArrangement).toBe("Hybrid");
  });

  it("separates a city from a Remote statement", () => {
    const job = extractJob(readSitePage(posting("Ottawa, ON • Remote"), INDEED_JOB));

    expect(job.location).toBe("Ottawa, ON");
    expect(job.workArrangement).toBe("Remote");
  });

  it("separates a city from an On-site statement, in either wording Indeed uses", () => {
    for (const location of ["Vancouver, BC • On-site", "Vancouver, BC • In-person"]) {
      const job = extractJob(readSitePage(posting(location), INDEED_JOB));

      expect(job.location).toBe("Vancouver, BC");
      expect(job.workArrangement).toBe("On-site");
    }
  });

  it("leaves a city-only location untouched, with no arrangement manufactured", () => {
    const job = extractJob(readSitePage(posting("Ottawa, ON"), INDEED_JOB));

    expect(job.location).toBe("Ottawa, ON");
    expect(job.workArrangement).toBeUndefined();
  });

  it("reads a bare arrangement as arrangement evidence, never as a location", () => {
    const job = extractJob(readSitePage(posting("Remote"), INDEED_JOB));

    expect(job.location).toBeUndefined();
    expect(job.workArrangement).toBe("Remote");
  });

  it("never treats an employment-type word as a work arrangement", () => {
    for (const location of [
      "Toronto, ON • Full-time",
      "Toronto, ON • Part-time",
      "Toronto, ON • Contract",
      "Toronto, ON • Internship",
    ]) {
      const job = extractJob(readSitePage(posting(location), INDEED_JOB));

      // Not a recognized arrangement word, so it is not stripped out at all —
      // a bullet is not a promise that what follows it is work-model metadata.
      expect(job.location).toBe(location);
      expect(job.workArrangement).toBeUndefined();
    }
  });

  it("does not strip arbitrary text merely because it follows a bullet", () => {
    const job = extractJob(
      readSitePage(posting("Toronto, ON • Downtown office"), INDEED_JOB),
    );

    expect(job.location).toBe("Toronto, ON • Downtown office");
    expect(job.workArrangement).toBeUndefined();
  });
});

/**
 * General employer-domain extraction for Indeed.
 *
 * This exercises `selectedCompanyDomain`/`employerDomainFromUrl`, which are
 * already site-agnostic: any site whose "description" selector matches a
 * container gets its links collected the same way. Nothing Indeed-specific
 * was added for this — these tests exist to prove the general mechanism
 * already covers Indeed, and to catch a regression if that ever stops being
 * true.
 */
describe("Indeed employer domain from description-link evidence", () => {
  const posting = (descriptionHtml: string) => `<body>
     <h2 data-testid="jobsearch-JobInfoHeader-title">Analyst Intern</h2>
     <div data-testid="inlineHeader-companyName">Northfield Analytics</div>
     <div data-testid="inlineHeader-companyLocation">Toronto, ON</div>
     <div id="jobDescriptionText">${descriptionHtml}</div>
   </body>`;

  it("accepts an explicit employer-owned URL", () => {
    const job = extractJob(
      readSitePage(
        posting(
          '<p>Learn more at <a href="https://www.northfieldanalytics.example/careers">our careers page</a>.</p>',
        ),
        INDEED_JOB,
      ),
    );

    expect(job.companyDomain).toBe("northfieldanalytics.example");
  });

  it("rejects Indeed's own company-page URL", () => {
    const job = extractJob(
      readSitePage(
        posting(
          '<p>See our <a href="https://www.indeed.com/cmp/Northfield-Analytics">company profile</a>.</p>',
        ),
        INDEED_JOB,
      ),
    );

    expect(job.companyDomain).toBeUndefined();
  });

  it("rejects a redirect/tracking URL hosted on Indeed itself", () => {
    const job = extractJob(
      readSitePage(
        posting(
          '<p><a href="https://ca.indeed.com/rc/clk?jk=a1b2c3d4e5f6a7b8&from=jobsearch">Apply</a></p>',
        ),
        INDEED_JOB,
      ),
    );

    expect(job.companyDomain).toBeUndefined();
  });

  it("leaves company domain unset with no URL evidence at all", () => {
    const job = extractJob(readSitePage(posting("<p>Join the analytics team.</p>"), INDEED_JOB));

    expect(job.companyDomain).toBeUndefined();
  });
});

/**
 * A structured street address is promoted to the front of `location` only
 * when the publisher's own JobPosting data supplies it alongside a real
 * city — never inferred from description text. This is a general
 * `readLocation` improvement, not an Indeed-specific one: Indeed's own pages
 * publish no structured JobPosting data at all (see the Indeed describe
 * blocks above, which never carry a `jsonLd(...)` fixture), so this is
 * exercised against a generic structured posting the way the rest of this
 * file already does for other structured-data behavior.
 */
describe("a structured street address, promoted only with high confidence", () => {
  it("includes a street address when the structured data also states a city", () => {
    const html = `<head>${jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      url: "https://careers.example.com/jobs/1",
      title: "Finance Intern",
      description: "Support the finance team.",
      hiringOrganization: { "@type": "Organization", name: "Northfield Analytics" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          streetAddress: "100 King Street West",
          addressLocality: "Toronto",
          addressRegion: "ON",
        },
      },
    })}</head><body><h1>Job posting</h1></body>`;

    const job = extractJob(readSitePage(html, "https://careers.example.com/jobs/1"));

    expect(job.location).toBe("100 King Street West, Toronto, ON");
  });

  it("stays at city level when no street address is stated", () => {
    const html = `<head>${jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      url: "https://careers.example.com/jobs/1",
      title: "Finance Intern",
      description: "Support the finance team.",
      hiringOrganization: { "@type": "Organization", name: "Northfield Analytics" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Toronto",
          addressRegion: "ON",
        },
      },
    })}</head><body><h1>Job posting</h1></body>`;

    const job = extractJob(readSitePage(html, "https://careers.example.com/jobs/1"));

    expect(job.location).toBe("Toronto, ON");
  });

  it("never reads a description number as a street address", () => {
    // A misleading numeric statement that looks street-address-shaped but is
    // not one — this must never leak into location, and no address-shaped
    // heuristic exists over description text at all.
    const html = `<head>${jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      url: "https://careers.example.com/jobs/1",
      title: "Finance Intern",
      description:
        "This posting has received 123 Main Street applications so far this week.",
      hiringOrganization: { "@type": "Organization", name: "Northfield Analytics" },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Toronto",
          addressRegion: "ON",
        },
      },
    })}</head><body><h1>Job posting</h1></body>`;

    const job = extractJob(readSitePage(html, "https://careers.example.com/jobs/1"));

    expect(job.location).toBe("Toronto, ON");
    expect(job.jobDescription).toContain("123 Main Street");
  });
});

/**
 * Regression fixture: a real Capital One Indeed posting found in production
 * manual QA. This is one integration fixture that reproduced the bug, not a
 * template — every behavior it asserts is a general rule proven independently
 * above, and no production code anywhere checks for Capital One, this job
 * title, this Indeed job id, "161 Bay Street", "$45,000" or "$85,000".
 */
describe("the Capital One Indeed posting found in production QA", () => {
  const html = `<body>
     <h2 data-testid="jobsearch-JobInfoHeader-title">Summer 2027 Intern, Technology - job post</h2>
     <div data-testid="inlineHeader-companyName">Capital One</div>
     <div data-testid="inlineHeader-companyLocation">161 Bay Street, Toronto, ON M5R 3V5 • Hybrid work</div>
     <div id="jobDescriptionText"><p>${[
       "Summer 2027 Internship - Technology",
       "The expected annual salary for this position is between $45,000 to $85,000.",
       "This role follows a hybrid schedule based out of our Toronto office.",
     ].join(" ")}</p></div>
   </body>`;

  const captured = () =>
    toExtractedJob(
      extractJobReport(
        readSitePage(html, "https://ca.indeed.com/viewjob?jk=f4e3d2c1b0a99887"),
      ),
    );

  it("keeps company and title correct", () => {
    const job = captured();

    expect(job.company).toBe("Capital One");
    expect(job.jobTitle).toBe("Summer 2027 Intern, Technology");
  });

  it("separates the geographic location from the Hybrid arrangement", () => {
    const job = captured();

    expect(job.location).toBe("161 Bay Street, Toronto, ON M5R 3V5");
    expect(job.location).not.toContain("Hybrid");
    expect(job.workArrangement).toBe("Hybrid");
  });

  it("reads the work term from the title", () => {
    expect(captured().workTerm).toBe("Summer 2027");
  });

  it("captures the explicit annual salary range", () => {
    expect(captured().salary).toBe("$45,000 to $85,000");
  });

  it("leaves company domain unset — the page carries no employer-owned URL", () => {
    expect(captured().companyDomain).toBeUndefined();
  });
});

/**
 * Shared by every Workday describe block below: the selected-posting-page
 * shape `readWorkdayJobDetail` reads, with Similar Jobs cards bracketing it
 * on both sides the way a live page does.
 */
function workdayDetail({
  title,
  location,
  description,
  sidebar,
  requisition = "123",
}: {
  title: string;
  location: string;
  description: string;
  sidebar: string;
  requisition?: string;
}) {
  return `<body>
      <div data-automation-id="similarJobsCard"><h2>Similar Jobs title</h2><div data-automation-id="locations"><dl><dd>Wrong before location</dd></dl></div></div>
      <div data-automation-id="jobPostingPage">
        <h2 data-automation-id="jobPostingHeader">${title}</h2>
        <div data-automation-id="job-posting-details"><div data-automation-id="locations"><dl><dt>locations</dt><dd>${location}</dd></dl></div></div>
        <div data-automation-id="requisitionId"><dl><dt>job requisition id</dt><dd>${requisition}</dd></dl></div>
        <div data-automation-id="jobPostingDescription"><p>${description}</p></div>
      </div>
      <div data-automation-id="similarJobsCard"><h2>Another similar title</h2><div data-automation-id="locations"><dl><dd>Wrong after location</dd></dl></div></div>
      <aside data-automation-id="jobSidebar">${sidebar}</aside>
    </body>`;
}

describe("Workday", () => {
  const posting = `<body>
     <h1>Search for Jobs</h1>
     <div data-automation-id="jobPostingPage">
       <h2 data-automation-id="jobPostingHeader">Senior Consultant, Internship</h2>
       <div data-automation-id="job-posting-details"><div data-automation-id="locations"><dl><dt>locations</dt><dd>Toronto, Ontario</dd></dl></div></div>
       <div data-automation-id="requisitionId"><dl><dt>job requisition id</dt><dd>12345</dd></dl></div>
       <div data-automation-id="jobPostingDescription"><p>Join the consulting practice.</p></div>
     </div>
   </body>`;

  const BMO_JOB =
    "https://bmo.wd3.myworkdayjobs.com/en-US/External/job/Toronto/Analyst_123";
  const CIBC_JOB =
    "https://cibc.wd3.myworkdayjobs.com/campus/job/Toronto/Coordinator_123";

  function staleStructuredPosting(overrides: Record<string, unknown> = {}) {
    return {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      // Names the page it is on, so what rejects it below is Workday's
      // freshness rule rather than the identity correlation.
      url: BMO_JOB,
      title: "Stale backend title",
      description: "Conflicting structured description.",
      validThrough: "2026-09-25",
      hiringOrganization: {
        "@type": "Organization",
        name: "BMO Nesbitt Burns Inc.",
        url: "https://www.bmonesbittburns.com/careers",
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "FCP",
          addressCountry: "Canada",
        },
      },
      baseSalary: {
        currency: "CAD",
        value: { value: "100000", unitText: "YEAR" },
      },
      ...overrides,
    };
  }

  it("reads the selected posting rather than the page around it", () => {
    const report = extractJobReport(readSitePage(posting, WORKDAY_JOB));
    const job = toExtractedJob(report);

    expect(job.jobTitle).toBe("Senior Consultant, Internship");
    expect(job.location).toBe("Toronto, Ontario");
    expect(job.jobDescription).toBe("Join the consulting practice.");
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      source: "workday_selected_posting",
      confidence: "exact",
    });
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

  it("reads BMO only from the selected posting and bounded sidebar opening", () => {
    const html = workdayDetail({
      title:
        "BMO Capital Markets Winter 2027 Investment Banking Analyst, Metals & Mining, Toronto (Co-Op/ Internship)",
      location: "Toronto, ON, CAN",
      description: "Selected BMO description.",
      sidebar:
        '<img data-automation-id="image" alt="Logo" /><div data-automation-id="richText">BMO is a leading bank driven by a single purpose.</div>',
    });

    const job = extractJob(readSitePage(html, BMO_JOB));

    expect(job.company).toBe("BMO");
    expect(job.jobTitle).toBe(
      "BMO Capital Markets Winter 2027 Investment Banking Analyst, Metals & Mining, Toronto (Co-Op/ Internship)",
    );
    expect(job.location).toBe("Toronto, ON, CAN");
    expect(job.jobDescription).toBe("Selected BMO description.");
    expect(job.jobDescription).not.toContain("leading bank");
    expect(job.companyDomain).toBeUndefined();
    expect(job.source).toBeUndefined();
  });

  it("prefers CIBC's specific sidebar logo and keeps Similar Jobs out", () => {
    const html = workdayDetail({
      title: "Project Coordinator Co-op",
      location: "Toronto, ON",
      description: "Selected CIBC description.",
      sidebar:
        '<img data-automation-id="image" alt="CIBC logo" /><div data-automation-id="richText">At CIBC, we are in business to help our clients.</div>',
    });

    const job = extractJob(readSitePage(html, CIBC_JOB));

    expect(job.company).toBe("CIBC");
    expect(job.jobTitle).toBe("Project Coordinator Co-op");
    expect(job.location).toBe("Toronto, ON");
    expect(job.jobDescription).toBe("Selected CIBC description.");
  });

  it("does not let BMO's structured backend posting override selected fields", () => {
    const html = `<head>
      ${jsonLd(staleStructuredPosting())}
      <meta property="og:url" content="https://bmo.wd3.myworkdayjobs.com/en-US/job/Stale_999" />
      <link rel="canonical" href="https://bmo.wd3.myworkdayjobs.com/en-US/job/Stale_999" />
    </head>${workdayDetail({
      title:
        "BMO Capital Markets Winter 2027 Investment Banking Analyst, Metals & Mining, Toronto (Co-Op/ Internship)",
      location: "Toronto, ON, CAN",
      description: "Selected BMO description.",
      sidebar:
        '<img data-automation-id="image" alt="Logo" /><div data-automation-id="richText">BMO is a leading bank.</div>',
    })}`;

    const report = extractJobReport(readSitePage(html, BMO_JOB));
    const job = toExtractedJob(report);

    expect(job.company).toBe("BMO");
    expect(job.jobTitle).toContain("Metals & Mining");
    expect(job.location).toBe("Toronto, ON, CAN");
    expect(job.jobDescription).toBe("Selected BMO description.");
    expect(job.deadline).toBeUndefined();
    expect(job.salary).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
    expect(job.jobUrl).toBe(BMO_JOB);
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      source: "workday_selected_posting",
      rejected: [
        {
          source: "json_ld_job_posting",
          reason: "workday_structured_data_untrusted",
        },
      ],
    });
    expect(report.fields.deadline).toMatchObject({
      state: "ambiguous",
      source: "json_ld_job_posting",
      reason: "workday_structured_data_untrusted",
    });
  });

  it("does not let CIBC's structured legal employer override selected fields", () => {
    const html = `<head>${jsonLd(
      staleStructuredPosting({
        title: "Stale CIBC title",
        description: "Conflicting CIBC description.",
        validThrough: "2026-08-31",
        hiringOrganization: {
          "@type": "Organization",
          name: "Canadian Imperial Bank of Commerce (Canada)",
        },
        jobLocation: {
          "@type": "Place",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Toronto-81 Bay, 33rd Floor",
            addressCountry: "Canada",
          },
        },
      }),
    )}</head>${workdayDetail({
      title: "Project Coordinator Co-op",
      location: "Toronto, ON",
      description: "Selected CIBC description.",
      sidebar: '<img data-automation-id="image" alt="CIBC logo" />',
    })}`;

    const job = extractJob(readSitePage(html, CIBC_JOB));

    expect(job.company).toBe("CIBC");
    expect(job.jobTitle).toBe("Project Coordinator Co-op");
    expect(job.location).toBe("Toronto, ON");
    expect(job.jobDescription).toBe("Selected CIBC description.");
    expect(job.deadline).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
  });

  it("takes no Workday fields from results before a selected posting exists", () => {
    const html = `<body>
      <h1>Search for Jobs</h1><div data-automation-id="jobResults"><h2 data-automation-id="jobPostingHeader">Result-card title</h2><div data-automation-id="locations"><dl><dd>Result-card location</dd></dl></div></div>
      <aside data-automation-id="jobSidebar"><div data-automation-id="richText">BMO is a leading bank.</div></aside>
    </body>`;

    const job = extractJob(readSitePage(html, BMO_JOB));

    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.company).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
  });

  it("leaves a Workday search state blank despite a complete stale posting", () => {
    const current =
      "https://bmo.wd3.myworkdayjobs.com/en-US/details/Current_123";
    const html = `<head>
      ${jsonLd(staleStructuredPosting())}
      <meta property="og:url" content="https://bmo.wd3.myworkdayjobs.com/en-US/job/Stale_999" />
      <link rel="canonical" href="https://bmo.wd3.myworkdayjobs.com/en-US/job/Stale_999" />
    </head><body><div data-automation-id="jobResults">Search results</div></body>`;

    const report = extractJobReport(readSitePage(html, current));
    const job = toExtractedJob(report);

    expect(job.company).toBeUndefined();
    expect(job.jobTitle).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(job.deadline).toBeUndefined();
    expect(job.salary).toBeUndefined();
    expect(job.companyDomain).toBeUndefined();
    expect(job.jobUrl).toBe(current);
    expect(job.warnings).toContain("no_job_posting_found");
    expect(report.fields.jobTitle).toMatchObject({
      state: "ambiguous",
      source: "json_ld_job_posting",
    });
    // An ambiguous candidate cannot cross the compatibility boundary.
    expect(extractJob(readSitePage(html, current))).toEqual(job);
  });

  it("does not originate an employer from a tenant hostname", () => {
    const html = workdayDetail({
      title: "Analyst Intern",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar: '<img data-automation-id="image" alt="Logo" />',
    });

    expect(
      extractJob(
        readSitePage(
          html,
          "https://fakebank.wd3.myworkdayjobs.com/en-US/job/Toronto/Analyst_1",
        ),
      ).company,
    ).toBeUndefined();
  });

  it("rejects branding that conflicts with the Workday tenant", () => {
    const html = workdayDetail({
      title: "Analyst Intern",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<img data-automation-id="image" alt="Logo" /><div data-automation-id="richText">BMO is a leading bank.</div>',
    });

    expect(extractJob(readSitePage(html, CIBC_JOB)).company).toBeUndefined();
  });

  /**
   * Superseded by the general sentence-scanning fix below: a real Workday
   * "About Us" block routinely opens with a sentence of recognition or
   * marketing copy before the sentence that actually names the employer (the
   * Live Nation posting found in production QA does exactly this), so a
   * corroborating declaration is no longer required to be the very first
   * thing in the block. See "Workday company corroboration beyond an exact
   * tenant match" for the coverage that replaces this test's old intent —
   * refusing a candidate that merely *mentions* another organization, or
   * that does not corroborate the tenant at all.
   */
  it("reads a corroborating declaration even when it is not the sidebar's first sentence", () => {
    const html = workdayDetail({
      title: "Analyst Intern",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<img data-automation-id="image" alt="Logo" /><div data-automation-id="richText">Welcome. BMO is a leading bank.</div>',
    });

    expect(extractJob(readSitePage(html, BMO_JOB)).company).toBe("BMO");
  });

  it("continues rejecting Workday page furniture as a title", () => {
    const html = workdayDetail({
      title: "Search for Jobs",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar: '<img data-automation-id="image" alt="CIBC logo" />',
    });

    expect(extractJob(readSitePage(html, CIBC_JOB)).jobTitle).toBeUndefined();
  });
});

/**
 * General Workday company/domain/salary evidence, generalized beyond BMO and
 * CIBC (whose tenant slugs already equal their company name exactly) to
 * tenants where the legal name is longer than the slug — a shortened Workday
 * tenant is common, and this is the failure mode a real posting found: a
 * tenant of `livenation` beside sidebar copy stating "Live Nation
 * Entertainment" was previously rejected outright by an exact-match
 * corroboration check.
 */
describe("Workday company corroboration beyond an exact tenant match", () => {
  const NORTHBRIDGE_JOB =
    "https://northbridge.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Operations-Intern_R-4821";
  const SHORT_TENANT_JOB =
    "https://acme.wd1.myworkdayjobs.com/en-US/External/job/Toronto/Intern_R-1";

  it("corroborates a legal name that contains the tenant slug as a prefix", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics Inc. is a global leader in industrial automation.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBe(
      "Northbridge Robotics Inc.",
    );
  });

  it("does not corroborate an unrelated name merely because a short tenant appears somewhere", () => {
    // "acme" (4 chars) sits at the exact length boundary; requiring it to
    // appear as a substring of totally unrelated prose would corroborate far
    // too easily, so a 4-character tenant still needs the text to actually
    // be about it, not just contain the letters somewhere.
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-1",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Academic and community engagement matters to every intern.</div>',
    });

    expect(extractJob(readSitePage(html, SHORT_TENANT_JOB)).company).toBeUndefined();
  });

  it("still requires exact equality for a genuinely short tenant/company pair", () => {
    // Preserves the existing BMO/CIBC behavior: a short tenant that exactly
    // equals a short company name still corroborates.
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-1",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar: '<img data-automation-id="image" alt="Acme logo" />',
    });

    expect(extractJob(readSitePage(html, SHORT_TENANT_JOB)).company).toBe("Acme");
  });

  it("does not fabricate a company from the tenant slug alone, with no sidebar evidence at all", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar: "",
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBeUndefined();
  });

  it("reads a corroborating declaration after an introductory marketing sentence", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Recognized for its workplace culture. Northbridge Robotics is a global robotics company building the next generation of warehouse automation.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBe(
      "Northbridge Robotics",
    );
  });

  it("reads a corroborating declaration introduced by a comma clause, not a full sentence", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Founded in 1998, Northbridge Robotics is one of Canada\'s largest robotics employers.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBe(
      "Northbridge Robotics",
    );
  });

  it("picks the one candidate that corroborates when another organization is also named", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">The University of Toronto is a research partner. Northbridge Robotics is a global robotics company.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBe(
      "Northbridge Robotics",
    );
  });

  it("returns blank rather than choosing between two differently-worded corroborating candidates", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics is a global leader in automation. Northbridge Robotics Group is expanding rapidly across North America.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBeUndefined();
  });

  it("leaves an abbreviation-only logo insufficient with no full-name evidence anywhere", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<img data-automation-id="image" alt="NBR Logo" /><div data-automation-id="richText">We build the future of automation.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBeUndefined();
  });

  it("reads the full name from rich text alongside an abbreviation-only logo", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<img data-automation-id="image" alt="NBR Logo" /><div data-automation-id="richText">Recognized industry-wide, Northbridge Robotics is a global leader in automation.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBe(
      "Northbridge Robotics",
    );
  });

  it("falls back to the selected description when the sidebar establishes nothing", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description:
        "Recognized industry-wide, Northbridge Robotics is a global leader in automation. Apply today.",
      sidebar: "",
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBe(
      "Northbridge Robotics",
    );
  });

  it("leaves company blank with a sidebar present but no corroborating evidence in it", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">We are proud of our inclusive workplace culture.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).company).toBeUndefined();
  });
});

describe("Workday employer domain from the sidebar's own link", () => {
  const NORTHBRIDGE_JOB =
    "https://northbridge.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Operations-Intern_R-4821";

  it("accepts an explicit employer-owned link in the About Us sidebar", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics Inc. is a global leader in industrial automation. <a href="https://www.northbridgerobotics.example">www.northbridgerobotics.example</a></div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).companyDomain).toBe(
      "northbridgerobotics.example",
    );
  });

  it("rejects a Workday-hosted URL even if one appears in the sidebar", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics Inc. is hiring. <a href="https://northbridge.wd5.myworkdayjobs.com/en-US/Careers">View all openings</a></div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).companyDomain).toBeUndefined();
  });

  it("rejects a social-media link", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics Inc. is hiring. <a href="https://www.instagram.com/northbridgerobotics">Follow us</a></div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).companyDomain).toBeUndefined();
  });

  it("rejects an ATS-hosted URL, per the existing rejection policy", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics Inc. is hiring. <a href="https://boards.greenhouse.io/northbridgerobotics">More roles</a></div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).companyDomain).toBeUndefined();
  });

  it("leaves company domain unset with no employer URL evidence at all", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">Northbridge Robotics Inc. is a global leader in industrial automation.</div>',
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).companyDomain).toBeUndefined();
  });

  /**
   * Company-name resolution and domain resolution are two independent
   * pipelines: one reads corroborated declarative prose, the other reads and
   * vets an actual URL. Neither gates the other, in either direction — a
   * page can establish a trustworthy domain from an explicit link even while
   * its company-name prose stays ambiguous or entirely absent.
   */
  it("populates the domain from an explicit link even when the company name stays unresolved", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Selected description.",
      sidebar:
        '<div data-automation-id="richText">We are proud of our inclusive workplace culture. <a href="https://www.northbridgerobotics.example">www.northbridgerobotics.example</a></div>',
    });

    const job = extractJob(readSitePage(html, NORTHBRIDGE_JOB));

    expect(job.company).toBeUndefined();
    expect(job.companyDomain).toBe("northbridgerobotics.example");
  });
});

describe("Workday salary from the selected posting's own description", () => {
  const NORTHBRIDGE_JOB =
    "https://northbridge.wd5.myworkdayjobs.com/en-US/Careers/job/Toronto/Operations-Intern_R-4821";

  it("captures an explicit hourly compensation statement", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description:
        "The expected compensation for this position in Ontario is: $24/hr",
      sidebar: "",
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).salary).toBe("$24/hr");
  });

  it("captures an explicit compensation range", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Compensation for this position ranges from $20 to $25 per hour.",
      sidebar: "",
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).salary).toBe(
      "$20 to $25 per hour",
    );
  });

  it("ignores an unrelated dollar amount with no compensation context", () => {
    const html = workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "Our team has supported over $2 million in community grants.",
      sidebar: "",
    });

    expect(extractJob(readSitePage(html, NORTHBRIDGE_JOB)).salary).toBeUndefined();
  });

  it("shows a stale structured figure as rejected once the live description states one", () => {
    const html = `<head>${jsonLd({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      url: NORTHBRIDGE_JOB,
      title: "Stale backend title",
      description: "Stale backend description.",
      baseSalary: { currency: "CAD", value: { value: "999999", unitText: "YEAR" } },
    })}</head>${workdayDetail({
      title: "Operations Intern",
      requisition: "R-4821",
      location: "Toronto, ON",
      description: "The expected compensation for this position is: $24/hr",
      sidebar: "",
    })}`;

    const report = extractJobReport(readSitePage(html, NORTHBRIDGE_JOB));
    const job = toExtractedJob(report);

    expect(job.salary).toBe("$24/hr");
    expect(report.fields.salary).toMatchObject({
      state: "established",
      value: "$24/hr",
      rejected: [
        { source: "json_ld_job_posting", reason: "workday_structured_data_untrusted" },
      ],
    });
  });
});

/**
 * Regression fixture: a real Live Nation Workday posting found in production
 * manual QA. This is one integration fixture that reproduced the bug, not a
 * template — every behavior it asserts is a general rule proven independently
 * above, and no production code anywhere checks for Live Nation, "Brand
 * Partnerships", this requisition id, livenationentertainment.com, or $22/hr.
 */
describe("the Live Nation Workday posting found in production QA", () => {
  const LIVE_NATION_JOB =
    "https://livenation.wd503.myworkdayjobs.com/en-US/livenation/job/Toronto/Brand-Partnerships-Intern--Fall-2026-_JR-92460";

  const html = workdayDetail({
    title: "Brand Partnerships Intern (Fall 2026)",
    requisition: "JR-92460",
    location: "Toronto, ON",
    description: [
      "Fall 2026 Internship - Brand Partnerships",
      "The expected compensation for this position in Ontario is: $22/hr",
      "This is a full-time, fixed-term position with a minimum commitment of 37.5 hours per week.",
    ].join(" "),
    // The real page's sidebar shape, not the simplified one this fixture
    // originally used: an abbreviation-only logo ("LNE Logo", never expanded
    // by this file) and an About Us paragraph that opens with a sentence of
    // recognition/marketing copy before the sentence that actually names the
    // employer — exactly the shape that made the previous fixture pass while
    // the real page still failed.
    sidebar:
      "<img data-automation-id=\"image\" alt=\"LNE Logo\" />" +
      "<div data-automation-id=\"richText\">Recognized for seven years as a Great Place to Work and named one of Fortune's World's Most Admired Companies, Live Nation Entertainment is the world's leading live entertainment company. <a href=\"https://www.livenationentertainment.com\">www.livenationentertainment.com</a></div>",
  });

  const captured = () => extractJob(readSitePage(html, LIVE_NATION_JOB));

  it("now captures the employer from corroborated sidebar copy", () => {
    expect(captured().company).toBe("Live Nation Entertainment");
  });

  it("preserves title, location and work term", () => {
    const job = captured();

    expect(job.jobTitle).toBe("Brand Partnerships Intern (Fall 2026)");
    expect(job.location).toBe("Toronto, ON");
    expect(job.workTerm).toBe("Fall 2026");
  });

  it("now captures the explicit hourly compensation", () => {
    expect(captured().salary).toBe("$22/hr");
  });

  it("now captures the employer domain from the sidebar's own link", () => {
    expect(captured().companyDomain).toBe("livenationentertainment.com");
  });

  it("leaves work arrangement unset — the page states no explicit Remote/Hybrid/On-site", () => {
    expect(captured().workArrangement).toBeUndefined();
  });

  it("does not attempt to resolve the Part time / full-time conflict in any field", () => {
    const job = captured();

    // No employment-type field exists in the schema; the conflicting text
    // stays exactly where it was said, inside the description, untouched.
    expect(job.jobDescription).toContain("full-time, fixed-term");
    expect(job.jobDescription).toContain("37.5 hours per week");
  });
});
