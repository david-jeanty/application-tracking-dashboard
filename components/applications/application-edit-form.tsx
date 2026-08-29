"use client";

import { useActionState, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { ApplicationFields } from "@/components/applications/application-fields";
import { Button, ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
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
    /*
      The form is the page, on a readable measure. It used to sit inside a
      card, which drew a box around the only thing on the screen.
    */
    <div className="mt-8 max-w-[960px] border-t border-border pt-6">
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
          <Notice aria-live="polite" tone="error">
            {state.message}
          </Notice>
        ) : null}

        <ApplicationFields
          defaultValues={defaultValues}
          errors={state.fieldErrors}
          optionalDetailsOpen
        />

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
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
    </div>
  );
}
