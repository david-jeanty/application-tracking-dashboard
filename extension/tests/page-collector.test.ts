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

  it("is self-contained, because Chrome injects it as source text", () => {
    const source = collectPageSignals.toString();

    // Anything the function referenced from module scope would be undefined
    // once Chrome re-evaluates this text inside the page.
    expect(source).not.toMatch(/\bimport\b|\brequire\(/);
    expect(source.startsWith("function collectPageSignals")).toBe(true);
  });
});
