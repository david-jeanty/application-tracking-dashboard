import { describe, expect, it } from "vitest";
import type { LibraryStory, LibraryVariant } from "@/lib/agent/library/scoring";
import { tailoredContentSchema } from "@/lib/agent/resume/content";
import {
  addBullet,
  cutBullet,
  bulletCountProblems,
  bulletMinimums,
  pickNextBullet,
  pickWeakestBullet,
  relevance,
} from "@/lib/agent/resume/page-fill";
import type { ResumeEntry } from "@/lib/agent/resume/skeleton";
import { GOLD_SET } from "./agent-standards-fixtures";

const IRB = GOLD_SET.find((role) => role.role.startsWith("IRB"))!;
const FIDUS = GOLD_SET.find((role) => role.role.startsWith("Fidus"))!;

function variant(id: string, text: string, overrides: Partial<LibraryVariant> = {}): LibraryVariant {
  return {
    id,
    text,
    style: "house",
    angles: [],
    template_fit: [],
    char_count: text.length,
    is_gold: true,
    explain_note: `note for ${id}`,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

const ENTRIES: ResumeEntry[] = [
  { key: "information-management-analyst-intern", section_key: "experience", title: "Information Management Analyst Intern", org: "Immigration and Refugee Board of Canada", heading: "", base_bullet_count: 1, tail: "" },
  { key: "marketing-analyst-intern", section_key: "experience", title: "Marketing Analyst Intern", org: "Fidus Systems", heading: "", base_bullet_count: 1, tail: "" },
];

const LIBRARY: LibraryStory[] = [
  { id: "irb-backlog", label: "Ticket backlog", summary: null, tags: ["ops"], org: "Immigration and Refugee Board of Canada", official_title: "Information Management Analyst Intern", variants: [variant("v-backlog", IRB.bullets[0])] },
  { id: "irb-dashboard", label: "Migration dashboard", summary: null, tags: ["data"], org: "Immigration and Refugee Board of Canada", official_title: "Information Management Analyst Intern", variants: [variant("v-dashboard", IRB.bullets[2])] },
  { id: "fidus-hubspot", label: "HubSpot cleanup", summary: null, tags: ["data"], org: "Fidus Systems", official_title: "Marketing Analyst Intern", variants: [variant("v-hubspot", FIDUS.bullets.find((text) => text.startsWith("Traced"))!)] },
  { id: "other-job", label: "Not on the page", summary: null, tags: ["data"], org: "Somewhere Else", official_title: "Analyst", variants: [variant("v-other", "Built Power BI dashboards over large datasets for a team that is not on this resume.")] },
];

const content = (irb: string[], fidus: string[]) =>
  tailoredContentSchema.parse({
    entries: [
      { key: "information-management-analyst-intern", bullets: irb },
      { key: "marketing-analyst-intern", bullets: fidus },
    ],
  });

describe("relevance", () => {
  it("scores a bullet by the requirements it speaks to", () => {
    const requirements = ["Build Power BI dashboards over large datasets", "Data quality and CRM hygiene"];
    expect(relevance(IRB.bullets[2], requirements)).toBeGreaterThan(relevance(IRB.bullets[0], requirements));
  });
});

describe("pickNextBullet", () => {
  const base = {
    entries: ENTRIES,
    library: LIBRARY,
    template: "zero2sudo" as const,
    accepts: () => true,
  };

  it("adds the best story for the posting that is not on the page, under its own experience", () => {
    const page = content([IRB.bullets[0]], [FIDUS.bullets[0]]);
    const pick = pickNextBullet({
      ...base,
      content: page,
      pageBullets: [IRB.bullets[0], FIDUS.bullets[0]],
      requirements: ["Build Power BI dashboards over large datasets"],
    });
    expect(pick).toEqual({ entry: "information-management-analyst-intern", text: IRB.bullets[2], explain_note: "note for v-dashboard" });
  });

  it("never adds a story already on the page, even reworded", () => {
    const reworded = "Developed a Power BI Premium dashboard over 5M+ records across 50+ regional sites with scheduled SQL snapshots for leadership.";
    const pick = pickNextBullet({
      ...base,
      content: content([reworded], []),
      pageBullets: [reworded],
      requirements: ["Build Power BI dashboards over large datasets"],
    });
    expect(pick?.text).not.toBe(IRB.bullets[2]);
  });

  it("skips stories whose experience is not on the page, and bullets the page check refuses", () => {
    const page = content([IRB.bullets[0]], []);
    const pick = pickNextBullet({
      ...base,
      content: page,
      pageBullets: [IRB.bullets[0]],
      requirements: ["Build Power BI dashboards over large datasets", "CRM data quality in HubSpot"],
      accepts: (_entry, text) => text !== IRB.bullets[2],
    });
    expect(pick?.entry).toBe("marketing-analyst-intern");
    expect(pick?.text.startsWith("Traced")).toBe(true);
  });

  it("returns null when nothing fits", () => {
    expect(
      pickNextBullet({ ...base, content: content([], []), pageBullets: [], requirements: ["x"], accepts: () => false }),
    ).toBeNull();
  });
});

describe("pickWeakestBullet", () => {
  const requirements = ["Reduce the ticket backlog by redesigning request triage"];

  it("cuts the bullet least relevant to the posting", () => {
    const page = content([IRB.bullets[0], IRB.bullets[2]], [FIDUS.bullets[0], FIDUS.bullets[1]]);
    const weakest = pickWeakestBullet(page, requirements);
    expect(weakest?.text).not.toBe(IRB.bullets[0]);
    expect(cutBullet(page, weakest!.entry, weakest!.index).entries.flatMap((entry) => entry.bullets)).not.toContain(weakest!.text);
  });

  it("keeps an entry's last bullet while another entry has two, and never cuts David's edits", () => {
    const page = content([IRB.bullets[0]], [FIDUS.bullets[0], FIDUS.bullets[2]]);
    expect(pickWeakestBullet(page, requirements)?.entry).toBe("marketing-analyst-intern");
    const keep = new Set([FIDUS.bullets[0], FIDUS.bullets[2]]);
    expect(pickWeakestBullet(page, requirements, keep)?.text).toBe(IRB.bullets[0]);
  });
});

describe("addBullet", () => {
  it("appends to the entry without touching the original content", () => {
    const page = content([IRB.bullets[0]], []);
    const next = addBullet(page, "marketing-analyst-intern", FIDUS.bullets[0]);
    expect(next.entries[1].bullets).toEqual([FIDUS.bullets[0]]);
    expect(page.entries[1].bullets).toEqual([]);
  });
});

describe("bulletCountProblems (David's layout)", () => {
  it("asks for each experience's count, lowered to the stories the library has", () => {
    // IRB takes 2 and the library has 2 stories; Fidus takes 3 but the library has 1.
    expect(bulletCountProblems(content([IRB.bullets[0]], []), ENTRIES, LIBRARY)).toEqual([
      { entry: "information-management-analyst-intern", has: 1, min: 2, max: 2 },
      { entry: "marketing-analyst-intern", has: 0, min: 1, max: 3 },
    ]);
  });

  it("refuses more than the maximum", () => {
    const page = content([IRB.bullets[0], IRB.bullets[2], IRB.bullets[3]], [FIDUS.bullets[0]]);
    expect(bulletCountProblems(page, ENTRIES, LIBRARY)).toEqual([
      { entry: "information-management-analyst-intern", has: 3, min: 2, max: 2 },
    ]);
  });

  it("accepts the layout, and an entry left out on purpose", () => {
    const omitted = tailoredContentSchema.parse({
      entries: [
        { key: "information-management-analyst-intern", bullets: [IRB.bullets[0], IRB.bullets[2]] },
        { key: "marketing-analyst-intern", bullets: [], omit: true },
      ],
    });
    expect(bulletCountProblems(omitted, ENTRIES, LIBRARY)).toEqual([]);
  });

  it("never cuts an entry below its minimum when minimums are given", () => {
    const page = content([IRB.bullets[0], IRB.bullets[2]], [FIDUS.bullets[0], FIDUS.bullets[1]]);
    const minimums = bulletMinimums(ENTRIES, LIBRARY);
    expect(pickWeakestBullet(page, ["Ticket backlog"], new Set(), minimums)?.entry).toBe("marketing-analyst-intern");
    const atMinimum = content([IRB.bullets[0], IRB.bullets[2]], [FIDUS.bullets[0]]);
    expect(pickWeakestBullet(atMinimum, ["Ticket backlog"], new Set(), minimums)).toBeNull();
  });
});

describe("pickNextBullet with stories the posting never names", () => {
  it("still fills the page from them when nothing better is left", () => {
    const page = content([IRB.bullets[0], IRB.bullets[2]], [FIDUS.bullets[0]]);
    const pick = pickNextBullet({
      content: page,
      pageBullets: page.entries.flatMap((entry) => entry.bullets),
      entries: ENTRIES,
      library: LIBRARY,
      requirements: ["Attend monthly SO&P meetings on inventory levels"],
      template: "zero2sudo",
      accepts: () => true,
    });
    expect(pick?.entry).toBe("marketing-analyst-intern");
  });
});
