export type MissingConditionalUpdateOutcome = "conflict" | "not_found";

export function classifyMissingConditionalUpdate(
  ownerCanStillReadRecord: boolean,
): MissingConditionalUpdateOutcome {
  return ownerCanStillReadRecord ? "conflict" : "not_found";
}
