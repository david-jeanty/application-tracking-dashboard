import { describe, expect, it } from "vitest";

import {
  extractJob,
  extractJobReport,
  toExtractedJob,
} from "../src/extractor.js";
import {
  isAuthoritative,
  isIdentityConflict,
  normalizePostingUrl,
  routeIdentityFor,
  selectStructuredCandidate,
} from "../src/identity.js";
import { findJobPostings } from "../src/json-ld.js";
import { jobPosting, jsonLd, page, readPage, readSitePage } from "./fixtures.js";

/**
 * Correlating structured records with the posting the route names.
 *
 * The defect these cover has one shape: a page publishes more than one
 * `JobPosting`, or carries one left over from a job the student has left, and
 * the extension takes whichever appears first. Document order is an accident of
 * how a publisher assembled a page; it is not a claim about which job is on
 * screen. Every case below is therefore written so that the *wrong* answer is
 * the one document order would give.
 *
 * Two levels are asserted. `selectStructuredCandidate` is checked directly,
 * because the status it returns is the contract. The extractor is checked
 * through `extractJobReport`, because what finally matters is that a rejected
 * record supplies no value and says why.
 */

const GENERIC = "https://careers.example.com/jobs/1";

/** The candidates a page's JSON-LD offers, as the extractor sees them. */
function candidatesFor(...nodes: unknown[]) {
  return findJobPostings(nodes.map((node) => JSON.stringify(node)));
}

function selectFor(pageUrl: string, ...nodes: unknown[]) {
  return selectStructuredCandidate(
    candidatesFor(...nodes),
    routeIdentityFor(pageUrl),
  );
}

/** A posting that names itself, as a well-formed page's record does. */
function postingAt(url: string, overrides: Record<string, unknown> = {}) {
  return jobPosting({ url, ...overrides });
}

describe("structured candidate correlation", () => {
  it("takes the matching record when a stale one is published first", () => {
    const stale = postingAt("https://careers.example.com/jobs/9", {
      title: "Stale Job A",
      hiringOrganization: { "@type": "Organization", name: "Old Employer" },
    });
    const current = postingAt(GENERIC, { title: "Current Job B" });

    const selection = selectFor(GENERIC, stale, current);
    expect(selection.status).toBe("matched");
    expect(selection.node?.["title"]).toBe("Current Job B");

    const job = extractJob(
      readPage(page(`${jsonLd(stale)}${jsonLd(current)}`), GENERIC),
    );
    expect(job.jobTitle).toBe("Current Job B");
    expect(job.company).toBe("IBM");
  });

  it("takes the matching record when an unrelated one follows it", () => {
    const current = postingAt(GENERIC, { title: "Current Job B" });
    const unrelated = postingAt("https://careers.example.com/jobs/9", {
      title: "Unrelated Job A",
    });

    const selection = selectFor(GENERIC, current, unrelated);
    expect(selection.status).toBe("matched");
    expect(selection.node?.["title"]).toBe("Current Job B");

    const job = extractJob(
      readPage(page(`${jsonLd(current)}${jsonLd(unrelated)}`), GENERIC),
    );
    expect(job.jobTitle).toBe("Current Job B");
  });

  it("refuses every record when several exist and none uniquely matches", () => {
    const first = jobPosting({ title: "Anonymous One" });
    const second = jobPosting({ title: "Anonymous Two" });

    expect(selectFor(GENERIC, first, second).status).toBe("ambiguous");

    const report = extractJobReport(
      readPage(page(`${jsonLd(first)}${jsonLd(second)}`), GENERIC),
    );
    expect(report.fields.jobTitle).toMatchObject({
      state: "ambiguous",
      reason: "structured_identity_ambiguous",
    });
    expect(extractJob(readPage(page(`${jsonLd(first)}${jsonLd(second)}`), GENERIC)).jobTitle).toBeUndefined();
  });

  it("refuses both records when two of them claim the current posting", () => {
    const one = postingAt(GENERIC, { title: "Claimant One" });
    const two = postingAt(GENERIC, { title: "Claimant Two" });

    const selection = selectFor(GENERIC, one, two);
    expect(selection.status).toBe("ambiguous");
    expect(selection.node).toBeUndefined();

    const job = extractJob(
      readPage(page(`${jsonLd(one)}${jsonLd(two)}`), GENERIC),
    );
    expect(job.jobTitle).toBeUndefined();
  });

  it("evaluates every posting inside an @graph rather than the first", () => {
    const graph = {
      "@context": "https://schema.org",
      "@graph": [
        postingAt("https://careers.example.com/jobs/8", { title: "Graph Stale" }),
        postingAt(GENERIC, { title: "Graph Current" }),
      ],
    };

    const selection = selectFor(GENERIC, graph);
    expect(selection.candidates).toBe(2);
    expect(selection.status).toBe("matched");
    expect(selection.node?.["title"]).toBe("Graph Current");

    expect(extractJob(readPage(page(jsonLd(graph)), GENERIC)).jobTitle).toBe(
      "Graph Current",
    );
  });

  it("reads a schema.org PropertyValue identifier as identity", () => {
    const linkedIn = "https://www.linkedin.com/jobs/search/?currentJobId=222";
    const byPropertyValue = jobPosting({
      title: "Identified By PropertyValue",
      identifier: {
        "@type": "PropertyValue",
        name: "LinkedIn job id",
        value: "222",
      },
    });
    const other = jobPosting({
      title: "Different Requisition",
      identifier: { "@type": "PropertyValue", name: "id", value: "111" },
    });

    const selection = selectFor(linkedIn, other, byPropertyValue);
    expect(selection.status).toBe("matched");
    expect(selection.node?.["title"]).toBe("Identified By PropertyValue");
  });

  it("ignores fragments and known tracking parameters when comparing addresses", () => {
    const noisy = `${GENERIC}?utm_source=newsletter&utm_campaign=spring&fbclid=abc#apply`;
    const posting = postingAt(GENERIC, { title: "Same Posting" });

    expect(normalizePostingUrl(noisy)).toBe("careers.example.com/jobs/1");
    expect(selectFor(noisy, posting).status).toBe("matched");

    // Host case and a trailing slash are the same address too.
    expect(normalizePostingUrl("https://WWW.Careers.Example.com/jobs/1/")).toBe(
      "careers.example.com/jobs/1",
    );
  });

  it("keeps unknown query parameters identity-significant on a generic site", () => {
    const listing = "https://careers.example.com/job?id=555";
    const other = "https://careers.example.com/job?id=777";

    // `id` is not a tracker this file has heard of, so it still names the job.
    expect(selectFor(listing, postingAt(other)).status).toBe("mismatched");
    expect(selectFor(listing, postingAt(listing)).status).toBe("matched");
  });

  it("correlates a LinkedIn record against the selected currentJobId", () => {
    const route = "https://www.linkedin.com/jobs/search/?currentJobId=222";
    const matching = postingAt("https://www.linkedin.com/jobs/view/222/", {
      title: "LinkedIn Current",
    });
    const stale = postingAt("https://www.linkedin.com/jobs/view/111/", {
      title: "LinkedIn Previous",
    });

    expect(selectFor(route, matching).status).toBe("matched");
    expect(selectFor(route, stale).status).toBe("mismatched");
    expect(selectFor(route, stale, matching).node?.["title"]).toBe(
      "LinkedIn Current",
    );

    const report = extractJobReport(
      readSitePage(page(jsonLd(stale)), route),
    );
    expect(report.fields.jobTitle.state).not.toBe("established");
    expect(report.fields.jobTitle).toMatchObject({
      reason: "structured_identity_mismatch",
    });
  });

  it("correlates an Indeed record against the current job key", () => {
    const route = "https://ca.indeed.com/viewjob?jk=abc123";
    const matching = postingAt("https://ca.indeed.com/viewjob?jk=abc123", {
      title: "Indeed Current",
    });
    const stale = postingAt("https://ca.indeed.com/viewjob?jk=def456", {
      title: "Indeed Previous",
    });

    expect(selectFor(route, matching).status).toBe("matched");
    expect(selectFor(route, stale).status).toBe("mismatched");

    // The split-pane address names the same posting through `vjk`.
    const pane = "https://ca.indeed.com/jobs?q=intern&vjk=abc123";
    expect(selectFor(pane, matching).status).toBe("matched");
  });

  it("still refuses retained Workday structured data even when it correlates", () => {
    const route = "https://acme.wd1.myworkdayjobs.com/en-US/careers/job/1";
    const retained = postingAt(route, {
      title: "Retained Workday Posting",
      hiringOrganization: { "@type": "Organization", name: "Stale Employer" },
    });

    // Correlation says this record names the current address, and Workday
    // still does not get to use it: what went stale there is the record's
    // contents, not its identity.
    expect(selectFor(route, retained).status).toBe("matched");

    const report = extractJobReport(readPage(page(jsonLd(retained)), route));
    expect(report.fields.jobTitle).toMatchObject({
      state: "ambiguous",
      reason: "workday_structured_data_untrusted",
    });
    expect(extractJob(readPage(page(jsonLd(retained)), route)).jobTitle).toBeUndefined();
  });

  it("correlates microdata posting roots instead of taking the first itemscope", () => {
    const root = (url: string, title: string) => `
      <div itemscope itemtype="https://schema.org/JobPosting">
        <link itemprop="url" href="${url}" />
        <h2 itemprop="title">${title}</h2>
        <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
          <span itemprop="name">Northwind</span>
        </div>
      </div>`;

    const signals = readPage(
      page(
        "",
        `${root("https://careers.example.com/jobs/9", "Microdata Stale")}
         ${root(GENERIC, "Microdata Current")}`,
      ),
      GENERIC,
    );

    // Both roots reached the extractor; the first is no longer privileged.
    expect(signals.microdata).toHaveLength(2);
    expect(extractJob(signals).jobTitle).toBe("Microdata Current");
  });

  it("refuses a lone identity-less record, which a stale SPA can equally well hold", () => {
    const anonymous = jobPosting({ title: "Lone Anonymous Posting" });
    delete (anonymous as Record<string, unknown>)["url"];

    const selection = selectFor(GENERIC, anonymous);
    // Observable, so a partial-capture UI can explain what happened — and not
    // authoritative, because "the only record on the page" is a fact about the
    // markup rather than about the posting on screen.
    expect(selection.status).toBe("unique_unidentified");
    expect(isAuthoritative(selection)).toBe(false);
    // It is not a contradiction either: nothing disagreed with anything.
    expect(isIdentityConflict(selection)).toBe(false);

    // Read with no usable visible markup, so what is left is only what the
    // structured record was allowed to contribute: nothing.
    const report = extractJobReport(
      readPage(page(jsonLd(anonymous), "<div>No usable markup.</div>"), GENERIC),
    );
    expect(report.fields.jobTitle.state).not.toBe("established");
    expect(report.fields.company.state).not.toBe("established");
    expect(report.structuredData.identity).toBe("unique_unidentified");
  });

  it("keeps job A out of the record when route B holds one identity-less stale copy", () => {
    // The SPA moved to posting B and is still carrying exactly one record, for
    // posting A. Counting to one would have accepted it.
    const staleA = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Alpha Intern",
      description: "Work with the alpha team.",
      hiringOrganization: { "@type": "Organization", name: "Alpha Inc" },
    };
    const routeB = "https://careers.example.com/jobs/2";

    const job = extractJob(
      readPage(page(jsonLd(staleA), "<div>No usable markup.</div>"), routeB),
    );
    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    expect(JSON.stringify(job)).not.toContain("Alpha");
  });

  it("lets the visible DOM for the current posting stand when a record is unverified", () => {
    const anonymous = jobPosting({ title: "Unverifiable Record" });
    delete (anonymous as Record<string, unknown>)["url"];

    const html = page(
      `${jsonLd(anonymous)}<meta property="og:description" content="Beta team is hiring." />`,
      '<h1>Beta Data Intern</h1><a href="/apply">Apply now</a>',
    );

    const report = extractJobReport(
      readPage(html, "https://careers.example.com/jobs/beta-data-intern"),
    );

    // An unverified record contradicts nothing, so the visible page keeps its
    // ordinary role — and the record supplies none of these values.
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      value: "Beta Data Intern",
      source: "generic_fallback",
    });
    expect(report.fields.jobDescription).toMatchObject({
      state: "established",
      source: "generic_metadata",
    });
    expect(toExtractedJob(report).jobTitle).toBe("Beta Data Intern");
  });

  it("returns a blank form rather than a full capture when nothing is verifiable", () => {
    const anonymous = jobPosting({ title: "Unverifiable Record" });
    delete (anonymous as Record<string, unknown>)["url"];

    const report = extractJobReport(
      readPage(page(jsonLd(anonymous), "<div>No usable markup here.</div>"), GENERIC),
    );
    const job = toExtractedJob(report);

    expect(job.jobTitle).toBeUndefined();
    expect(job.company).toBeUndefined();
    // The candidate is preserved as rejected evidence, so a later partial UI
    // can say why the boxes are empty rather than only that they are.
    expect(report.fields.jobTitle).toMatchObject({
      state: "ambiguous",
      source: "json_ld_job_posting",
      reason: "structured_identity_unverified",
    });
    // Manual recovery, exactly as before: a form, and warnings that say what is
    // missing rather than an error.
    expect(job.warnings).toContain("missing_job_title");
    expect(job.warnings).toContain("missing_company");
  });

  it("keeps a record authoritative when its URL exactly matches the route", () => {
    const named = postingAt(GENERIC, { title: "Named By URL" });

    const selection = selectFor(GENERIC, named);
    expect(selection.status).toBe("matched");
    expect(isAuthoritative(selection)).toBe(true);

    const report = extractJobReport(readPage(page(jsonLd(named)), GENERIC));
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      value: "Named By URL",
      source: "json_ld_job_posting",
    });
  });

  it("keeps a record authoritative when a PropertyValue identifier matches the route's job id", () => {
    const route = "https://www.linkedin.com/jobs/search/?currentJobId=222";
    const named = jobPosting({
      title: "Named By Identifier",
      identifier: { "@type": "PropertyValue", name: "jobId", value: "222" },
    });
    delete (named as Record<string, unknown>)["url"];

    const selection = selectFor(route, named);
    expect(selection.status).toBe("matched");
    expect(isAuthoritative(selection)).toBe(true);

    const report = extractJobReport(readSitePage(page(jsonLd(named)), route));
    expect(report.fields.jobTitle).toMatchObject({
      state: "established",
      value: "Named By Identifier",
    });
  });

  it("does not let the generic DOM fallback paper over an identity conflict", () => {
    const one = postingAt("https://careers.example.com/jobs/8", { title: "A" });
    const two = postingAt("https://careers.example.com/jobs/9", { title: "B" });

    const html = page(
      `${jsonLd(one)}${jsonLd(two)}<meta property="og:description" content="A description of something." />`,
      '<h1>Some Heading That Is Not A Verified Title</h1><a href="/apply">Apply now</a>',
    );

    const report = extractJobReport(readPage(html, GENERIC));
    expect(report.fields.jobTitle.state).not.toBe("established");
    expect(report.fields.jobDescription.state).not.toBe("established");

    const job = extractJob(readPage(html, GENERIC));
    expect(job.jobTitle).toBeUndefined();
    expect(job.jobDescription).toBeUndefined();
    // The manual path is untouched: the popup still gets a form to fill in.
    expect(job.warnings).toContain("missing_job_title");
  });
});
