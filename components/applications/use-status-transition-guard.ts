"use client";

import { useCallback, useRef, useState } from "react";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/lib/applications/constants";
import {
  assessStatusTransition,
  type StatusTransitionReason,
} from "@/lib/applications/status-transitions";

export type PendingStatusTransition = {
  to: ApplicationStatus;
  reason: StatusTransitionReason;
};

/**
 * The interception behind every status-change confirmation in the app.
 *
 * One hook, three callers (the detail page's quick update, the pipeline
 * board's move control, and the full edit form), so the decision of *when*
 * to interrupt a submission lives in exactly one place. What counts as
 * unusual is not decided here either — that is `assessStatusTransition` —
 * this only turns "unusual" into "pause before this form submits."
 *
 * `intercept` is meant to be called from a form's `onSubmit`, before any
 * other submit handling a caller already has (the edit form's own
 * double-submit lock, for instance): it returns `true` exactly when the
 * caller must call `event.preventDefault()` and stop, because a confirmation
 * is now pending.
 *
 * A submission the student actually confirms must reach the Server Action
 * exactly once, and confirming must not re-trigger the same prompt. `confirm`
 * calls `form.requestSubmit()`, which fires `onSubmit` again; `bypassNextCheck`
 * is a one-shot flag that lets that specific resubmission through unchecked,
 * so nothing here loops. `confirmed` guards the other way a submission could
 * double up — two clicks on the dialog's own confirm button before it has
 * unmounted — by letting only the first call through.
 */
export function useStatusTransitionGuard({
  currentStatus,
  statusFieldName = "currentStatus",
}: {
  currentStatus: ApplicationStatus;
  statusFieldName?: string;
}) {
  const [pending, setPending] = useState<PendingStatusTransition | null>(null);
  const bypassNextCheck = useRef(false);
  const confirmed = useRef(false);

  const intercept = useCallback(
    (form: HTMLFormElement): boolean => {
      if (bypassNextCheck.current) {
        bypassNextCheck.current = false;
        return false;
      }

      const selected = new FormData(form).get(statusFieldName);
      if (typeof selected !== "string") return false;
      if (!(APPLICATION_STATUSES as readonly string[]).includes(selected)) {
        return false;
      }

      const assessment = assessStatusTransition(
        currentStatus,
        selected as ApplicationStatus,
      );
      if (!assessment.isUnusual) return false;

      setPending({ to: selected as ApplicationStatus, reason: assessment.reason });
      return true;
    },
    [currentStatus, statusFieldName],
  );

  const confirm = useCallback((form: HTMLFormElement) => {
    if (confirmed.current) return;
    confirmed.current = true;

    setPending(null);
    bypassNextCheck.current = true;
    form.requestSubmit();
  }, []);

  const cancel = useCallback(() => setPending(null), []);

  return { cancel, confirm, intercept, pending };
}
