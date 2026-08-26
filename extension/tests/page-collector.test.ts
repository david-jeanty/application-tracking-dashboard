import { describe, expect, it } from "vitest";
import { collectPageSignals } from "../src/page-collector.js";

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

  it("is self-contained, because Chrome injects it as source text", () => {
    const source = collectPageSignals.toString();

    // Anything the function referenced from module scope would be undefined
    // once Chrome re-evaluates this text inside the page.
    expect(source).not.toMatch(/\bimport\b|\brequire\(/);
    expect(source.startsWith("function collectPageSignals")).toBe(true);
  });
});
