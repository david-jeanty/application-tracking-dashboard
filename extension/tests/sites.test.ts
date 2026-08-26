import { describe, expect, it } from "vitest";
import { extractJob } from "../src/extractor.js";
import { canonicalPostingUrl, fieldRulesFor, siteFor } from "../src/sites.js";
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

  it("hands the collector no selectors for a site it does not know", () => {
    expect(fieldRulesFor("https://careers.example.com/job/1")).toEqual([]);
  });
});

describe("LinkedIn", () => {
  const detail = (heading: string) =>
    `<body>
       <h1>${heading}</h1>
       <div class="jobs-search__job-details">
         <h2 class="job-details-jobs-unified-top-card__job-title">Data Analyst Intern</h2>
         <div class="job-details-jobs-unified-top-card__company-name">Northwind Bank</div>
         <span class="jobs-unified-top-card__bullet">Toronto, Ontario, Canada</span>
         <div id="job-details"><p>You will build reports.</p><ul><li>SQL</li></ul></div>
       </div>
     </body>`;

  it("reads the selected posting from a job detail page", () => {
    const job = extractJob(readSitePage(detail("Jobs"), LINKEDIN_JOB));

    expect(job.company).toBe("Northwind Bank");
    expect(job.jobTitle).toBe("Data Analyst Intern");
    expect(job.location).toBe("Toronto, Ontario, Canada");
    expect(job.jobDescription).toBe("You will build reports.\nSQL");
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
    const job = extractJob(readSitePage(detail("Jobs"), LINKEDIN_SEARCH));

    expect(job.jobTitle).toBe("Data Analyst Intern");
    expect(job.jobUrl).toBe(
      "https://www.linkedin.com/jobs/view/4123456789/",
    );
  });

  it("keeps the student's own LinkedIn host when rebuilding the URL", () => {
    expect(
      canonicalPostingUrl("https://ca.linkedin.com/jobs/view/4123456789/"),
    ).toBe("https://ca.linkedin.com/jobs/view/4123456789/");
  });

  it("refuses a search page's canonical link in favour of the selected job", () => {
    const html = `<head><link rel="canonical" href="https://www.linkedin.com/jobs/search/" /></head>${detail(
      "Jobs",
    )}`;

    expect(extractJob(readSitePage(html, LINKEDIN_SEARCH)).jobUrl).toBe(
      "https://www.linkedin.com/jobs/view/4123456789/",
    );
  });

  it("leaves everything blank when the detail pane is not there", () => {
    const html = `<body><h1>Jobs</h1><div class="feed">Recommended for you</div></body>`;

    const job = extractJob(readSitePage(html, LINKEDIN_SEARCH));

    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
    expect(job.location).toBeUndefined();
    expect(job.warnings).toContain("no_job_posting_found");
    // The source is the one thing the host settles on its own.
    expect(job.source).toBe("LinkedIn");
  });

  it("ignores a job card in the results list beside the pane", () => {
    const html = `<body>
       <ul class="jobs-search-results__list">
         <li><a class="job-card-list__title">Sales Development Representative</a></li>
       </ul>
       <div class="jobs-search__job-details">
         <h2 class="job-details-jobs-unified-top-card__job-title">Data Analyst Intern</h2>
       </div>
     </body>`;

    expect(extractJob(readSitePage(html, LINKEDIN_SEARCH)).jobTitle).toBe(
      "Data Analyst Intern",
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
