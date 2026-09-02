import {
  projectEvidence,
  worstObservedIdentity,
  type EvidenceFieldName,
  type EvidenceIdentityState,
  type EvidenceMethod,
  type EvidenceRejectionCode,
  type FieldEvidence,
} from "./evidence.js";
import { correlateObservedPosting, routeIdentityFor } from "./identity.js";
import { readSiteFields, siteFor, type SiteFieldKey } from "./sites.js";
import { employerDomainFromUrl } from "./source.js";
import type { ObservedPostingField, PageSignals } from "./types.js";

export type CaptureAdapterId =
  | "linkedin_identity_aware"
  | "workday_identity_aware"
  | "legacy_site_fields"
  | "generic_page";

type AdapterFields = {
  company?: string;
  jobTitle?: string;
  location?: string;
  jobDescription?: string;
  workplaceType?: string;
  companyDomain?: string;
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

const RAW_FIELD_FOR: Record<
  Exclude<keyof AdapterFields, "companyDomain">,
  SiteFieldKey
> = {
  company: "company",
  jobTitle: "title",
  location: "location",
  jobDescription: "description",
  workplaceType: "workplaceType",
};

/** Final trust-boundary check for a Workday logo's bounded accessible name. */
function plausibleBoardEmployerName(value: string): boolean {
  return (
    value.length <= 160 &&
    /[a-z]/i.test(value) &&
    !/^(?:canada|united states|usa|us|global|english|fran[cç]ais|company|logo|careers?|jobs?|home(?:page)?)$/i.test(
      value,
    ) &&
    !/^https?:|\.[a-z]{2,}(?:\/|$)/i.test(value)
  );
}

function observationsFor(
  signals: PageSignals,
  field: ObservedPostingField,
): readonly (readonly string[])[] {
  return (signals.observedPosting?.fields ?? [])
    .filter((observation) => observation.field === field)
    .map((observation) => observation.jobIds);
}

function observedIdsFor(
  signals: PageSignals,
  field: ObservedPostingField,
): string[] {
  return [...new Set(observationsFor(signals, field).flat())];
}

function identityForField(
  signals: PageSignals,
  field: ObservedPostingField,
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

function identityAwareResult(
  signals: PageSignals,
  site: Extract<ReturnType<typeof siteFor>, "linkedin" | "workday">,
  adapter: Extract<
    CaptureAdapterId,
    "linkedin_identity_aware" | "workday_identity_aware"
  >,
): CaptureAdapterResult {
  const raw = readSiteFields(site, signals.siteFields);
  const candidates: Array<{
    field: keyof AdapterFields | "selectedLinks";
    value: string;
    rawField: ObservedPostingField;
    method?: EvidenceMethod;
  }> = [];

  for (const field of Object.keys(RAW_FIELD_FOR) as Array<
    Exclude<keyof AdapterFields, "companyDomain">
  >) {
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
  if (site === "workday" && signals.boardEmployer) {
    /**
     * The destination and the name are judged apart, because they answer
     * different questions and fail for different reasons.
     *
     * A domain is admitted on the strength of where the board's own link
     * points, after the ATS/board/social/redirector rejection list has had it.
     * A name is admitted on the strength of what the board called itself, and
     * a decorative label — `Company Logo`, a file name, a region — establishes
     * nothing. Tying the first to the second meant a board with a decorative
     * label published no employer domain either, and the dashboard drew a
     * lettermark for an employer whose own site the page had stated. Both
     * still pass through the same selected-root identity gate below; neither
     * is admitted on a root that could not be tied to the current posting.
     */
    const companyDomain = employerDomainFromUrl(signals.boardEmployer.url);
    if (companyDomain) {
      candidates.push({
        field: "companyDomain",
        value: companyDomain,
        rawField: "boardEmployer",
        method: "board_branding",
      });

      const name = signals.boardEmployer.name;
      if (name && plausibleBoardEmployerName(name)) {
        candidates.push({
          field: "company",
          value: name,
          rawField: "boardEmployer",
          method: "board_branding",
        });
      }
    }
  }
  if (site === "workday" && signals.selectedLinks?.employerUrl) {
    const companyDomain = employerDomainFromUrl(
      signals.selectedLinks.employerUrl,
    );
    if (companyDomain) {
      candidates.push({
        field: "companyDomain",
        value: companyDomain,
        rawField: "selectedLinks",
        method: "board_branding",
      });
    }
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
          candidate.method ??
          (candidate.field === "selectedLinks"
            ? "selected_posting_links"
            : "site_dom"),
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
        candidate.method ??
        (candidate.field === "selectedLinks"
          ? "selected_posting_links"
          : "site_dom"),
      identity,
      decision: "rejected",
      reason,
    };
  });

  const projection = projectEvidence(evidence);
  const values = projection.values;

  return {
    adapter,
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
      ...(values.companyDomain
        ? { companyDomain: values.companyDomain }
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
    collect: (signals) =>
      identityAwareResult(signals, "linkedin", "linkedin_identity_aware"),
  },
  {
    id: "workday_identity_aware",
    matches: (signals) => {
      const route = routeIdentityFor(signals.pageUrl);
      return route.site === "workday" && route.jobId !== undefined;
    },
    collect: (signals) =>
      identityAwareResult(signals, "workday", "workday_identity_aware"),
  },
  {
    id: "legacy_site_fields",
    matches: (signals) => {
      const site = siteFor(signals.pageUrl);
      // Greenhouse has no selectors of its own (see sites.ts) and so
      // contributes no site-DOM fields here either; it shares this tier with
      // Indeed because both are recognized sites without page-local identity
      // evidence of their own. Every Greenhouse value still comes from the
      // structured-data path ahead of adapter selection.
      return site === "indeed" || site === "workday" || site === "greenhouse";
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
