import { describe, expect, it } from "vitest";
import {
  checkBullets,
  countSentences,
  lineFillIssue,
  type LineTargets,
} from "@/lib/agent/checks/bullets";
import { phrasesFromRules } from "@/lib/agent/checks/text-rules";
import {
  FILLER_BLOCKLIST,
  GOLD_BULLETS,
  GOLD_SET,
  NEGATIVE_EXAMPLES,
} from "./agent-standards-fixtures";

const EM_DASH = String.fromCharCode(0x2014);
const BANNED_ADVERB = `genuine${"ly"}`;

/** Seed targets from STANDARDS.md: about 110 per line, two-liners 199 to 220. */
const NARROW: LineTargets = { oneLineChars: 110, twoLineMin: 199, twoLineMax: 220 };

function failureRules(text: string): string[] {
  const result = checkBullets([text], { targets: null });
  return result.bullets.flatMap((bullet) => bullet.failures.map((f) => f.rule));
}

function warningRules(text: string): string[] {
  const result = checkBullets([text], { targets: null });
  return result.bullets.flatMap((bullet) => bullet.warnings.map((w) => w.rule));
}

describe("fixtures from docs/STANDARDS.md", () => {
  it("reads the whole gold set and every negative example", () => {
    expect(GOLD_SET.map((role) => role.role)).toHaveLength(5);
    expect(GOLD_BULLETS.length).toBeGreaterThanOrEqual(19);
    expect(NEGATIVE_EXAMPLES).toHaveLength(4);
    expect(FILLER_BLOCKLIST).toContain("passionate");
  });
});

describe("check_bullets on the gold set", () => {
  it.each(GOLD_BULLETS)("passes every hard rule: %s", (bullet) => {
    expect(failureRules(bullet)).toEqual([]);
  });

  it.each(GOLD_BULLETS)("opens with an allowed result verb: %s", (bullet) => {
    expect(warningRules(bullet)).not.toContain("opener_review");
  });

  it("reports no metric conflict between the IRB variants that share numbers", () => {
    const irb = GOLD_SET.find((role) => role.role.startsWith("IRB"));
    const result = checkBullets(irb!.bullets.slice(0, 2), { targets: null });
    expect(result.page.warnings.map((w) => w.rule)).not.toContain("metric_conflict");
  });
});

describe("check_bullets on the negative examples", () => {
  const [effort, claudeActor, narrative, oldVoice] = NEGATIVE_EXAMPLES;

  it("flags the effort metric (pull requests)", () => {
    expect(effort.whatsWrong).toMatch(/pull requests/);
    expect(warningRules(effort.draft)).toContain("effort_metric");
    expect(warningRules(effort.draft)).toContain("opener_review");
  });

  it("flags Claude as the actor and the activity-first opener", () => {
    expect(claudeActor.whatsWrong).toMatch(/Claude as the actor/);
    const warnings = warningRules(claudeActor.draft);
    expect(warnings).toContain("claude_actor");
    expect(warnings).toContain("opener_review");
    expect(warnings).toContain("round_confidently");
  });

  it("blocks two sentences and first person", () => {
    expect(narrative.whatsWrong).toMatch(/Two sentences/);
    const failures = failureRules(narrative.draft);
    expect(failures).toContain("one_sentence");
    expect(failures).toContain("first_person");
  });

  it("blocks the older two-sentence story voice", () => {
    expect(oldVoice.whatsWrong).toMatch(/two sentences/);
    expect(failureRules(oldVoice.draft)).toContain("one_sentence");
  });

  it("never passes a negative example cleanly", () => {
    for (const { draft } of NEGATIVE_EXAMPLES) {
      const result = checkBullets([draft], { targets: null });
      expect(result.bullets).toHaveLength(1);
    }
  });
});

describe("filler blocklist", () => {
  // Every entry in STANDARDS.md, used in a sentence that is otherwise clean.
  const sentences: Record<string, string> = {
    helped: "Grew sign-ups by 20% and helped the team.",
    assisted: "Grew sign-ups by 20% and assisted the team.",
    "supported (as the main verb)": "Supported the migration of 50+ sites.",
    various: "Grew sign-ups by 20% across various channels.",
    "multiple (without a number)": "Grew sign-ups by 20% across multiple channels.",
    successfully: "Successfully grew sign-ups by 20%.",
    effectively: "Grew sign-ups by 20% by effectively testing ads.",
    utilized: "Grew sign-ups by 20% and utilized HubSpot.",
    "responsible for": "Grew sign-ups by 20% while responsible for ads.",
    "worked on": "Grew sign-ups by 20% and worked on ads.",
    "in order to": "Grew sign-ups by 20% in order to hit targets.",
    robust: "Grew sign-ups by 20% with a robust funnel.",
    seamless: "Grew sign-ups by 20% with a seamless funnel.",
    actionable: "Grew sign-ups by 20% with actionable reports.",
    ensuring: "Grew sign-ups by 20%, ensuring steady growth.",
    showcasing: "Grew sign-ups by 20%, showcasing the product.",
    leveraged: "Grew sign-ups by 20% and leveraged HubSpot.",
    "a variety of": "Grew sign-ups by 20% across a variety of channels.",
    "key stakeholders": "Grew sign-ups by 20% for key stakeholders.",
    "cutting-edge": "Grew sign-ups by 20% with cutting-edge ads.",
    dynamic: "Grew sign-ups by 20% with dynamic ads.",
    passionate: "Grew sign-ups by 20% as a passionate marketer.",
  };

  it("has a test sentence for every entry in STANDARDS.md", () => {
    expect(Object.keys(sentences).sort()).toEqual([...FILLER_BLOCKLIST].sort());
  });

  it.each(Object.entries(sentences))("blocks %s", (_entry, sentence) => {
    expect(failureRules(sentence)).toContain("filler");
  });

  it("does not block whole-word look-alikes", () => {
    expect(failureRules("Reduced help desk tickets by 30% through a Claude-assisted triage.")).toEqual([]);
    expect(failureRules("Cut review time by 40% across 3 multiple-choice exams.")).toEqual([]);
    expect(failureRules("Cut costs by 10% across multiple (4) regional offices.")).toEqual([]);
  });

  it("blocks phrases from saved rules", () => {
    const extraBlocked = phrasesFromRules(['Never use "spearheaded"']);
    const result = checkBullets(
      ["Spearheaded Fidus's AI visibility strategy across 4 channels."],
      { targets: null, extraBlocked },
    );
    expect(result.pass).toBe(false);
    expect(result.bullets[0].failures[0].detail).toMatch(/spearheaded/);
  });
});

describe("single-rule failures", () => {
  it("blocks first person forms", () => {
    for (const text of [
      "Grew sign-ups by 20% after I rebuilt the funnel.",
      "Grew my team's sign-ups by 20%.",
      "Grew sign-ups by 20% for our product.",
      "Grew sign-ups by 20% so we could expand.",
      "Grew sign-ups by 20%, which taught me a lot.",
    ]) {
      expect(failureRules(text)).toContain("first_person");
    }
  });

  it("does not treat i.e. or state codes as first person", () => {
    expect(failureRules("Cut costs by 10% in the Portland, ME office, i.e. the main site.")).toEqual([]);
  });

  it("blocks an em dash", () => {
    expect(failureRules(`Grew sign-ups by 20% ${EM_DASH} a record.`)).toContain("em_dash");
  });

  it("blocks the banned adverb", () => {
    expect(failureRules(`Grew ${BANNED_ADVERB} useful sign-ups by 20%.`)).toContain("banned_adverb");
  });

  it("allows a short trailing clause after a semicolon", () => {
    expect(failureRules("Cut audit issues by 95% through a monthly audit; still in use.")).toEqual([]);
  });

  it("blocks an empty bullet", () => {
    expect(failureRules("   ")).toEqual(["empty"]);
  });
});

describe("countSentences", () => {
  it.each([
    ["Reduced costs by 10%.", 1],
    ["Reduced costs by 10%. It worked.", 2],
    ["Reduced U.S. costs by 10% (e.g. travel) at Acme Inc. in Ottawa.", 1],
    ["Grew revenue by 2.5% in Q3.", 1],
    ["Reduced costs; still in use.", 1],
  ])("%s has %i sentence(s)", (text, expected) => {
    expect(countSentences(text)).toBe(expected);
  });
});

describe("line fill", () => {
  it("accepts a full single line and a full two-liner", () => {
    expect(lineFillIssue(88, NARROW)).toBeNull();
    expect(lineFillIssue(110, NARROW)).toBeNull();
    expect(lineFillIssue(199, NARROW)).toBeNull();
    expect(lineFillIssue(220, NARROW)).toBeNull();
  });

  it("rejects a short single line with the characters to add", () => {
    expect(lineFillIssue(60, NARROW)).toBe(
      "Short single line (60 chars). Add 28 or more to reach 88-110.",
    );
  });

  it("rejects a widow with both ways to fix it", () => {
    expect(lineFillIssue(150, NARROW)).toBe(
      "Widow (150 chars). Cut 40 to fit one line, or add 49 to reach 199-220.",
    );
  });

  it("rejects a bullet that runs to three lines", () => {
    expect(lineFillIssue(240, NARROW)).toBe(
      "Runs to three lines (240 chars). Cut 20 to fit 199-220.",
    );
  });

  it("checks line fill only when the template has targets", () => {
    const widow = `Reduced costs by 10% ${"x".repeat(130)}`;
    expect(checkBullets([widow], { targets: NARROW }).pass).toBe(false);
    const unchecked = checkBullets([widow], { targets: null });
    expect(unchecked.pass).toBe(true);
    expect(unchecked.page.warnings.map((w) => w.rule)).toContain("line_fill_unchecked");
  });

  it("counts the characters that print, not **bold** markers", () => {
    const plain = `Reduced costs by 10% ${"x".repeat(87)}`;
    const bold = plain.replace("10%", "**10%**");
    expect(plain.length).toBe(108);
    expect(bold.length).toBe(112);
    expect(checkBullets([bold], { targets: NARROW }).pass).toBe(true);
  });

  it("measures the gold two-liners against the wider seed template", () => {
    const wide: LineTargets = { oneLineChars: 138, twoLineMin: 250, twoLineMax: 275 };
    const traced = GOLD_BULLETS.find((bullet) => bullet.startsWith("Traced"))!;
    expect(lineFillIssue(traced.length, wide)).toBeNull();
  });
});

describe("page-level rules", () => {
  it("blocks two bullets that open with the same verb", () => {
    const result = checkBullets(
      ["Reduced costs by 10% across 3 sites.", "Reduced churn by 5% for 2 products."],
      { targets: null },
    );
    expect(result.pass).toBe(false);
    expect(result.page.failures[0]).toEqual({
      rule: "repeated_opener",
      detail: '"reduced" opens bullets 0, 1. Vary the openers.',
    });
  });

  it("warns when one metric has two values on a page", () => {
    const result = checkBullets(
      [
        "Reduced the open ticket backlog by 35% through new triage rules.",
        "Cut the open ticket backlog by 40% by recommending Azure DevOps.",
      ],
      { targets: null },
    );
    expect(result.pass).toBe(true);
    expect(result.page.warnings).toContainEqual({
      rule: "metric_conflict",
      detail: '"ticket backlog" appears as 35% and 40%. Use one value.',
    });
  });

  it("returns only bullets that have something to report", () => {
    const result = checkBullets(
      [GOLD_BULLETS[0], "Successfully worked on things."],
      { targets: null },
    );
    expect(result.bullets.map((bullet) => bullet.index)).toEqual([1]);
  });
});

describe("believability warnings", () => {
  it("warns on an impossible reduction", () => {
    expect(warningRules("Reduced costs by 150% across 3 sites.")).toContain("believability");
  });

  it("warns on a user count far beyond an intern's scope", () => {
    expect(warningRules("Grew the app to 2,000,000 users in one summer.")).toContain("believability");
  });

  it("does not warn on large record counts", () => {
    expect(warningRules(GOLD_BULLETS.find((b) => b.includes("5M+ records"))!)).not.toContain(
      "believability",
    );
  });
});

describe("phrasesFromRules", () => {
  it("extracts phrases only from rules that clearly name one", () => {
    const phrases = phrasesFromRules([
      'Never use "spearheaded"',
      "Don't use 'world-class'.",
      "Avoid deep dive",
      "Block: synergize",
      "Always lead with the IRB story for operations roles",
      "Avoid mentioning that the internship was remote because it confuses recruiters",
    ]);
    expect(phrases.map((phrase) => phrase.label)).toEqual([
      "spearheaded",
      "world-class",
      "deep dive",
      "synergize",
    ]);
  });
});
