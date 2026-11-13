import { describe, expect, it } from "vitest";
import { deriveLineTargets } from "@/lib/agent/calibration";
import { lineFillIssue } from "@/lib/agent/checks/bullets";
import {
  MAX_STORIES,
  MAX_VARIANTS_PER_STORY,
  rankStories,
  tokenize,
  type LibraryStory,
  type LibraryVariant,
} from "@/lib/agent/library/scoring";
import { GOLD_SET } from "./agent-standards-fixtures";

function variant(id: string, text: string, overrides: Partial<LibraryVariant> = {}): LibraryVariant {
  return {
    id,
    text,
    style: "house",
    angles: [],
    template_fit: [],
    char_count: text.length,
    is_gold: true,
    explain_note: null,
    created_at: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

/** One story per gold bullet, grouped under its gold-set role. */
const LIBRARY: LibraryStory[] = GOLD_SET.flatMap((role, roleIndex) => {
  const [org, title] = role.role.split(", ");
  return role.bullets.map((text, bulletIndex) => ({
    id: `story-${roleIndex}-${bulletIndex}`,
    label: text.split(" ").slice(0, 4).join(" "),
    summary: null,
    tags: [],
    org,
    official_title: title,
    variants: [variant(`variant-${roleIndex}-${bulletIndex}`, text)],
  }));
});

describe("rankStories", () => {
  it("finds the Power BI dashboard story for a dashboard requirement", () => {
    const ranking = rankStories(LIBRARY, {
      requirements: ["Build Power BI dashboards over large datasets"],
      angles: [],
      template: "zero2sudo",
    });
    expect(ranking.stories[0].variants[0].text).toMatch(/^Eliminated manual weekly migration summaries/);
    expect(ranking.stories[0].matches).toEqual([0]);
    expect(ranking.unmatched).toEqual([]);
  });

  it("reports requirements no story touches", () => {
    const ranking = rankStories(LIBRARY, {
      requirements: ["Ticket triage and backlog reduction", "Kubernetes cluster administration"],
      angles: [],
      template: "jakes",
    });
    expect(ranking.unmatched).toEqual([1]);
    expect(ranking.stories[0].org).toBe("IRB");
  });

  it("returns at most 5 stories and 2 variants each", () => {
    const busy: LibraryStory = {
      ...LIBRARY[0],
      id: "busy",
      variants: ["a", "b", "c", "d"].map((suffix) =>
        variant(`busy-${suffix}`, `Reduced the ticket backlog by 35% (${suffix}).`),
      ),
    };
    const ranking = rankStories([busy, ...LIBRARY], {
      requirements: ["ticket backlog", "SQL", "stakeholder requirements", "partnerships", "SEO audit", "CRM"],
      angles: [],
      template: "jakes",
    });
    expect(ranking.stories.length).toBeLessThanOrEqual(MAX_STORIES);
    for (const story of ranking.stories) {
      expect(story.variants.length).toBeLessThanOrEqual(MAX_VARIANTS_PER_STORY);
    }
  });

  it("prefers house style, the requested angle and the template among variants", () => {
    const story: LibraryStory = {
      ...LIBRARY[0],
      id: "mixed",
      variants: [
        variant("voice", "Built a dashboard that cut reporting time.", { style: "story_voice", is_gold: false }),
        variant("plain", "Cut reporting time by 30% with a dashboard.", { is_gold: false }),
        variant("fit", "Cut reporting time by 30% with a Power BI dashboard.", {
          angles: ["data"],
          template_fit: ["zero2sudo"],
          is_gold: false,
        }),
      ],
    };
    const ranking = rankStories([story], {
      requirements: ["reporting dashboards"],
      angles: ["data"],
      template: "zero2sudo",
    });
    expect(ranking.stories[0].variants.map((v) => v.id)).toEqual(["fit", "plain"]);
  });

  it("gives the same answer every time, whatever order the library arrives in", () => {
    const query = { requirements: ["program operations", "university partnerships"], angles: ["ops"], template: "jakes" };
    const forward = rankStories(LIBRARY, query);
    const reversed = rankStories([...LIBRARY].reverse(), query);
    expect(reversed).toEqual(forward);
  });

  it("skips stories that have no variants to offer", () => {
    const empty: LibraryStory = { ...LIBRARY[0], id: "empty", variants: [] };
    const ranking = rankStories([empty], { requirements: ["ticket backlog"], angles: [], template: "jakes" });
    expect(ranking.stories).toEqual([]);
  });

  it("tokenizes without filler words and with simple stems", () => {
    expect(tokenize("Strong experience analyzing SQL dashboards")).toEqual(["analyz", "sql", "dashboard"]);
  });
});

describe("deriveLineTargets", () => {
  it("lands near the narrow seed values in STANDARDS.md", () => {
    expect(deriveLineTargets([110, 108, 111, 109, 110])).toEqual({
      oneLineChars: 108,
      twoLineMin: 196,
      twoLineMax: 216,
    });
  });

  it("lands near the wide seed values in STANDARDS.md", () => {
    expect(deriveLineTargets([138, 139, 140, 140, 141, 139])).toEqual({
      oneLineChars: 138,
      twoLineMin: 250,
      twoLineMax: 276,
    });
  });

  it("gives targets the bullet checker can use directly", () => {
    const targets = deriveLineTargets([110, 108, 111, 109, 110]);
    expect(lineFillIssue(200, targets)).toBeNull();
    expect(lineFillIssue(150, targets)).toMatch(/^Widow/);
  });

  it("refuses too few measurements", () => {
    expect(() => deriveLineTargets([110, 108, 0, Number.NaN])).toThrow(/at least 5/);
  });
});
