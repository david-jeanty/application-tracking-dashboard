import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LinkedInFrameEvidence } from "../src/linkedin-frames.js";
import type { PageSignals } from "../src/types.js";

/**
 * The identity guard as `popup.ts` actually wires it, not as the coordinator
 * exposes it.
 *
 * The coordinator's own suite proves the rules. This one proves the wiring: the
 * real `popup.ts` module is imported, running its real `start()`, against a
 * stubbed `chrome` and the real `popup.html`. Nothing is faked between the tab
 * and the save message — the site rules, the collector's contract, the
 * extractor, the reducer and the renderer are all the shipped ones.
 *
 * What it is here to catch is the failure the unit tests structurally cannot: a
 * guard that is correct in isolation and bypassed at the call site. The
 * assertion that matters is always the same one — what, if anything, reached
 * `{ type: "capture" }`.
 *
 * The stub separates the frame probe from the collection, because they are two
 * `executeScript` calls with two different checkpoints after them, and a stub
 * that answered both from one queue would let a test pass without the guard
 * doing anything. Each case below fails if its checkpoint is removed.
 */

const markup = readFileSync(join(import.meta.dirname, "../popup.html"), "utf8");

const TAB = 7;
/** Generic postings: no recognized site, so no frame probe and one read. */
const PAGE_A = "https://careers.example.com/postings/alpha";
const PAGE_B = "https://careers.example.com/postings/beta";
/** A LinkedIn split pane, where the frame probe runs before the read. */
const JOB_A = "https://www.linkedin.com/jobs/search/?currentJobId=111";
const JOB_B = "https://www.linkedin.com/jobs/search/?currentJobId=222";

/** A page whose JSON-LD names one posting, as a real job page would. */
function signalsFor(company: string, title: string, url: string): PageSignals {
  return {
    jsonLdBlocks: [
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "JobPosting",
        // A real posting names itself, and an unnamed one now establishes
        // nothing, so a fixture standing in for a good page has to say which
        // posting it is.
        url,
        title,
        hiringOrganization: { "@type": "Organization", name: company },
        description: "Work with the analytics team.",
      }),
    ],
    meta: {},
    pageUrl: url,
  };
}

function frameEvidence(url: string): LinkedInFrameEvidence {
  return {
    frameUrl: url,
    currentIdLinks: 1,
    dataJobId: true,
    dataOccludableJobId: false,
    dataEntityUrn: false,
  };
}

type Message = { type: string; record?: Record<string, unknown> };

type Injection = { target: { tabId: number; allFrames?: boolean } };

type Harness = {
  /** Every message the popup sent to the background worker, in order. */
  sent: Message[];
  /** The capture payloads only — what actually reached the tracker. */
  captures: Message[];
  /** How many times each phase was injected. */
  counts: { probes: number; collects: number };
};

function install(options: {
  url: string;
  /** Runs when the frame probe is injected, before it answers. */
  onProbe?: (setUrl: (url: string) => void) => void;
  /** Runs when the collector is injected, before it answers. */
  onCollect?: (setUrl: (url: string) => void) => void;
  collect: () => Promise<PageSignals | undefined>;
}): Harness {
  let url = options.url;
  const setUrl = (next: string) => {
    url = next;
  };
  const sent: Message[] = [];
  const counts = { probes: 0, collects: 0 };

  const stub = {
    runtime: {
      sendMessage: async (message: Message) => {
        sent.push(message);
        if (message.type === "connection-state") return { connected: true };
        if (message.type === "connect") return { status: "connected" };
        if (message.type === "capture") {
          return {
            kind: "created",
            application: {
              company: String(message.record?.["company"] ?? ""),
              jobTitle: "",
              url: "https://interndex.example/applications/a1",
            },
          };
        }

        return undefined;
      },
    },
    tabs: {
      query: async () => [{ id: TAB, url }],
    },
    scripting: {
      executeScript: async (injection: Injection) => {
        if (injection.target.allFrames) {
          counts.probes += 1;
          options.onProbe?.(setUrl);

          return [{ frameId: 0, result: frameEvidence(url) }];
        }

        counts.collects += 1;
        options.onCollect?.(setUrl);

        return [{ frameId: 0, result: await options.collect() }];
      },
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    writable: true,
    value: stub,
  });

  return {
    sent,
    counts,
    get captures() {
      return sent.filter((message) => message.type === "capture");
    },
  };
}

/** Lets every pending microtask and zero-delay timer settle. */
async function settle(rounds = 8): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** Imports the popup fresh, which is what opening it again means. */
async function openPopup(): Promise<void> {
  vi.resetModules();
  await import("../src/popup.js");
  await settle();
}

function visiblePanels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-panel]"))
    .filter((panel) => !panel.hidden)
    .map((panel) => panel.dataset["panel"] ?? "");
}

function companyField(): string | undefined {
  return document.querySelector<HTMLInputElement>("#company")?.value;
}

/** Presses Save the way a student would, whatever state the popup is in. */
function submit(): void {
  document
    .getElementById("capture-form")
    ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

beforeEach(() => {
  document.documentElement.innerHTML = markup;
});

afterEach(() => {
  vi.resetModules();
});

describe("popup capture, end to end", () => {
  it("saves a posting that stayed put for the whole read", async () => {
    const harness = install({
      url: PAGE_A,
      collect: async () => signalsFor("Northwind", "Data Intern", PAGE_A),
    });

    await openPopup();

    expect(visiblePanels()).toEqual(["ready"]);
    expect(companyField()).toBe("Northwind");

    submit();
    await settle();

    expect(harness.captures).toHaveLength(1);
    expect(harness.captures[0]?.record).toMatchObject({
      company: "Northwind",
      job_title: "Data Intern",
    });
  });

  it("sends nothing when the posting changed while the collector was reading", async () => {
    const harness = install({
      url: PAGE_A,
      // The address moves on while the collector is inside the page. What comes
      // back is a complete, savable reading — of the posting they left.
      onCollect: (setUrl) => setUrl(PAGE_B),
      collect: async () => signalsFor("Alpha Inc", "Alpha Intern", PAGE_A),
    });

    await openPopup();

    expect(harness.counts.collects).toBe(1);
    expect(visiblePanels()).toEqual(["extraction_failed"]);
    expect(document.getElementById("extraction-error")?.textContent).toContain(
      "changed while Interndex was reading it",
    );

    // There is no form to submit, and pressing Save anyway changes nothing.
    submit();
    await settle();

    expect(harness.captures).toHaveLength(0);
    expect(JSON.stringify(harness.sent)).not.toContain("Alpha Inc");
  });

  it("never collects from a frame chosen for the posting the student just left", async () => {
    const harness = install({
      url: JOB_A,
      // The selection moves while every document in the tab is being probed.
      onProbe: (setUrl) => setUrl(JOB_B),
      collect: async () => signalsFor("Alpha Inc", "Alpha Intern", JOB_A),
    });

    await openPopup();

    expect(harness.counts.probes).toBe(1);
    // The checkpoint between the two phases stopped this before any injection
    // into the chosen frame.
    expect(harness.counts.collects).toBe(0);
    expect(visiblePanels()).toEqual(["extraction_failed"]);

    submit();
    await settle();

    expect(harness.captures).toHaveLength(0);
  });

  it("sends nothing when the tab reports an address it cannot identify", async () => {
    const harness = install({
      url: "chrome://extensions",
      collect: async () => signalsFor("Alpha Inc", "Alpha Intern", PAGE_A),
    });

    await openPopup();

    expect(harness.counts.collects).toBe(0);
    expect(visiblePanels()).toEqual(["extraction_failed"]);

    submit();
    await settle();

    expect(harness.captures).toHaveLength(0);
    expect(JSON.stringify(harness.sent)).not.toContain("Alpha Inc");
  });

  it("saves the newest posting, never the superseded read that finished after it", async () => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let call = 0;

    const harness = install({
      url: PAGE_A,
      collect: async () => {
        call += 1;
        if (call === 1) {
          // The first capture stalls inside the collector.
          await held;

          return signalsFor("Alpha Inc", "Alpha Intern", PAGE_A);
        }

        return signalsFor("Beta Corp", "Beta Intern", PAGE_A);
      },
    });

    // `start()` began capture one, and it is still hanging.
    vi.resetModules();
    void import("../src/popup.js");
    await settle();
    expect(visiblePanels()).toEqual(["extracting"]);

    // Reconnecting starts capture two, which supersedes it and finishes first.
    document.getElementById("connect")?.dispatchEvent(new Event("click"));
    await settle();
    expect(companyField()).toBe("Beta Corp");

    // Now the stalled first read comes back, carrying the older posting.
    release?.();
    await settle();

    // It must not have overwritten the form the newer capture filled.
    expect(visiblePanels()).toEqual(["ready"]);
    expect(companyField()).toBe("Beta Corp");

    submit();
    await settle();

    expect(harness.captures).toHaveLength(1);
    expect(harness.captures[0]?.record).toMatchObject({ company: "Beta Corp" });
    expect(JSON.stringify(harness.sent)).not.toContain("Alpha Inc");
  });

  it("shows and saves nothing when the page's JSON-LD names a different posting", async () => {
    const stale = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      // The record left behind for the posting the student navigated away from.
      url: "https://careers.example.com/postings/alpha",
      title: "Alpha Intern",
      hiringOrganization: { "@type": "Organization", name: "Alpha Inc" },
      description: "Work with the alpha team.",
    };

    const harness = install({
      // The student is on posting B; the page still carries A's record.
      url: PAGE_B,
      collect: async () => ({
        jsonLdBlocks: [JSON.stringify(stale)],
        meta: { "og:description": "Alpha Inc is hiring." },
        pageUrl: PAGE_B,
      }),
    });

    await openPopup();
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    await settle();

    // A form, because the route was verified and manual entry still works —
    // but none of job A's values in it, and nothing enabled to save.
    expect(visiblePanels()).toEqual(["ready"]);
    expect(companyField()).toBe("");
    expect(
      document.querySelector<HTMLInputElement>("#job-title")?.value,
    ).toBe("");
    expect(document.querySelector<HTMLButtonElement>("#save")?.disabled).toBe(
      true,
    );

    submit();
    await settle();

    expect(harness.captures).toHaveLength(0);
    expect(JSON.stringify(harness.sent)).not.toContain("Alpha");
  });

  it("still hands over a savable form when the page identified but said nothing", async () => {
    const harness = install({
      url: PAGE_A,
      // A verified page that yielded no fields: the manual-entry path.
      collect: async () => ({ jsonLdBlocks: [], meta: {}, pageUrl: PAGE_A }),
    });

    const startedAt = Date.now();
    await openPopup();
    // The readiness re-read runs on real timers here, so this also measures
    // what an unsupported page actually costs a student.
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
    await settle();

    expect(harness.counts.collects).toBe(2);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(visiblePanels()).toEqual(["ready"]);
    expect(companyField()).toBe("");
    expect(document.querySelector<HTMLButtonElement>("#save")?.disabled).toBe(
      true,
    );

    for (const [id, value] of [
      ["company", "Typed Ltd"],
      ["job-title", "Typed Intern"],
    ] as const) {
      const input = document.getElementById(id) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    expect(document.querySelector<HTMLButtonElement>("#save")?.disabled).toBe(
      false,
    );

    submit();
    await settle();

    expect(harness.captures).toHaveLength(1);
    expect(harness.captures[0]?.record).toMatchObject({
      company: "Typed Ltd",
      job_title: "Typed Intern",
    });
  });
});
