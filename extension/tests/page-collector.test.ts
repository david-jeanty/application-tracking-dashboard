import { describe, expect, it } from "vitest";
import { extractJob } from "../src/extractor.js";
import { collectPageSignals } from "../src/page-collector.js";
import { readRulesFor } from "../src/sites.js";
import { isPageSignals } from "../src/types.js";

/**
 * What the injected collector is willing to take off a page.
 *
 * The headline property is what it leaves behind. Interndex never receives the
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
  /** The standalone facts the live card renders beneath its location line. */
  pills: readonly string[] = [],
) {
  const stated = pills.map((pill) => `<li>${pill}</li>`).join("");

  return `<article data-job-id="${jobId}">
    <div>
      <div><div><div><div><a href="/jobs/view/${jobId}/" aria-label="${title} with verification"><span>${title}</span><span>${duplicateTitle}</span></a></div></div></div></div>
      <div><span>${company}</span></div>
      <div><ul><li><span>${location}</span></li></ul></div>
      ${stated ? `<div><ul>${stated}</ul></div>` : ""}
    </div>
  </article>`;
}

function searchResultsHeader(jobId: string, title: string, pills = "") {
  return `<div>
    <div><div aria-label="Company, Enterprise.">Enterprise</div></div>
    <div><div data-display-contents="true"><p><a href="/jobs/view/${jobId}/?alternateChannel=search">${title}</a></p></div></div>
    <div></div>
    <p>Dollard-des-Ormeaux, QC · Reposted 2 weeks ago · 29 people clicked apply</p>
    ${pills}
    <div>Promoted by hirer · Responses managed off LinkedIn</div>
  </div>`;
}

const selectedIn = (jobId: string) =>
  `https://www.linkedin.com/jobs/search/?currentJobId=${jobId}`;

/**
 * The live `/jobs/search-results/` detail pane, in the shape real Chrome
 * renders it.
 *
 * The one thing that matters here, and the thing `searchResultsHeader` above
 * does not reproduce, is where the dedicated arrangement pill sits: the compact
 * header holds the selected job's link, its labelled employer and its location
 * line, and the pill is a *sibling block beside that header* rather than inside
 * it. That is what a DevTools reproduction of the production boundary found on
 * the live Mackenzie posting, and it is why the field came back absent.
 */
function searchResultsDetail(
  jobId: string,
  title: string,
  company: string,
  location: string,
  pills: readonly string[] = [],
  description = "",
  applyHrefs: readonly string[] = [],
) {
  const stated = pills.map((pill) => `<li><span>${pill}</span></li>`).join("");
  const apply = applyHrefs
    .map((href) => `<a aria-label="Apply" href="${href}">Apply</a>`)
    .join("");

  return `<div>
    <div>
      <div>
        <div><div aria-label="Company, ${company}.">${company}</div></div>
        <div><div data-display-contents="true"><p><a href="/jobs/view/${jobId}/?alternateChannel=search">${title}</a></p></div></div>
        <p>${location} · Reposted 1 week ago · 42 people clicked apply</p>
      </div>
      ${stated ? `<div><div><ul>${stated}</ul></div></div>` : ""}
      ${apply}
    </div>
    ${description ? `<section><h2>About the job</h2><div data-testid="expandable-text-box">${description}</div></section>` : ""}
  </div>`;
}

/**
 * A neighbouring posting in the results rail, stating its own arrangement.
 *
 * Deliberately no landmark of its own: the rail shares one plain wrapper with
 * the detail pane, so one further step of widening would reach it. That is what
 * makes these fixtures test the guard that names the selected posting rather
 * than the rule that refuses to read a page landmark.
 */
function resultsRailCard(
  jobId: string,
  title: string,
  company: string,
  pill: string,
) {
  return `<ul>
    <li data-occludable-job-id="${jobId}">
      <div aria-label="Company, ${company}.">${company}</div>
      <a href="/jobs/view/${jobId}/">${title}</a>
      <ul><li><span>${pill}</span></li></ul>
    </li>
  </ul>`;
}

describe("the injected collector", () => {
  it("keeps selected-link signals plain, bounded, and HTTP-only at the boundary", () => {
    const signals = {
      ...read("<head></head><body></body>"),
      pageUrl: "https://www.linkedin.com/jobs/view/123",
      selectedLinks: { descriptionUrls: ["https://careers.example.com/jobs/1"] },
    };

    expect(isPageSignals(signals)).toBe(true);
    expect(
      isPageSignals({
        ...signals,
        selectedLinks: { descriptionUrls: ["mailto:jobs@example.com"] },
      }),
    ).toBe(false);
  });

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
      workplaceType: "On-site",
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
      workplaceType: "Hybrid",
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
      workplaceType: "On-site",
    });

    // The neighbouring card states Hybrid. The read is bounded to the selected
    // posting, so its arrangement cannot arrive here either.
    expect(signals.siteFields?.["workplaceType"]).not.toBe("Hybrid");
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
      workplaceType: "On-site",
    });
  });

  it("preserves legitimate location parentheses before a terminal work mode", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4459045201", "Analyst Intern", "Northwind", "St. John's (NL) (Remote)")}
    </body>`;

    const signals = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4459045201",
      ),
    );

    expect(signals.siteFields?.["location"]).toBe("St. John's (NL)");
    // Only the terminal work mode is the arrangement; the province is not.
    expect(signals.siteFields?.["workplaceType"]).toBe("Remote");
  });

  it("states no arrangement when the selected posting names none", () => {
    document.documentElement.innerHTML = `<head></head><body>
      ${preloadCard("4459045202", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada")}
    </body>`;

    const signals = collectPageSignals(
      readRulesFor(
        "https://www.linkedin.com/jobs/search/?currentJobId=4459045202",
      ),
    );

    expect(signals.siteFields?.["location"]).toBe("Toronto, Ontario, Canada");
    expect(signals.siteFields).not.toHaveProperty("workplaceType");
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

  /**
   * The other shape LinkedIn states an arrangement in, and the reason this
   * follow-up exists.
   *
   * Real Chrome testing on three live postings found the arrangement rendered
   * as a standalone fact beside the location rather than as a suffix inside it,
   * and PR #30 read only the suffix. What must not change is where the fact is
   * allowed to come from: a LinkedIn page is full of other people's postings
   * saying `Remote`, and the first one on the page is almost never the selected
   * job's. Every assertion below is about that boundary.
   */
  describe("the dedicated arrangement of the selected posting", () => {
    it("reads each of the three words the selected card states", () => {
      for (const [pill, expected] of [
        ["Hybrid", "Hybrid"],
        ["Remote", "Remote"],
        ["On-site", "On-site"],
        ["(Hybrid)", "Hybrid"],
        ["Onsite", "Onsite"],
      ] as const) {
        document.documentElement.innerHTML = `<head></head><body>
          ${preloadCard("4459045210", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada", undefined, [pill])}
        </body>`;

        const signals = collectPageSignals(
          readRulesFor(selectedIn("4459045210")),
        );

        expect(signals.siteFields?.["workplaceType"]).toBe(expected);
        expect(signals.siteFields?.["location"]).toBe("Toronto, Ontario, Canada");
      }
    });

    it("never reads the employment type, or prose about flexibility", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045211", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada", undefined, [
          "Internship",
          "Full-time",
          "Part-time",
          "Contract",
          "Temporary",
          "Remote-first",
          "Hybrid flexibility",
          "Mostly remote",
          "On site occasionally",
          "Flexible",
        ])}
      </body>`;

      const signals = collectPageSignals(
        readRulesFor(selectedIn("4459045211")),
      );

      expect(signals.siteFields).not.toHaveProperty("workplaceType");
      expect(signals.siteFields?.["title"]).toBe("Analyst Intern");
    });

    it("keeps a Full-time pill beside a real one out of the answer", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045212", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada", undefined, ["Hybrid", "Full-time", "Internship"])}
      </body>`;

      expect(
        collectPageSignals(readRulesFor(selectedIn("4459045212"))).siteFields?.[
          "workplaceType"
        ],
      ).toBe("Hybrid");
    });

    it("does not let a neighbouring card's arrangement reach the selected one", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045213", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada", undefined, ["Hybrid"])}
        ${preloadCard("4000000000", "Warehouse Coordinator", "Southgate Robotics", "Mississauga, ON", undefined, ["Remote"])}
      </body>`;

      const selected = collectPageSignals(
        readRulesFor(selectedIn("4459045213")),
      );
      const theOtherOne = collectPageSignals(
        readRulesFor(selectedIn("4000000000")),
      );

      expect(selected.siteFields?.["workplaceType"]).toBe("Hybrid");
      expect(theOtherOne.siteFields?.["workplaceType"]).toBe("Remote");
    });

    it("states nothing when the selected posting states nothing and a neighbour does", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045214", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada")}
        ${preloadCard("4000000000", "Warehouse Coordinator", "Southgate Robotics", "Mississauga, ON", undefined, ["Hybrid"])}
      </body>`;

      const signals = collectPageSignals(
        readRulesFor(selectedIn("4459045214")),
      );

      expect(signals.siteFields).not.toHaveProperty("workplaceType");
      expect(signals.siteFields?.["company"]).toBe("Northwind");
    });

    it("refuses the arrangement of the Similar Jobs posting the student came from", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4443429701", "Solutions Consultant", "Exacare AI", "Remote — Canada", undefined, ["Remote"])}
        ${preloadCard("4446257399", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada", undefined, ["Hybrid"])}
      </body>`;

      expect(
        collectPageSignals(
          readRulesFor(
            "https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=4446257399&referenceJobId=4443429701",
          ),
        ).siteFields?.["workplaceType"],
      ).toBe("Hybrid");
    });

    it("records both when one card contradicts itself, and chooses neither", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045215", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada (Hybrid)", undefined, ["Remote"])}
      </body>`;

      const signals = collectPageSignals(
        readRulesFor(selectedIn("4459045215")),
      );

      // `rich-fields.ts` reads these as two candidates and refuses the field.
      expect(signals.siteFields?.["workplaceType"]).toBe("Hybrid, Remote");
      expect(signals.siteFields?.["location"]).toBe("Toronto, Ontario, Canada");
    });

    it("agrees with itself when the suffix and the pill say the same thing", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045216", "Analyst Intern", "Northwind", "Toronto, Ontario, Canada (Hybrid)", undefined, ["Hybrid"])}
      </body>`;

      expect(
        collectPageSignals(readRulesFor(selectedIn("4459045216"))).siteFields?.[
          "workplaceType"
        ],
      ).toBe("Hybrid");
    });

    it("reads the pill inside the search-results header and not beside it", () => {
      const jobId = "4432403970";
      const withoutPill = `<head></head><body><main>
        ${searchResultsHeader(jobId, "Management Trainee Internship - Fall 2026")}
        <div>Remote</div>
      </main></body>`;
      const withPill = `<head></head><body><main>
        ${searchResultsHeader(jobId, "Management Trainee Internship - Fall 2026", "<div><span>On-site</span><span>Internship</span></div>")}
        <div>Remote</div>
      </main></body>`;
      const address = `https://www.linkedin.com/jobs/search-results/?currentJobId=${jobId}`;

      document.documentElement.innerHTML = withoutPill;
      expect(
        collectPageSignals(readRulesFor(address)).siteFields,
      ).not.toHaveProperty("workplaceType");

      document.documentElement.innerHTML = withPill;
      const signals = collectPageSignals(readRulesFor(address));
      expect(signals.siteFields?.["workplaceType"]).toBe("On-site");
      expect(signals.siteFields?.["location"]).toBe("Dollard-des-Ormeaux, QC");
    });

    it("reads the pill inside a job page's own top card", () => {
      document.documentElement.innerHTML = `<head></head><body><main>
        <div>
          <div><div data-display-contents="true"><p>Analyst Intern</p></div></div>
          <div aria-label="Company, Northwind Photonics.">Northwind Photonics</div>
          <p><span>Toronto, Ontario, Canada</span><span>2 weeks ago</span></p>
          <ul><li>Hybrid</li><li>Full-time</li></ul>
        </div>
        <section><h3>More jobs for you</h3><ul><li><span>Remote</span></li></ul></section>
      </main></body>`;

      const signals = collectPageSignals(
        readRulesFor("https://www.linkedin.com/jobs/view/4123456789/"),
      );

      expect(signals.siteFields?.["workplaceType"]).toBe("Hybrid");
      expect(signals.siteFields?.["location"]).toBe("Toronto, Ontario, Canada");
      expect(signals.siteFields?.["title"]).toBe("Analyst Intern");
    });

    it("reads the pill inside the split pane's card and never the rail's", () => {
      document.documentElement.innerHTML = `<head></head><body><main>
        <section aria-label="Primary content">
          <div>
            <div data-display-contents="true"><p>Analyst Intern</p></div>
            <div aria-label="Company, Northwind Photonics."><a href="/company/northwind">Northwind Photonics</a></div>
            <div data-display-contents="true"><p><span>Boise, ID</span></p></div>
            <ul><li>Hybrid</li><li>Internship</li></ul>
          </div>
          <ul>
            <li data-occludable-job-id="4470000002" aria-label="Company, Southgate Robotics.">
              <a href="/jobs/view/4470000002/">Warehouse Coordinator</a><span>Remote</span>
            </li>
          </ul>
        </section>
      </main></body>`;

      const signals = collectPageSignals(
        readRulesFor(selectedIn("4123456789")),
      );

      expect(signals.siteFields?.["workplaceType"]).toBe("Hybrid");
      expect(signals.siteFields?.["company"]).toBe("Northwind Photonics");
      expect(signals.siteFields?.["location"]).toBe("Boise, ID");
    });

    it("never turns a location that reads `Remote` into an arrangement", () => {
      document.documentElement.innerHTML = `<head></head><body>
        ${preloadCard("4459045217", "Solutions Consultant", "Exacare AI", "Remote")}
      </body>`;

      const signals = collectPageSignals(
        readRulesFor(selectedIn("4459045217")),
      );

      expect(signals.siteFields?.["location"]).toBe("Remote");
      expect(signals.siteFields).not.toHaveProperty("workplaceType");
    });
  });

  /**
   * The live-Chrome blocker this follow-up exists for.
   *
   * PR #30's fixtures passed while real `/jobs/search-results/` still captured
   * no arrangement for a posting that renders a dedicated `Hybrid` pill. The
   * compact header the bounded read had established — the one holding the
   * selected job's link, its labelled employer and its location line — simply
   * does not contain that pill on the live page; the pill is a sibling block
   * beside it. Every case below is about the wider region that does contain it,
   * and about the rail it must still refuse to reach into.
   */
  describe("the arrangement stated outside the search-results header", () => {
    const detailPage = (
      body: string,
    ) => `<head></head><body><main>${body}</main></body>`;
    const searchResults = (jobId: string) =>
      `https://www.linkedin.com/jobs/search-results/?currentJobId=${jobId}`;

    it("reads Mackenzie's Hybrid pill from beside the compact header", () => {
      const jobId = "4457570200";
      document.documentElement.innerHTML = detailPage(
        searchResultsDetail(
          jobId,
          "Winter Intern 2027 - Value Delivery Office",
          "Mackenzie Investments",
          "Greater Toronto Area, Canada",
          ["Hybrid", "Internship"],
        ),
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.siteFields).toEqual({
        title: "Winter Intern 2027 - Value Delivery Office",
        company: "Mackenzie Investments",
        location: "Greater Toronto Area, Canada",
        workplaceType: "Hybrid",
      });
    });

    it("reads each of the three words a detail pane states beside its header", () => {
      for (const [pill, expected] of [
        ["Hybrid", "Hybrid"],
        ["Remote", "Remote"],
        ["On-site", "On-site"],
      ] as const) {
        const jobId = "4457570201";
        document.documentElement.innerHTML = detailPage(
          searchResultsDetail(
            jobId,
            "Winter Intern 2027",
            "Mackenzie Investments",
            "Greater Toronto Area, Canada",
            [pill, "Internship"],
          ),
        );

        const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

        expect(signals.siteFields?.["workplaceType"]).toBe(expected);
        expect(signals.siteFields?.["location"]).toBe(
          "Greater Toronto Area, Canada",
        );
      }
    });

    it("takes the selected posting's Hybrid over a neighbouring Remote", () => {
      const jobId = "4457570202";
      document.documentElement.innerHTML = detailPage(
        `<div>
           ${resultsRailCard("4000000000", "Warehouse Coordinator", "Southgate Robotics", "Remote")}
           ${searchResultsDetail(jobId, "Winter Intern 2027", "Mackenzie Investments", "Greater Toronto Area, Canada", ["Hybrid", "Internship"])}
         </div>`,
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.siteFields?.["workplaceType"]).toBe("Hybrid");
      expect(signals.siteFields?.["company"]).toBe("Mackenzie Investments");
      expect(JSON.stringify(signals.siteFields)).not.toContain("Southgate");
    });

    it("states nothing when only the rail states an arrangement", () => {
      const jobId = "4457570203";
      document.documentElement.innerHTML = detailPage(
        `<div>
           ${resultsRailCard("4000000000", "Warehouse Coordinator", "Southgate Robotics", "Hybrid")}
           ${searchResultsDetail(jobId, "Winter Intern 2027", "Mackenzie Investments", "Greater Toronto Area, Canada")}
         </div>`,
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.siteFields).not.toHaveProperty("workplaceType");
      expect(signals.siteFields?.["company"]).toBe("Mackenzie Investments");
      expect(signals.siteFields?.["location"]).toBe(
        "Greater Toronto Area, Canada",
      );
    });

    it("refuses a second detail pane's arrangement on the same page", () => {
      const jobId = "4457570204";
      document.documentElement.innerHTML = detailPage(
        `${searchResultsDetail("4443429701", "Solutions Consultant", "Exacare AI", "Remote — Canada", ["Remote"])}
         ${searchResultsDetail(jobId, "Winter Intern 2027", "Mackenzie Investments", "Greater Toronto Area, Canada", ["Hybrid"])}`,
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.siteFields?.["company"]).toBe("Mackenzie Investments");
      expect(signals.siteFields?.["workplaceType"]).toBe("Hybrid");
    });

    it("never reads an arrangement word out of the job description", () => {
      const jobId = "4457570205";
      document.documentElement.innerHTML = detailPage(
        searchResultsDetail(
          jobId,
          "Winter Intern 2027",
          "Mackenzie Investments",
          "Greater Toronto Area, Canada",
          [],
          "<ul><li>Remote</li><li>Hybrid</li></ul>",
        ),
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.siteFields).not.toHaveProperty("workplaceType");
      expect(signals.siteFields?.["description"]).toBe(
        "<ul><li>Remote</li><li>Hybrid</li></ul>",
      );
    });

    it("keeps the employment type out of the answer beside a real pill", () => {
      const jobId = "4457570206";
      document.documentElement.innerHTML = detailPage(
        searchResultsDetail(
          jobId,
          "Winter Intern 2027",
          "Mackenzie Investments",
          "Greater Toronto Area, Canada",
          ["Internship", "Full-time", "Hybrid", "Contract"],
        ),
      );

      expect(
        collectPageSignals(readRulesFor(searchResults(jobId))).siteFields?.[
          "workplaceType"
        ],
      ).toBe("Hybrid");
    });
  });

  describe("Apply outside the search-results header", () => {
    const searchResults = (jobId: string) =>
      `https://www.linkedin.com/jobs/search-results/?currentJobId=${jobId}`;
    const detailPage = (body: string) => `<head></head><body><main>${body}</main></body>`;
    const BNP_APPLY =
      "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fwww.bnpparibas.ca%2Fen%2Fjobs%2Fdata-analyst-intern%2F&urlhash=test&isSdui=true";

    it("collects BNP Paribas's selected Apply link outside the compact header", () => {
      const jobId = "5550000001";
      document.documentElement.innerHTML = detailPage(
        searchResultsDetail(
          jobId,
          "Data Analyst Intern",
          "BNP Paribas",
          "Montreal, QC",
          [],
          "",
          [BNP_APPLY],
        ),
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.selectedLinks?.applyUrl).toBe(BNP_APPLY);
      expect(extractJob({ ...signals, pageUrl: searchResults(jobId) }).companyDomain).toBe(
        "bnpparibas.ca",
      );
    });

    it("does not take a neighbouring job's Apply link", () => {
      const jobId = "5550000002";
      document.documentElement.innerHTML = detailPage(
        `<div>
          ${searchResultsDetail(jobId, "Data Analyst Intern", "BNP Paribas", "Montreal, QC")}
          <div data-occludable-job-id="4000000000">
            <a href="/jobs/view/4000000000/">Neighbouring role</a>
            <a aria-label="Apply" href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fneighbor.example%2Fjobs%2F1">Apply</a>
          </div>
        </div>`,
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.selectedLinks?.applyUrl).toBeUndefined();
      expect(extractJob({ ...signals, pageUrl: searchResults(jobId) }).companyDomain).toBeUndefined();
    });

    it.each([
      ["a stale data-job-id", 'data-job-id="4000000001"'],
      ["a virtualized rail marker", 'data-occludable-job-id="4000000001"'],
    ])("does not read Apply from an unsafe ancestor itself marked as %s", (_label, marker) => {
      const jobId = "5550000006";
      document.documentElement.innerHTML = detailPage(
        `<div ${marker}>
          ${searchResultsDetail(jobId, "Data Analyst Intern", "BNP Paribas", "Montreal, QC")}
          <a aria-label="Apply" href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fneighbor.example%2Fjobs%2F1">Apply</a>
        </div>`,
      );

      const signals = collectPageSignals(readRulesFor(searchResults(jobId)));

      expect(signals.selectedLinks?.applyUrl).toBeUndefined();
      expect(extractJob({ ...signals, pageUrl: searchResults(jobId) }).companyDomain).toBeUndefined();
    });

    it.each([
      [
        "another posting link",
        `<a href="/jobs/view/4000000001/">Neighbouring role</a>
         <a aria-label="Apply" href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fneighbor.example%2Fjobs%2F1">Apply</a>`,
      ],
      [
        "a virtualized result rail",
        `<div data-occludable-job-id="4000000001">
           <a aria-label="Apply" href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fneighbor.example%2Fjobs%2F1">Apply</a>
         </div>`,
      ],
      [
        "a Similar Jobs region",
        `<div id="similarJobs">
           <a aria-label="Apply" href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fneighbor.example%2Fjobs%2F1">Apply</a>
         </div>`,
      ],
    ])("aborts before reading Apply from %s", (_label, unsafe) => {
      const jobId = "5550000003";
      document.documentElement.innerHTML = detailPage(
        `<div>${searchResultsDetail(jobId, "Data Analyst Intern", "BNP Paribas", "Montreal, QC")}${unsafe}</div>`,
      );

      expect(
        collectPageSignals(readRulesFor(searchResults(jobId))).selectedLinks?.applyUrl,
      ).toBeUndefined();
    });

    it("does not read Apply from a page landmark", () => {
      const jobId = "5550000004";
      document.documentElement.innerHTML = detailPage(
        `${searchResultsDetail(jobId, "Data Analyst Intern", "BNP Paribas", "Montreal, QC")}
         <a aria-label="Apply" href="https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fneighbor.example%2Fjobs%2F1">Apply</a>`,
      );

      expect(
        collectPageSignals(readRulesFor(searchResults(jobId))).selectedLinks?.applyUrl,
      ).toBeUndefined();
    });

    it("leaves multiple selected Apply destinations ambiguous", () => {
      const jobId = "5550000005";
      document.documentElement.innerHTML = detailPage(
        searchResultsDetail(
          jobId,
          "Data Analyst Intern",
          "BNP Paribas",
          "Montreal, QC",
          [],
          "",
          [
            BNP_APPLY,
            "https://www.linkedin.com/safety/go/?url=https%3A%2F%2Fwww.bnpparibas.com%2Fen%2Fjobs%2F1",
          ],
        ),
      );

      expect(
        collectPageSignals(readRulesFor(searchResults(jobId))).selectedLinks?.applyUrl,
      ).toBeUndefined();
    });
  });

  it("is self-contained, because Chrome injects it as source text", () => {
    const source = collectPageSignals.toString();

    // Anything the function referenced from module scope would be undefined
    // once Chrome re-evaluates this text inside the page.
    expect(source).not.toMatch(/\bimport\b|\brequire\(/);
    expect(source.startsWith("function collectPageSignals")).toBe(true);
  });
});
