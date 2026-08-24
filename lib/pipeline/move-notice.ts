import type { PipelineMoveOutcome } from "@/lib/applications/state";

export type PipelineMoveNotice = {
  tone: "success" | "error";
  message: string;
};

/**
 * The message the pipeline board shows after a move.
 *
 * The board itself is the real confirmation — the card is now under a
 * different heading — so the success line stays one short sentence rather than
 * repeating the status the student can already see.
 *
 * Failure is one fixed sentence for every rejected case: missing, owned by
 * somebody else, archived, an invalid status, or a database error. Saying
 * which would confirm that another student's application exists, and no
 * database detail belongs in front of a student regardless.
 *
 * A pure mapper rather than a component: the query parameter is attacker-
 * controlled, and everything outside this small set of values maps to null.
 */
export function toPipelineMoveNotice(value: unknown): PipelineMoveNotice | null {
  const outcome = value as PipelineMoveOutcome;

  if (outcome === "moved") {
    return { tone: "success", message: "Application moved." };
  }
  if (outcome === "error") {
    return {
      tone: "error",
      message: "That application couldn't be moved. Try again.",
    };
  }

  return null;
}
