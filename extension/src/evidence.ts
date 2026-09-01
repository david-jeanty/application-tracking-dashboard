import type { ObservedIdentityState } from "./identity.js";

/** Fields a capture adapter may currently establish from page-local evidence. */
export type EvidenceFieldName =
  | "company"
  | "jobTitle"
  | "location"
  | "jobDescription"
  | "workplaceType"
  /** Link evidence is an input to company-domain resolution, not a stored value. */
  | "selectedLinks"
  /** Reserved for a future adapter that establishes an employer domain directly. */
  | "companyDomain";

/** The deliberately small vocabulary of ways adapter evidence is collected. */
export type EvidenceMethod =
  | "site_dom"
  | "selected_posting_links"
  | "board_branding";

/** Why page-local evidence was observed but refused. */
export type EvidenceRejectionCode =
  | "posting_identity_mismatch"
  | "posting_identity_unobserved"
  | "posting_identity_ambiguous";

export type EvidenceIdentityState = ObservedIdentityState | "unsupported";

/**
 * One adapter candidate after identity has been judged.
 *
 * Rejected candidates deliberately retain their value only inside this
 * short-lived internal ledger. `projectEvidence` is the single boundary that
 * can turn evidence into values used by the extractor, and it reads accepted
 * entries only.
 */
export type FieldEvidence = {
  field: EvidenceFieldName;
  value: string;
  method: EvidenceMethod;
  identity: EvidenceIdentityState;
} & (
  | { decision: "accepted" }
  | { decision: "rejected"; reason: EvidenceRejectionCode }
);

export type EvidenceProjection = {
  values: Partial<Record<EvidenceFieldName, string>>;
  rejected: Partial<Record<EvidenceFieldName, EvidenceRejectionCode>>;
};

/**
 * The one evidence-to-value projection used by every adapter.
 *
 * First accepted value wins. Adapter order and DOM order therefore cannot
 * replace a value after it has been admitted, and rejected evidence has no
 * value-bearing path out of the ledger.
 */
export function projectEvidence(
  evidence: readonly FieldEvidence[],
): EvidenceProjection {
  const values: EvidenceProjection["values"] = {};
  const rejected: EvidenceProjection["rejected"] = {};

  for (const entry of evidence) {
    if (entry.decision === "accepted") {
      if (values[entry.field] === undefined) values[entry.field] = entry.value;
      continue;
    }

    if (rejected[entry.field] === undefined) {
      rejected[entry.field] = entry.reason;
    }
  }

  return { values, rejected };
}

/** The least trustworthy state observed anywhere in one adapter result. */
export function worstObservedIdentity(
  evidence: readonly FieldEvidence[],
): EvidenceIdentityState {
  const states = evidence.map((entry) => entry.identity);
  if (states.includes("ambiguous")) return "ambiguous";
  if (states.includes("mismatched")) return "mismatched";
  if (states.includes("unobserved")) return "unobserved";
  if (states.includes("verified")) return "verified";
  return "unsupported";
}
