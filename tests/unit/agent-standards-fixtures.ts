import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Real fixtures, read from `docs/STANDARDS.md` itself rather than copied.
 *
 * If David edits the gold set or the negative examples, the checker tests run
 * against the new text automatically, so the standards and the code that
 * enforces them cannot drift apart unnoticed.
 */
const STANDARDS = readFileSync(
  join(process.cwd(), "docs", "STANDARDS.md"),
  "utf8",
);

function section(startHeading: string, endHeading: string): string {
  const start = STANDARDS.indexOf(startHeading);
  const end = STANDARDS.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1) {
    throw new Error(`STANDARDS.md is missing "${startHeading}" or "${endHeading}".`);
  }
  return STANDARDS.slice(start, end);
}

export type GoldRole = { role: string; bullets: string[] };

/** The gold set, grouped by the bold role heading each block sits under. */
export const GOLD_SET: GoldRole[] = (() => {
  const roles: GoldRole[] = [];
  for (const line of section("### Gold set", "### Negative examples").split("\n")) {
    const heading = /^\*\*(.+)\*\*$/.exec(line.trim());
    if (heading) {
      roles.push({ role: heading[1], bullets: [] });
    } else if (line.startsWith("- ") && roles.length) {
      roles[roles.length - 1].bullets.push(line.slice(2).trim());
    }
  }
  return roles;
})();

export const GOLD_BULLETS: string[] = GOLD_SET.flatMap((role) => role.bullets);

export type NegativeExample = { draft: string; whatsWrong: string };

/** The "never write like this" table. */
export const NEGATIVE_EXAMPLES: NegativeExample[] = section(
  "### Negative examples",
  "## Part 3",
)
  .split("\n")
  .filter((line) => line.startsWith("| ") && !line.startsWith("| Draft") && !line.startsWith("| ---"))
  .map((line) => {
    const cells = line.split("|").map((cell) => cell.trim());
    return { draft: cells[1], whatsWrong: cells[2] };
  });

/** The filler blocklist, as written in STANDARDS.md. */
export const FILLER_BLOCKLIST: string[] = (() => {
  const block = section("### Filler blocklist", "### Numbers and claims");
  const listLine = block
    .split("\n")
    .find((line) => line.includes("helped") && line.includes("passionate"));
  if (!listLine) throw new Error("STANDARDS.md filler blocklist not found.");
  return listLine
    .replace(/\.$/, "")
    .split(",")
    .map((item) => item.trim());
})();
