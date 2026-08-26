import { describe, expect, it } from "vitest";
import {
  chooseLinkedInFrame,
  establishesSelectedJob,
  frameSignals,
  probeLinkedInFrame,
  withTopLevelIdentity,
  type LinkedInFrameEvidence,
  type LinkedInFrameProbe,
} from "../src/linkedin-frames.js";
import type { PageSignals } from "../src/types.js";

/**
 * Which of a LinkedIn tab's documents is showing the posting.
 *
 * The live transition these tests are built from: a student on
 * `/jobs/collections/similar-jobs/?currentJobId=4446257399&referenceJobId=4443429701`
 * sees an IBM posting, while the top document still holds the exacare ai
 * posting they came from. The IBM one is rendered inside a same-origin
 * `/preload/?_bprMode=vanilla` iframe, and that frame — not the main one, not
 * the reference job, not the component ids — is what the extension has to read.
 *
 * Frame selection is kept a pure decision over bounded evidence so it can be
 * argued with here, without a browser and without reproducing Chrome's frame
 * tree. The probe that gathers the evidence is tested separately, against real
 * DOM.
 */

const CURRENT_JOB = "4446257399";
const PREVIOUS_JOB = "4443429701";

const PRELOAD_URL = "https://www.linkedin.com/preload/?_bprMode=vanilla";
const TOP_URL =
  `https://www.linkedin.com/jobs/collections/similar-jobs/?currentJobId=${CURRENT_JOB}` +
  `&originToLandingJobPostings=${CURRENT_JOB}&referenceJobId=${PREVIOUS_JOB}`;

function evidence(
  overrides: Partial<LinkedInFrameEvidence> = {},
): LinkedInFrameEvidence {
  return {
    frameUrl: "https://www.linkedin.com/jobs/collections/similar-jobs/",
    currentIdLinks: 0,
    dataJobId: false,
    dataOccludableJobId: false,
    dataEntityUrn: false,
    ...overrides,
  };
}

function probe(
  frameId: number,
  overrides: Partial<LinkedInFrameEvidence> = {},
): LinkedInFrameProbe {
  return { frameId, ...evidence(overrides) };
}

/** The live `/preload/` frame: three independent signals for the same job. */
const livePreloadFrame = (frameId: number) =>
  probe(frameId, {
    frameUrl: PRELOAD_URL,
    currentIdLinks: 4,
    dataJobId: true,
    dataOccludableJobId: true,
  });

/** The top document, which still describes the posting the student left. */
const staleTopFrame = probe(0, {
  frameUrl: TOP_URL,
  currentIdLinks: 0,
  dataJobId: false,
});

describe("choosing the frame that is showing the posting", () => {
  /** Fixture A: the reported failure, as its evidence. */
  it("takes the frame that establishes the selected job, not the main one", () => {
    const choice = chooseLinkedInFrame([
      staleTopFrame,
      probe(1, { frameUrl: "https://www.linkedin.com/li/track" }),
      livePreloadFrame(2),
    ]);

    expect(choice).toEqual({ kind: "frame", frameId: 2 });
  });

  /**
   * Fixture E, seen from here: an ordinary search tab renders the posting in
   * its own main frame, and the same mechanism selects it. Nothing about this
   * path privileges an iframe.
   */
  it("takes the main frame when the main frame is the one that establishes it", () => {
    const choice = chooseLinkedInFrame([
      probe(0, { currentIdLinks: 2, dataOccludableJobId: true }),
      probe(3, { frameUrl: PRELOAD_URL }),
    ]);

    expect(choice).toEqual({ kind: "frame", frameId: 0 });
  });

  /**
   * `/preload/` is where the live posting happened to be. It is not a rule, and
   * a `/preload/` document with nothing to say about `currentJobId` loses to
   * one that does.
   */
  it("does not choose a frame for having a /preload/ address", () => {
    const choice = chooseLinkedInFrame([
      staleTopFrame,
      probe(1, { frameUrl: PRELOAD_URL }),
      probe(2, { currentIdLinks: 1, dataJobId: true }),
    ]);

    expect(choice).toEqual({ kind: "frame", frameId: 2 });
  });

  /** Fixture C: two documents claim the posting and nothing separates them. */
  it("refuses to pick when two frames both establish the posting", () => {
    const choice = chooseLinkedInFrame([
      probe(1, { frameUrl: PRELOAD_URL, currentIdLinks: 3, dataJobId: true }),
      probe(2, { currentIdLinks: 2, dataOccludableJobId: true }),
    ]);

    expect(choice).toEqual({ kind: "ambiguous" });
  });

  /** Fixture D: nothing in the tab says this posting is on screen. */
  it("resolves nothing when no frame establishes the posting", () => {
    expect(chooseLinkedInFrame([staleTopFrame, probe(1)])).toEqual({
      kind: "unresolved",
    });
    expect(chooseLinkedInFrame([])).toEqual({ kind: "unresolved" });
  });

  /**
   * The rule that keeps this from being "the first matching href wins". A lone
   * link to the selected posting appears in any list that happens to contain
   * it, including one in a document that is not on screen.
   */
  it("requires corroboration rather than a single arbitrary signal", () => {
    for (const only of [
      { currentIdLinks: 9 },
      { dataJobId: true },
      { dataOccludableJobId: true },
      { dataEntityUrn: true },
    ]) {
      expect(establishesSelectedJob(evidence(only))).toBe(false);
      expect(chooseLinkedInFrame([probe(1, only)])).toEqual({
        kind: "unresolved",
      });
    }
  });

  it("counts each kind of evidence once, however much of it there is", () => {
    expect(frameSignals(evidence({ currentIdLinks: 40 }))).toBe(1);
    expect(
      frameSignals(evidence({ currentIdLinks: 1, dataOccludableJobId: true })),
    ).toBe(2);
    expect(
      frameSignals(
        evidence({
          currentIdLinks: 4,
          dataJobId: true,
          dataOccludableJobId: true,
          dataEntityUrn: true,
        }),
      ),
    ).toBe(4);
  });
});

/**
 * The probe itself, against real DOM.
 *
 * Its headline property is what it does not return: no text, no markup, no
 * attribute value, no href. Visiting every frame is only a small act because
 * what comes back from each one is a handful of counts.
 */
describe("the injected frame probe", () => {
  function probeOver(html: string, jobId: string): LinkedInFrameEvidence {
    document.documentElement.innerHTML = html;

    return probeLinkedInFrame(jobId);
  }

  /** The live `/preload/` document's evidence for the IBM posting. */
  const preloadBody = `<head></head><body>
     <ul>
       <li data-occludable-job-id="${CURRENT_JOB}">
         <a href="/jobs/view/${CURRENT_JOB}/?alternateChannel=search">IBM</a>
       </li>
       <li data-occludable-job-id="4470000002">
         <a href="/jobs/view/4470000002/">Something else</a>
       </li>
     </ul>
     <div data-job-id="${CURRENT_JOB}">
       <a href="/jobs/view/${CURRENT_JOB}">Senior Managing Consultant SAP HANA SD OTC</a>
     </div>
   </body>`;

  it("reports the independent signals a frame offers", () => {
    const found = probeOver(preloadBody, CURRENT_JOB);

    expect(found.currentIdLinks).toBe(2);
    expect(found.dataJobId).toBe(true);
    expect(found.dataOccludableJobId).toBe(true);
    expect(establishesSelectedJob(found)).toBe(true);
  });

  it("reports nothing for a document describing a different posting", () => {
    const found = probeOver(
      `<head></head><body>
         <div id="JobDetails_ManageJobBanner_${PREVIOUS_JOB}" data-job-id="${PREVIOUS_JOB}">
           <a href="/jobs/view/${PREVIOUS_JOB}/">Solutions Consultant</a>
         </div>
       </body>`,
      CURRENT_JOB,
    );

    expect(frameSignals(found)).toBe(0);
    expect(establishesSelectedJob(found)).toBe(false);
  });

  it("matches the whole job id rather than a prefix of a longer one", () => {
    const found = probeOver(
      `<head></head><body>
         <a href="/jobs/view/${CURRENT_JOB}0/">A different, longer id</a>
         <div data-job-id="${CURRENT_JOB}0"></div>
       </body>`,
      CURRENT_JOB,
    );

    expect(found.currentIdLinks).toBe(0);
    expect(found.dataJobId).toBe(false);
  });

  it("reads LinkedIn's own entity urn for the posting", () => {
    const found = probeOver(
      `<head></head><body>
         <div data-entity-urn="urn:li:fsd_jobPosting:${CURRENT_JOB}"></div>
         <a href="/jobs/view/${CURRENT_JOB}/">IBM</a>
       </body>`,
      CURRENT_JOB,
    );

    expect(found.dataEntityUrn).toBe(true);
    expect(establishesSelectedJob(found)).toBe(true);
  });

  it("establishes nothing from an id it will not accept", () => {
    for (const nonsense of ["", "../../etc", '4446257399"]', "a".repeat(65)]) {
      const found = probeOver(preloadBody, nonsense);

      expect(frameSignals(found)).toBe(0);
    }
  });

  it("returns counts and booleans, never anything the page said", () => {
    const found = probeOver(
      `<head><title>IBM hiring Senior Managing Consultant</title></head><body>
         <h1>Senior Managing Consultant SAP HANA SD OTC</h1>
         <p>Vancouver, BC</p>
         <div data-job-id="${CURRENT_JOB}"><a href="/jobs/view/${CURRENT_JOB}/">Apply</a></div>
       </body>`,
      CURRENT_JOB,
    );

    const returned = JSON.stringify(found);
    expect(returned).not.toContain("Senior Managing Consultant");
    expect(returned).not.toContain("Vancouver");
    expect(returned).not.toContain("IBM");
    // The frame's own address is the only string, and it is a diagnostic.
    expect(Object.keys(found).sort()).toEqual([
      "currentIdLinks",
      "dataEntityUrn",
      "dataJobId",
      "dataOccludableJobId",
      "frameUrl",
    ]);
  });

  it("is self-contained, because Chrome injects it as source text", () => {
    const source = probeLinkedInFrame.toString();

    expect(source).not.toMatch(/\bimport\b|\brequire\(/);
    expect(source.startsWith("function probeLinkedInFrame")).toBe(true);
  });
});

/**
 * Identity, which belongs to the tab and never to the frame.
 *
 * The posting was read out of `/preload/?_bprMode=vanilla`. It is not filed
 * there, and the frame's own canonical link does not get to describe a document
 * the student never navigated to.
 */
describe("keeping identity on the top-level address", () => {
  const fromTheFrame: PageSignals = {
    jsonLdBlocks: [],
    meta: {},
    pageUrl: PRELOAD_URL,
    canonicalUrl: "https://www.linkedin.com/preload/",
    siteFields: { company: "IBM" },
  };

  it("replaces the frame's address with the tab's", () => {
    const signals = withTopLevelIdentity(fromTheFrame, TOP_URL);

    expect(signals.pageUrl).toBe(TOP_URL);
    expect(signals.pageUrl).not.toContain("preload");
  });

  it("drops the frame's own canonical link", () => {
    expect(withTopLevelIdentity(fromTheFrame, TOP_URL).canonicalUrl).toBeUndefined();
  });

  it("keeps everything the frame legitimately read", () => {
    expect(withTopLevelIdentity(fromTheFrame, TOP_URL).siteFields).toEqual({
      company: "IBM",
    });
  });
});
