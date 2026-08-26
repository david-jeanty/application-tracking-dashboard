import { describe, expect, it } from "vitest";
import { collectPageSignals } from "../src/page-collector.js";
import { readRulesFor } from "../src/sites.js";

/**
 * What the injected collector is willing to take off a page.
 *
 * The headline property is what it leaves behind. JobTrack never receives the
 * page's DOM, its body text, its scripts, or the assorted tracking metadata a
 * job board puts in its head — only the structured data, a short allowlist of
 * standard metadata, and two headings.
 */

function read(html: string) {
  document.documentElement.innerHTML = html;

  return collectPageSignals();
}

function preloadCard(
  jobId: string,
  title: string,
  company: string,
  location: string,
  duplicateTitle = title,
) {
  return `<article data-job-id="${jobId}">
    <div>
      <div><div><div><div><a href="/jobs/view/${jobId}/" aria-label="${title} with verification"><span>${title}</span><span>${duplicateTitle}</span></a></div></div></div></div>
      <div><span>${company}</span></div>
      <div><ul><li><span>${location}</span></li></ul></div>
    </div>
  </article>`;
}

function searchResultsHeader(jobId: string, title: string) {
  return `<div>
    <div><div aria-label="Company, Enterprise.">Enterprise</div></div>
    <div><div data-display-contents="true"><p><a href="/jobs/view/${jobId}/?alternateChannel=search">${title}</a></p></div></div>
    <div></div>
    <p>Dollard-des-Ormeaux, QC · Reposted 2 weeks ago · 29 people clicked apply</p>
    <div>Promoted by hirer · Responses managed off LinkedIn</div>
  </div>`;
}

describe("the injected collector", () => {
  it("takes structured data, the canonical link, and standard metadata", () => {
    const signals = read(
      `<head>
         <title>Analyst Intern — Careers</title>
         <link rel="canonical" href="https://careers.example.com/jobs/1" />
         <meta property="og:title" content="Analyst Intern" />
         <meta name="description" content="A four-month term." />
         <script type="application/ld+json">{"@type":"JobPosting"}</script>
       </head>
       <body><h1>Analyst Intern</h1><p>Body copy</p></body>`,
    );

    expect(signals.jsonLdBlocks).toEqual(['{"@type":"JobPosting"}']);
    expect(signals.canonicalUrl).toBe("https://careers.example.com/jobs/1");
    expect(signals.meta["og:title"]).toBe("Analyst Intern");
    expect(signals.meta["description"]).toBe("A four-month term.");
    expect(signals.headingText).toBe("Analyst Intern");
    expect(signals.documentTitle).toBe("Analyst Intern — Careers");
  });

  it("leaves the page's body out entirely", () => {
    const signals = read(
      "<head></head><body><p>Something the student was reading</p></body>",
    );

    expect(JSON.stringify(signals)).not.toContain("Something the student");
  });

  it("ignores metadata outside its allowlist", () => {
    const signals = read(
      `<head>
         <meta name="visitor-id" content="9f3a-tracking-identifier" />
         <meta property="fb:app_id" content="123456" />
         <meta name="description" content="Kept." />
       </head><body></body>`,
    );

    expect(Object.keys(signals.meta)).toEqual(["description"]);
  });

  it("takes no more than twenty structured-data blocks", () => {
    const signals = read(
      `<head>${'<script type="application/ld+json">{"@type":"Thing"}</script>'.repeat(50)}</head><body></body>`,
    );

    expect(signals.jsonLdBlocks).toHaveLength(20);
  });

  it("returns usable signals for a page with nothing at all in its head", () => {
    const signals = read("<head></head><body></body>");

    expect(signals.jsonLdBlocks).toEqual([]);
    expect(signals.meta).toEqual({});
    expect(signals.canonicalUrl).toBeUndefined();
    expect(signals.headingText).toBeUndefined();
  });

  it("reads JobPosting microdata as dotted property paths", () => {
    const signals = read(
      `<head></head><body>
         <div itemscope itemtype="https://schema.org/JobPosting">
           <h1 itemprop="title">Analytics Intern</h1>
           <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
             <span itemprop="name">Beacon Aerospace</span>
           </div>
         </div>
       </body>`,
    );

    expect(signals.microdata?.["title"]).toBe("Analytics Intern");
    expect(signals.microdata?.["hiringOrganization.name"]).toBe(
      "Beacon Aerospace",
    );
    expect(signals.evidence?.jobPostingMicrodata).toBe(true);
  });

  it("leaves microdata belonging to something other than the posting alone", () => {
    const signals = read(
      `<head></head><body>
         <div itemscope itemtype="https://schema.org/BreadcrumbList">
           <span itemprop="name">All openings</span>
         </div>
         <div itemscope itemtype="https://schema.org/JobPosting">
           <h1 itemprop="title">Analytics Intern</h1>
         </div>
       </body>`,
    );

    expect(signals.microdata).toEqual({ title: "Analytics Intern" });
  });

  it("notices an apply control without ever storing its words", () => {
    const withApply = read(
      '<head></head><body><button>Apply now</button></body>',
    );
    const without = read(
      '<head></head><body><button>Save this job</button></body>',
    );

    expect(withApply.evidence?.applyAffordance).toBe(true);
    expect(without.evidence?.applyAffordance).toBe(false);
    expect(JSON.stringify(withApply)).not.toContain("Apply now");
  });

  it("collects nothing site-specific when it is handed no rules", () => {
    const signals = read(
      '<head></head><body><h2 data-testid="jobsearch-JobInfoHeader-title">Co-op</h2></body>',
    );

    expect(signals.siteFields).toBeUndefined();
  });

  it("takes the first selector that matches, in the order the site lists them", () => {
    document.documentElement.innerHTML =
      `<head></head><body>
         <h2 class="jobsearch-JobInfoHeader-title">Older markup</h2>
         <h2 data-testid="jobsearch-JobInfoHeader-title">Current markup</h2>
       </body>`;

    const signals = collectPageSignals(
      readRulesFor("https://ca.indeed.com/viewjob?jk=abc123"),
    );

    expect(signals.siteFields?.["title"]).toBe("Current markup");
  });

  /**
   * The collector holds the mechanics of LinkedIn's relational read, but never
   * decides to use them. A page it is handed no strategy for is read
   * generically, whatever its markup happens to look like.
   */
  it("performs no relational read unless it is told to", () => {
    document.documentElement.innerHTML = `<head></head><body>
       <div aria-label="Company, Northwind Photonics.">Northwind Photonics</div>
     </body>`;

    expect(collectPageSignals().siteFields).toBeUndefined();
    expect(collectPageSignals({ fields: [] }).siteFields).toBeUndefined();
  });

  it("runs the LinkedIn read only for the site that asks for it", () => {
    document.documentElement.innerHTML = `<head></head><body><main>
       <div aria-label="Company, Northwind Photonics.">Northwind Photonics</div>
     </main></body>`;

    const linkedin = collectPageSignals(
      readRulesFor("https://www.linkedin.com/jobs/view/4123456789/"),
    );
    const workday = collectPageSignals(
      readRulesFor("https://acme.wd3.myworkdayjobs.com/en-US/External/job/x"),
    );

    expect(linkedin.siteFields?.["company"]).toBe("Northwind Photonics");
    expect(workday.siteFields).toBeUndefined();
  });

  /**
   * The collector implements both LinkedIn reads and chooses neither. Which one
   * a page gets is `sites.ts`'s answer, arriving as data — and the two reads
   * genuinely differ, so the same markup gives different answers.
   */
  it("takes the strategy and the selected job as data", () => {
    document.documentElement.innerHTML = `<head></head><body><main>
       <div aria-label="Company, Northwind Photonics.">Northwind Photonics</div>
     </main></body>`;

    const splitPane = readRulesFor(
      "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4446257399&referenceJobId=4443429701",
    );

    expect(splitPane.strategy).toBe("linkedin-split-pane");
    expect(splitPane.jobId).toBe("4446257399");

    // No Primary content region here, so the bounded read establishes nothing
    // — which is correct, and not what the job-page read does with the same
    // markup.
    expect(collectPageSignals(splitPane).siteFields).toBeUndefined();
    expect(
      collectPageSignals(
        readRulesFor("https://www.linkedin.com/jobs/view/4446257399/"),
      ).siteFields?.["company"],
    ).toBe("Northwind Photonics");
  });

  /**
   * The bounded read is bounded by the region and by the selected posting, and
   * it is handed both. Given the same document and a different `currentJobId`,
   * the pane that names another job is no longer the pane it may read.
   */
  it("uses the selected job to tell the pane from a neighbour's markup", () => {
    const pane = (jobId: string, company: string) => `
      <div data-job-id="${jobId}">
        <div data-display-contents="true"><p>Optics Test Technician</p></div>
        <div aria-label="Company, ${company}.">${company}</div>
      </div>`;

    document.documentElement.innerHTML = `<head></head><body><main>
       <section aria-label="Primary content">
         ${pane("4446257399", "Northwind Photonics")}
       </section>
     </main></body>`;

    const selected = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4446257399",
      ),
    );
    const someoneElse = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4459003223",
      ),
    );

    expect(selected.siteFields?.["company"]).toBe("Northwind Photonics");
    expect(someoneElse.siteFields).toBeUndefined();
  });

  /** The selected `/preload/` card has no Primary-content landmark. */
  it("reads the selected GE preload card without leaking a neighbouring job", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4000000000", "Wrong title", "Wrong Co", "Elsewhere, ON (Remote)")}
      ${preloadCard("4459003223", "GE Vernova Controls Product Management Intern - Summer 2027", "GE Vernova", "Greenville, SC (On-site)", "GE Vernova Controls Product Management Intern - Summer 2027 with verification")}
      <section id="job-details"><h2> About the job </h2><p>GE description</p></section>
      <article>Arbitrary iframe text must not become a description.</article>
    </body>`;

    const signals = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4459003223",
      ),
    );

    expect(signals.siteFields).toEqual({
      title: "GE Vernova Controls Product Management Intern - Summer 2027",
      company: "GE Vernova",
      location: "Greenville, SC",
      description: "<p>GE description</p>",
    });
    expect(JSON.stringify(signals.siteFields)).not.toContain("verification");
    expect(JSON.stringify(signals.siteFields)).not.toContain("Alumni");
  });

  it("reads the selected IBM preload card and fails blank without job details", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4446257399", "Senior Managing Consultant SAP HANA SD OTC", "IBM", "Vancouver, BC (Hybrid)", "Senior Managing Consultant SAP HANA SD OTC with verification")}
      ${preloadCard("4470000002", "Wrong title", "Wrong company", "Elsewhere, ON (Remote)")}
      <div>Arbitrary iframe description</div>
    </body>`;

    const signals = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4446257399&referenceJobId=4443429701",
      ),
    );

    expect(signals.siteFields).toEqual({
      title: "Senior Managing Consultant SAP HANA SD OTC",
      company: "IBM",
      location: "Vancouver, BC",
    });
    expect(JSON.stringify(signals)).not.toContain("Arbitrary iframe description");
  });

  it("takes KPMG's employer and location from title-wrapper siblings", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4454844474", "QC - Intern Strategy & Economy - 2027", "KPMG Canada", "Montreal, QC (On-site)", "QC - Intern Strategy & Economy - 2027 with verification")}
      ${preloadCard("4000000000", "Neighbouring title", "Neighbouring employer", "Toronto, ON (Hybrid)")}
    </body>`;

    const signals = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4454844474",
      ),
    );

    expect(signals.siteFields).toEqual({
      title: "QC - Intern Strategy & Economy - 2027",
      company: "KPMG Canada",
      location: "Montreal, QC",
    });
  });

  it("takes Mitsubishi's employer rather than its duplicate title", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4459045200", "Project Management Internship", "Mitsubishi Power Americas", "Orlando, FL (On-site)")}
    </body>`;

    const signals = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4459045200",
      ),
    );

    expect(signals.siteFields).toEqual({
      title: "Project Management Internship",
      company: "Mitsubishi Power Americas",
      location: "Orlando, FL",
    });
  });

  it("preserves legitimate location parentheses before a terminal work mode", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4459045201", "Analyst Intern", "Northwind", "St. John's (NL) (Remote)")}
    </body>`;

    expect(
      collectPageSignals(
        readRulesFor(
          "https://www.linkedin.com/jobs/search/?currentJobId=4459045201",
        ),
      ).siteFields?.["location"],
    ).toBe("St. John's (NL)");
  });

  it("reads the exact Enterprise search-results header, not its rail", () => {
    const jobId = "4432403970";
    document.documentElement.innerHTML = `<head>
      <link rel="canonical" href="https://www.linkedin.com/jobs/view/${jobId}/" />
    </head><body><main>
      <aside>
        <div aria-label="Company, Neighbour Corp.">Neighbour Corp</div>
        <a href="/jobs/view/4000000000/">Neighbouring rail title</a>
        <p>Toronto, ON · 10 applicants</p>
      </aside>
      ${searchResultsHeader(jobId, "Management Trainee Internship - Fall 2026")}
      <div>On-site</div>
      <section><div>Premium furniture</div><h2>About the job</h2><div data-testid="expandable-text-box"><p>Enterprise description</p></div></section>
    </main></body>`;

    const signals = collectPageSignals(
      readRulesFor(
        `https://www.linkedin.com/jobs/search-results/?currentJobId=${jobId}`,
      ),
    );

    expect(signals.siteFields).toEqual({
      title: "Management Trainee Internship - Fall 2026",
      company: "Enterprise",
      location: "Dollard-des-Ormeaux, QC",
      description: "<p>Enterprise description</p>",
    });
    expect(signals.canonicalUrl).toBe(
      `https://www.linkedin.com/jobs/view/${jobId}/`,
    );
    expect(JSON.stringify(signals.siteFields)).not.toContain("Neighbour");
    expect(JSON.stringify(signals.siteFields)).not.toContain("Reposted");
    expect(JSON.stringify(signals.siteFields)).not.toContain("29 people");
  });

  it("requires an exact selected-job link for the search-results fallback", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${searchResultsHeader("4000000000", "Wrong rail job")}
      <div aria-label="Company, Wrong Job Company.">Wrong Job Company</div>
    </body>`;

    expect(
      collectPageSignals(
        readRulesFor(
          "https://www.linkedin.com/jobs/search-results/?currentJobId=4432403970",
        ),
      ).siteFields,
    ).toBeUndefined();
  });

  it("does not use a wrong preload marker when no selected root exists", () => {
    document.documentElement.innerHTML = `<head></head><body>
      <article data-job-id="4446257390">
        <a href="/jobs/view/4446257399/"><span>Wrongly marked job</span><span>Wrong Co</span><span>Ottawa, ON (Remote)</span></a>
      </article>
      <section id="job-details"><h2>About the job</h2><p>Wrong description</p></section>
    </body>`;

    expect(
      collectPageSignals(
        readRulesFor(
          "https://www.linkedin.com/jobs/search/?currentJobId=4446257399",
        ),
      ).siteFields,
    ).toBeUndefined();
  });

  it("is self-contained, because Chrome injects it as source text", () => {
    const source = collectPageSignals.toString();

    // Anything the function referenced from module scope would be undefined
    // once Chrome re-evaluates this text inside the page.
    expect(source).not.toMatch(/\bimport\b|\brequire\(/);
    expect(source.startsWith("function collectPageSignals")).toBe(true);
  });
});
