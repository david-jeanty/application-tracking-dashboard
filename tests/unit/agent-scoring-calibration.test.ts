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

  it("returns each story's facts so a new bullet can be written from them", () => {
    const facts = "Power BI Premium dashboard over 5M+ records across 50+ regional sites.";
    const library = LIBRARY.map((story) =>
      story.variants[0].text.startsWith("Eliminated manual weekly") ? { ...story, summary: facts } : story,
    );
    const ranking = rankStories(library, {
      requirements: ["Build Power BI dashboards over large datasets"],
      angles: [],
      template: "zero2sudo",
    });
    expect(ranking.stories[0].summary).toBe(facts);
    expect(ranking.stories.slice(1).every((story) => story.summary === null)).toBe(true);
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
    const ranked = ranking.stories.slice(0, MAX_STORIES);
    const coverage = ranking.stories.slice(MAX_STORIES);
    for (const story of ranked) expect(story.variants.length).toBeLessThanOrEqual(MAX_VARIANTS_PER_STORY);
    // Past the ranked stories, only one story per experience not yet shown, one wording each.
    const shown = new Set(ranked.map((story) => `${story.org}|${story.title}`));
    for (const story of coverage) {
      expect(shown.has(`${story.org}|${story.title}`)).toBe(false);
      shown.add(`${story.org}|${story.title}`);
      expect(story.variants).toHaveLength(1);
    }
  });

  it("gives every experience at least its best story, even one the posting never names", () => {
    const ranking = rankStories(LIBRARY, {
      requirements: ["Ticket backlog reduction and request triage"],
      angles: [],
      template: "zero2sudo",
    });
    const orgs = new Set(ranking.stories.map((story) => story.org));
    for (const story of LIBRARY) expect(orgs.has(story.org)).toBe(true);
  });

  it("matches long posting requirements through the words David's stories use", () => {
    const ranking = rankStories(LIBRARY, {
      requirements: ["Develop catalogs, sell sheets, product bulletins and promotional campaigns with sales and marcomm teams"],
      angles: [],
      template: "zero2sudo",
    });
    const matched = ranking.stories.filter((story) => story.matches.includes(0)).map((story) => story.org);
    expect(matched).toContain("Fidus Systems");
    expect(ranking.unmatched).toEqual([]);
  });

  it("leaves a true gap unmatched", () => {
    const ranking = rankStories(LIBRARY, {
      requirements: ["Attend monthly SO&P meetings and act on inventory levels and production capacity"],
      angles: [],
      template: "zero2sudo",
    });
    expect(ranking.unmatched).toEqual([0]);
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
      twoLineMax: 220,
    });
  });

  it("sets the two-line ceiling from the typical line, so two-liners that fit pass", () => {
    // A base whose shortest full line is 130 but whose lines are mostly 137:
    // twice the shortest (260) would flag 273-character two-liners that fit.
    const targets = deriveLineTargets([130, 136, 137, 137, 138, 139]);
    expect(targets.twoLineMax).toBe(274);
    expect(lineFillIssue(273, targets)).toBeNull();
  });

  it("lands near the wide seed values in STANDARDS.md", () => {
    expect(deriveLineTargets([138, 139, 140, 140, 141, 139])).toEqual({
      oneLineChars: 138,
      twoLineMin: 250,
      twoLineMax: 279,
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
