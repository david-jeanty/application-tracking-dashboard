"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { LoaderCircle, X } from "lucide-react";
import { ApplicationFields } from "@/components/applications/application-fields";
import { createApplicationAction } from "@/lib/applications/actions";
import { initialApplicationState } from "@/lib/applications/state";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

/**
 * Add an application, without leaving the list it joins.
 *
 * Closed, this is one button beside the page title. Open, it is a section of
 * the applications page — a rule, a heading, and a form on a readable measure —
 * rather than a card dropped on top of the ledger. The page header wraps, so
 * the open form takes its own full-width line beneath the title instead of
 * being squeezed into the column the button occupied.
 */
export function ApplicationCreatePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createApplicationAction,
    initialApplicationState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const submissionLocked = useRef(false);

  useEffect(() => {
    submissionLocked.current = false;
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} type="button">
        Add application
      </Button>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <section
      aria-labelledby="add-application-heading"
      className="w-full border-t border-border pt-6"
    >
      {/* The header keeps the form's measure, so the close control sits at the
          form's edge rather than out at the far side of the workspace. */}
      <div className="flex max-w-[760px] items-start justify-between gap-4">
        <div>
          <h2
            className="text-[17px] font-medium text-foreground"
            id="add-application-heading"
          >
            Add application
          </h2>
          <p className="mt-1 text-[13px] leading-6 text-foreground-secondary">
            Required fields are marked with an asterisk.
          </p>
        </div>
        <Button
          aria-label="Close application form"
          className="px-2"
          onClick={() => setIsOpen(false)}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </Button>
      </div>

      {/*
        A form on its own measure. The workspace is as wide as the list needs;
        a row of inputs stretched across all of it is harder to fill in than
        two readable columns.
      */}
      <form
        action={formAction}
        className="mt-6 max-w-[760px] space-y-6"
        noValidate
        onSubmit={(event) => {
          if (submissionLocked.current) {
            event.preventDefault();
            return;
          }
          submissionLocked.current = true;
        }}
        ref={formRef}
      >
        {state.message ? (
          <Notice
            aria-live="polite"
            role={state.status === "error" ? "alert" : "status"}
            tone={state.status === "success" ? "success" : "error"}
          >
            {state.message}
          </Notice>
        ) : null}

        <ApplicationFields errors={errors} />

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button
            onClick={() => setIsOpen(false)}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin"
              />
            ) : null}
            {pending ? "Saving application…" : "Save application"}
          </Button>
        </div>
      </form>
    </section>
  );
}
