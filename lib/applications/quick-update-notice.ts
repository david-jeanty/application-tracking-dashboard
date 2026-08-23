import type { QuickUpdateOutcome } from "@/lib/applications/state";

export type QuickUpdateNotice = {
  tone: "success" | "error";
  message: string;
};

/**
 * The message the detail page shows after a quick update.
 *
 * Each success names what actually changed, so a student who meant to clear a
 * follow-up and a student who meant to save one can tell their results apart.
 * Failure is one fixed sentence for every rejected case — missing, owned by
 * somebody else, archived, invalid input, or a database error — because saying
 * which would confirm that another student's application exists, and because
 * no database detail belongs in front of a student regardless.
 *
 * A pure mapper rather than a component: the query parameter is attacker-
 * controlled, and everything outside this small set of values maps to null.
 */
export function toQuickUpdateNotice(value: unknown): QuickUpdateNotice | null {
  const outcome = value as QuickUpdateOutcome;

  if (outcome === "status") {
    return { tone: "success", message: "Status updated." };
  }
  if (outcome === "next-action") {
    return { tone: "success", message: "Next action updated." };
  }
  if (outcome === "next-action-cleared") {
    return { tone: "success", message: "Next action cleared." };
  }
  if (outcome === "error") {
    return {
      tone: "error",
      message: "That update couldn't be completed. Try again.",
    };
  }

  return null;
}
