import { describe, expect, it } from "vitest";
import { answersIn, answerTo } from "@/lib/agent/library/phrases";
import { rankStories, type LibraryStory, type LibraryVariant } from "@/lib/agent/library/scoring";
import { relevance } from "@/lib/agent/resume/page-fill";
import { requirementPhrases, requirementSchema } from "@/lib/agent/types";
import { GOLD_SET } from "./agent-standards-fixtures";

/** David's examples of requirement phrases (decision record 0023). */
const LED_GROUP = "led a group project";
const CROSS_FUNCTIONAL = "worked cross-functionally";

/** The IBM Pro Bono gold bullet David uses as the bridging example. */
const PRO_BONO = GOLD_SET.find((role) => role.role.startsWith("IBM Pro Bono"))!.bullets[0];

describe("answerTo", () => {
  it("finds a direct answer when every word of the phrase is there", () => {
    expect(answerTo(CROSS_FUNCTIONAL, "Partnered with engineering and design to ship the tracker.")).toBe("direct");
    expect(answerTo("led a group project", "Led a group project on donor data for a nonprofit client.")).toBe("direct");
  });

  it("counts close neighbours: a team is a group, leading is led", () => {
    expect(answerTo(LED_GROUP, "Led a team of five through a client engagement.")).toBe("partial");
    expect(answerTo(LED_GROUP, "**Led the team's client-aligned workstreams**")).toBe("partial");
  });

  it("reads cross-functionally and cross-functional as the same word", () => {
    expect(answerTo("worked cross-functionally", "Coordinated cross-functional teams on the migration.")).toBe("partial");
  });

  it("does not count an isolated noun as an answer", () => {
    expect(answerTo(LED_GROUP, "team")).toBeNull();
    expect(answerTo(LED_GROUP, "Grew the tracker to 100 student sign-ups.")).toBeNull();
  });

  it("does not count words scattered across a long bullet", () => {
    const scattered =
      "Led outreach by calling university contacts, emailing program directors, building a partnership tracker, and automating follow-ups for every academic group.";
    expect(answerTo(LED_GROUP, scattered)).toBeNull();
  });

  it("reports direct and partial answers by phrase index", () => {
    expect(answersIn("Led a team of five and partnered with engineering and design.", [LED_GROUP, CROSS_FUNCTIONAL])).toEqual({
      direct: [1],
      partial: [0],
    });
  });
});

describe("requirement phrases", () => {
  it("refuses a single word as a phrase", () => {
    expect(requirementSchema.safeParse({ text: "Leadership", must_have: true, phrases: ["leadership"] }).success).toBe(false);
    expect(requirementSchema.safeParse({ text: "Leadership", must_have: true, phrases: [LED_GROUP] }).success).toBe(true);
  });

  it("keeps postings saved before phrases existed valid", () => {
    expect(requirementSchema.safeParse({ text: "Leadership", must_have: true }).success).toBe(true);
  });

  it("lists every phrase once, in requirement order", () => {
    expect(
      requirementPhrases([
        { text: "Leadership", must_have: true, phrases: [LED_GROUP, CROSS_FUNCTIONAL] },
        { text: "Teamwork", must_have: false, phrases: ["Worked cross-functionally"] },
        { text: "SQL", must_have: true },
      ]),
    ).toEqual([LED_GROUP, CROSS_FUNCTIONAL]);
  });
});

function variant(id: string, text: string): LibraryVariant {
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

describe("rankStories with phrases", () => {
  const query = {
    requirements: ["Experience leading group projects for clients"],
    angles: [],
    template: "jakes",
  };

  it("ranks first the story that answers the phrase, over one that only shares a word", () => {
    const ranking = rankStories(LIBRARY, { ...query, phrases: [LED_GROUP] });
    expect(ranking.stories[0].variants[0].text).toBe(PRO_BONO);
    expect(ranking.stories[0].partly).toEqual([0]);
    expect(ranking.stories[0].variants[0].partly).toEqual([0]);
    expect(ranking.unanswered_phrases).toEqual([]);
  });

  it("names the phrases no story answers", () => {
    const ranking = rankStories(LIBRARY, { ...query, phrases: [LED_GROUP, "negotiated vendor contracts"] });
    expect(ranking.unanswered_phrases).toEqual([1]);
  });

  it("prefers the wording that answers the phrase directly", () => {
    const direct = "Led a group project splitting the team into client-aligned workstreams.";
    const story: LibraryStory = { ...LIBRARY.find((entry) => entry.variants[0].text === PRO_BONO)!, variants: [variant("keyword", PRO_BONO), variant("direct", direct)] };
    const ranking = rankStories([story], { ...query, phrases: [LED_GROUP] });
    expect(ranking.stories[0].variants.map((entry) => entry.id)).toEqual(["direct", "keyword"]);
    expect(ranking.stories[0].variants[0].answers).toEqual([0]);
  });

  it("leaves the answer fields out when the query has no phrases", () => {
    const ranking = rankStories(LIBRARY, query);
    expect(ranking.stories[0]).not.toHaveProperty("answers");
    expect(ranking).not.toHaveProperty("unanswered_phrases");
  });
});

describe("page fill relevance", () => {
  it("scores a bullet that answers a phrase above one that does not", () => {
    const requirements = ["Leadership experience"];
    const answering = relevance("Led a team of five through a client engagement.", requirements, [LED_GROUP]);
    const other = relevance("Grew the tracker to 100 student sign-ups.", requirements, [LED_GROUP]);
    expect(answering).toBeGreaterThan(other);
  });
});
