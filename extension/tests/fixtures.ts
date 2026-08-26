import { collectPageSignals } from "../src/page-collector.js";
import { fieldRulesFor } from "../src/sites.js";
import type { PageSignals } from "../src/types.js";

/**
 * Small synthetic job pages, written for these tests.
 *
 * None of these is a real posting. Copying a genuine job description into a
 * repository would commit somebody else's copyrighted text to prove a parser
 * works, and a parser is proved by structure rather than by prose: the markup
 * shapes below are the ones publishers actually emit, and the words inside them
 * are invented.
 */

/**
 * Runs the real injected collector over real DOM, then states the address.
 *
 * jsdom serves every document from one origin, so the page URL — which decides
 * job-board source detection and whether a canonical link is same-host — is
 * supplied by the test rather than by the environment. Everything else here is
 * genuinely read out of the document by the code that ships.
 */
export function readPage(
  html: string,
  pageUrl = "https://careers.example.com/jobs/1",
): PageSignals {
  document.documentElement.innerHTML = html;

  return { ...collectPageSignals(), pageUrl };
}

/**
 * The same read, with the selectors a recognized site's address resolves to.
 *
 * The popup does exactly this: it decides which named read path applies from
 * the tab's address and hands the collector the resulting selectors as data.
 * Going through `fieldRulesFor` here means a test exercises the real table
 * rather than a list written beside the assertion.
 */
export function readSitePage(html: string, pageUrl: string): PageSignals {
  document.documentElement.innerHTML = html;

  return { ...collectPageSignals(fieldRulesFor(pageUrl)), pageUrl };
}

export function jsonLd(value: unknown): string {
  // `</` is escaped the way publishers escape it, because an unescaped closing
  // tag inside JSON ends the script element early and the browser never hands
  // the parser valid JSON at all.
  const json = JSON.stringify(value).replace(/<\//g, "<\\/");

  return `<script type="application/ld+json">${json}</script>`;
}

/** Raw text, for the blocks that are deliberately not valid JSON. */
export function rawJsonLd(text: string): string {
  return `<script type="application/ld+json">${text}</script>`;
}

export function page(head: string, body = "<h1>Job posting</h1>"): string {
  return `<head><title>Careers</title>${head}</head><body>${body}</body>`;
}

/**
 * The apply control a real posting has and a careers landing page does not.
 *
 * The generic fallback will not promote a heading into a job title on the word
 * of the heading alone, so a fixture that expects a title out of an
 * unstructured page has to carry the same corroboration a real one would.
 */
export function applyControl(): string {
  return '<a href="/apply">Apply now</a>';
}

/** A minimal, complete JobPosting node the individual tests vary from. */
export function jobPosting(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: "Business Technology Analyst Intern",
    description: "Work with the analytics team for a four-month term.",
    hiringOrganization: { "@type": "Organization", name: "IBM" },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Ottawa",
        addressRegion: "ON",
      },
    },
    ...overrides,
  };
}
