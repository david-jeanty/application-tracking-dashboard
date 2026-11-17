import { describe, expect, it } from "vitest";
import { numbersIn, untracedNumbers } from "@/lib/agent/checks/numbers";
import type { LibraryStory } from "@/lib/agent/library/scoring";
import type { BulletOwner } from "@/lib/agent/resume/line-rules";
import { GOLD_SET } from "./agent-standards-fixtures";

const IRB = GOLD_SET.find((role) => role.role.startsWith("IRB"))!;
const PRO_BONO = GOLD_SET.find((role) => role.role.startsWith("IBM Pro Bono"))!;

function storiesOf(role: (typeof GOLD_SET)[number], summary: string | null = null): LibraryStory[] {
  const [org, title] = role.role.split(", ");
  return [
    {
      id: `story-${org}`,
      label: org,
      summary,
      tags: [],
      org,
      official_title: title,
      variants: role.bullets.map((text, index) => ({
        id: `${org}-${index}`,
        text,
        style: "house" as const,
        angles: [],
        template_fit: [],
        char_count: text.length,
        is_gold: true,
        explain_note: null,
        created_at: "2026-11-01T00:00:00.000Z",
      })),
    },
  ];
}

const LIBRARY = [...storiesOf(IRB), ...storiesOf(PRO_BONO, "Team of five consultants for a nonprofit client.")];
const IRB_OWNER: BulletOwner = { key: "irb", org: "IRB", title: "Information Management Analyst Intern" };
const PRO_BONO_OWNER: BulletOwner = { key: "pro-bono", org: "IBM Pro Bono", title: "Pro-Bono Consultant" };

describe("numbersIn", () => {
  it("reads digits, scales, percents and spelled numbers", () => {
    expect(numbersIn("Over 5M+ records, 35% faster, $2K saved, 1,200 tickets, a team of five.").map((number) => number.value)).toEqual([
      5_000_000, 35, 2_000, 1_200, 5,
    ]);
  });

  it("skips numbers inside words such as B2B, Q3 and 3D", () => {
    expect(numbersIn("Built B2B outreach for Q3 and a 3D model.")).toEqual([]);
  });
});

describe("untracedNumbers", () => {
  it("passes numbers the experience's stories hold, rounded or spelled", () => {
    const bullets = [
      "Cut the open ticket backlog **35%** by redesigning triage.",
      "Built a Power BI dashboard over 5M records across 50+ sites.",
    ];
    expect(untracedNumbers(bullets, [IRB_OWNER, IRB_OWNER], LIBRARY)).toEqual([]);
    expect(untracedNumbers(["Led a team of 5 through the engagement."], [PRO_BONO_OWNER], LIBRARY)).toEqual([]);
  });

  it("flags a number no story holds", () => {
    expect(untracedNumbers(["Led a team of eight consultants."], [PRO_BONO_OWNER], LIBRARY)).toEqual([
      { index: 0, number: "eight", entry: "pro-bono" },
    ]);
  });

  it("flags a number taken from another experience", () => {
    // 250+ is an IRB number; it may not appear under IBM Pro Bono.
    expect(untracedNumbers(["Triaged 250+ client requests."], [PRO_BONO_OWNER], LIBRARY)).toEqual([
      { index: 0, number: "250+", entry: "pro-bono" },
    ]);
  });
});
