"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { ApplicationFields } from "@/components/applications/application-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateApplicationAction } from "@/lib/applications/actions";
import { initialApplicationState } from "@/lib/applications/state";
import type { ApplicationFormValues } from "@/lib/applications/types";

export function ApplicationEditForm({
  applicationId,
  defaultValues,
  expectedUpdatedAt,
}: {
  applicationId: string;
  defaultValues: ApplicationFormValues;
  expectedUpdatedAt: string;
}) {
  const updateAction = updateApplicationAction.bind(null, applicationId);
  const [state, formAction, pending] = useActionState(
    updateAction,
    initialApplicationState,
  );
  const submissionLocked = useRef(false);

  useEffect(() => {
    submissionLocked.current = false;
  }, [state]);

  return (
    <Card className="p-5 sm:p-6">
      <form
        action={formAction}
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          if (submissionLocked.current) {
            event.preventDefault();
            return;
          }
          submissionLocked.current = true;
        }}
      >
        <input
          name="expectedUpdatedAt"
          type="hidden"
          value={expectedUpdatedAt}
        />

        {state.message ? (
          <div
            aria-live="polite"
            className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <span>{state.message}</span>
          </div>
        ) : null}

        <ApplicationFields
          defaultValues={defaultValues}
          errors={state.fieldErrors}
          optionalDetailsOpen
        />

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <ButtonLink
            href={`/applications/${applicationId}`}
            variant="secondary"
          >
            Cancel
          </ButtonLink>
          <Button disabled={pending} type="submit">
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}
            {pending ? "Saving changes…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
