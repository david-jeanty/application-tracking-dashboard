import {
  projectEvidence,
  worstObservedIdentity,
  type EvidenceFieldName,
  type EvidenceIdentityState,
  type EvidenceRejectionCode,
  type FieldEvidence,
} from "./evidence.js";
import { correlateObservedPosting, routeIdentityFor } from "./identity.js";
import { readSiteFields, siteFor, type SiteFieldKey } from "./sites.js";
import type { PageSignals } from "./types.js";

export type CaptureAdapterId =
  | "linkedin_identity_aware"
  | "legacy_site_fields"
  | "generic_page";

type AdapterFields = {
  company?: string;
  jobTitle?: string;
  location?: string;
  jobDescription?: string;
  workplaceType?: string;
};

export type CaptureAdapterResult = {
  adapter: CaptureAdapterId;
  fields: AdapterFields;
  rejected: Partial<Record<EvidenceFieldName, EvidenceRejectionCode>>;
  postingIdentity: {
    support: "supported" | "unsupported";
    observed: EvidenceIdentityState;
  };
  /** Whether selected links may participate in company-domain resolution. */
  admitsSelectedLinks: boolean;
  /** Exposed for sanitized diagnostics and focused architecture tests. */
  evidence: readonly FieldEvidence[];
};

export type CaptureAdapter = {
  id: CaptureAdapterId;
  matches: (signals: PageSignals) => boolean;
  collect: (signals: PageSignals) => CaptureAdapterResult;
};

const RAW_FIELD_FOR: Record<keyof AdapterFields, SiteFieldKey> = {
  company: "company",
  jobTitle: "title",
  location: "location",
  jobDescription: "description",
  workplaceType: "workplaceType",
};

function observationsFor(
  signals: PageSignals,
  field: SiteFieldKey | "selectedLinks",
): readonly (readonly string[])[] {
  return (signals.observedPosting?.fields ?? [])
    .filter((observation) => observation.field === field)
    .map((observation) => observation.jobIds);
}

function observedIdsFor(
  signals: PageSignals,
  field: SiteFieldKey | "selectedLinks",
): string[] {
  return [...new Set(observationsFor(signals, field).flat())];
}

function identityForField(
  signals: PageSignals,
  field: SiteFieldKey | "selectedLinks",
  expectedJobId: string | undefined,
) {
  const observations = observationsFor(signals, field);
  // Every contributing root must establish itself. One matching root cannot
  // lend authority to another root that named nothing.
  if (observations.length === 0 || observations.some((ids) => ids.length === 0)) {
    return "unobserved" as const;
  }
  return correlateObservedPosting(observations.flat(), expectedJobId);
}

function linkedInResult(signals: PageSignals): CaptureAdapterResult {
  const raw = readSiteFields("linkedin", signals.siteFields);
  const candidates: Array<{
    field: keyof AdapterFields | "selectedLinks";
    value: string;
    rawField: SiteFieldKey | "selectedLinks";
  }> = [];

  for (const field of Object.keys(RAW_FIELD_FOR) as Array<keyof AdapterFields>) {
    const value = raw[field];
    if (value) candidates.push({ field, value, rawField: RAW_FIELD_FOR[field] });
  }
  if (signals.selectedLinks) {
    candidates.push({
      field: "selectedLinks",
      value: "present",
      rawField: "selectedLinks",
    });
  }

  // All roots that contributed usable evidence participate in the ambiguity
  // gate. One matching root cannot launder fields supplied by another posting.
  const contributingIds = new Set(
    candidates.flatMap((candidate) => observedIdsFor(signals, candidate.rawField)),
  );
  const globallyAmbiguous = contributingIds.size > 1;
  const expectedJobId = routeIdentityFor(signals.pageUrl).jobId;

  const evidence: FieldEvidence[] = candidates.map((candidate) => {
    const identity = globallyAmbiguous
      ? "ambiguous"
      : identityForField(signals, candidate.rawField, expectedJobId);

    if (identity === "verified") {
      return {
        field: candidate.field,
        value: candidate.value,
        method:
          candidate.field === "selectedLinks"
            ? "selected_posting_links"
            : "site_dom",
        identity,
        decision: "accepted",
      };
    }

    const reason: EvidenceRejectionCode =
      identity === "ambiguous"
        ? "posting_identity_ambiguous"
        : identity === "mismatched"
          ? "posting_identity_mismatch"
          : "posting_identity_unobserved";
    return {
      field: candidate.field,
      value: candidate.value,
      method:
        candidate.field === "selectedLinks"
          ? "selected_posting_links"
          : "site_dom",
      identity,
      decision: "rejected",
      reason,
    };
  });

  const projection = projectEvidence(evidence);
  const values = projection.values;

  return {
    adapter: "linkedin_identity_aware",
    fields: {
      ...(values.company ? { company: values.company } : {}),
      ...(values.jobTitle ? { jobTitle: values.jobTitle } : {}),
      ...(values.location ? { location: values.location } : {}),
      ...(values.jobDescription
        ? { jobDescription: values.jobDescription }
        : {}),
      ...(values.workplaceType
        ? { workplaceType: values.workplaceType }
        : {}),
    },
    rejected: projection.rejected,
    postingIdentity: {
      support: "supported",
      observed:
        evidence.length === 0 ? "unobserved" : worstObservedIdentity(evidence),
    },
    admitsSelectedLinks: values.selectedLinks !== undefined,
    evidence,
  };
}

function compatibilityResult(
  signals: PageSignals,
  adapter: Extract<CaptureAdapterId, "legacy_site_fields" | "generic_page">,
): CaptureAdapterResult {
  const site = siteFor(signals.pageUrl);
  const raw = site ? readSiteFields(site, signals.siteFields) : {};
  const evidence: FieldEvidence[] = [];

  for (const [field, value] of Object.entries(raw) as Array<
    [keyof AdapterFields, string]
  >) {
    if (!value) continue;
    evidence.push({
      field,
      value,
      method: "site_dom",
      identity: "unsupported",
      decision: "accepted",
    });
  }

  const projection = projectEvidence(evidence);
  return {
    adapter,
    fields: projection.values as AdapterFields,
    rejected: projection.rejected,
    postingIdentity: { support: "unsupported", observed: "unsupported" },
    // Compatibility paths preserve the pre-P1.1 selected-link behavior.
    admitsSelectedLinks: true,
    evidence,
  };
}

export const CAPTURE_ADAPTERS: readonly CaptureAdapter[] = [
  {
    id: "linkedin_identity_aware",
    matches: (signals) => siteFor(signals.pageUrl) === "linkedin",
    collect: linkedInResult,
  },
  {
    id: "legacy_site_fields",
    matches: (signals) => {
      const site = siteFor(signals.pageUrl);
      return site === "indeed" || site === "workday";
    },
    collect: (signals) => compatibilityResult(signals, "legacy_site_fields"),
  },
  {
    id: "generic_page",
    matches: () => true,
    collect: (signals) => compatibilityResult(signals, "generic_page"),
  },
];

/** Declared order is the tie-breaker; document order is never consulted. */
export function selectCaptureAdapter(
  signals: PageSignals,
  registry: readonly CaptureAdapter[] = CAPTURE_ADAPTERS,
): CaptureAdapter {
  const adapter = registry.find((candidate) => candidate.matches(signals));
  if (!adapter) {
    throw new Error("Capture adapter registry must end with a fallback adapter");
  }
  return adapter;
}

export function collectAdapterEvidence(signals: PageSignals): CaptureAdapterResult {
  return selectCaptureAdapter(signals).collect(signals);
}
