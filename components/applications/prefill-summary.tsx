import { AlertTriangle, Check, Minus } from "lucide-react";
import type { PrefillDecision } from "@/lib/job-description-parser/map-to-form";
import type { ExtractionConfidence } from "@/lib/job-description-parser/types";

const CONFIDENCE_STYLES: Record<string, string> = {
  High: "bg-emerald-100 text-emerald-900",
  Medium: "bg-amber-100 text-amber-900",
  Low: "bg-slate-200 text-slate-700",
  "Not found": "bg-slate-200 text-slate-600",
};

function confidenceLabel(confidence: ExtractionConfidence): string {
  return confidence ?? "Not found";
}

/**
 * Shows what the parser did and did not fill in. Fields it was unsure about are
 * listed explicitly rather than left silently blank, so the user knows to look.
 */
export function PrefillSummary({ decisions }: { decisions: PrefillDecision[] }) {
  const applied = decisions.filter((decision) => decision.applied);
  const review = decisions.filter((decision) => !decision.applied);

  return (
    <section
      aria-live="polite"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <h3 className="text-sm font-semibold text-slate-900">
        Filled {applied.length} of {decisions.length} fields
      </h3>
      <p className="mt-0.5 text-sm text-slate-600">
        Everything below is editable. Check each value before saving.
      </p>

      <ul className="mt-3 divide-y divide-slate-100">
        {decisions.map((decision) => (
          <li className="flex items-start gap-3 py-2.5" key={decision.field}>
            {decision.applied ? (
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-emerald-600"
              />
            ) : (
              <Minus
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-slate-400"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {decision.label}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    CONFIDENCE_STYLES[confidenceLabel(decision.confidence)]
                  }`}
                >
                  {confidenceLabel(decision.confidence)}
                </span>
                {!decision.applied && decision.confidence ? (
                  <span className="text-xs text-slate-500">
                    left blank for review
                  </span>
                ) : null}
              </div>
              {decision.evidence ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  {decision.evidence}
                </p>
              ) : null}
              {decision.warnings.map((warning) => (
                <p
                  className="mt-1 flex items-start gap-1.5 text-xs text-amber-800"
                  key={warning}
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-3 shrink-0"
                  />
                  <span>{warning}</span>
                </p>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {review.length ? (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
          {review.length} field{review.length === 1 ? "" : "s"} could not be read
          confidently and {review.length === 1 ? "was" : "were"} left for you to
          fill in.
        </p>
      ) : null}
    </section>
  );
}
