"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import { ApplicationFields } from "@/components/applications/application-fields";
import { JobDescriptionImport } from "@/components/applications/job-description-import";
import { PrefillSummary } from "@/components/applications/prefill-summary";
import { createApplicationAction } from "@/lib/applications/actions";
import { initialApplicationState } from "@/lib/applications/state";
import type { PrefillResult } from "@/lib/job-description-parser/map-to-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ApplicationCreatePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [prefill, setPrefill] = useState<PrefillResult | null>(null);
  /**
   * The fields are uncontrolled, so new defaults only take effect when they
   * remount. Bumping this key on each extraction forces that remount.
   */
  const [prefillKey, setPrefillKey] = useState(0);
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

  const succeeded = state.status === "success";
  // Discarded on success so a saved application does not leave stale defaults
  // behind, but retained through validation errors so nothing typed is lost.
  const activePrefill = succeeded ? null : prefill;

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} type="button">
        <Plus aria-hidden="true" className="size-4" />
        Add application
      </Button>
    );
  }

  const errors = state.fieldErrors ?? {};

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Add application
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Required fields are marked with an asterisk. Category selection is
            manual in this phase.
          </p>
        </div>
        <Button
          aria-label="Close application form"
          className="min-h-10 px-3"
          onClick={() => setIsOpen(false)}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>

      <form
        action={formAction}
        className="mt-6 space-y-6"
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
          <div
            aria-live="polite"
            className={
              state.status === "success"
                ? "flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                : "rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            }
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.status === "success" ? (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
            ) : null}
            <span>{state.message}</span>
          </div>
        ) : null}

        <JobDescriptionImport
          onExtract={(result) => {
            setPrefill(result);
            setPrefillKey((current) => current + 1);
          }}
        />

        {activePrefill ? <PrefillSummary decisions={activePrefill.decisions} /> : null}

        {/*
          Keyed on the extraction count and on success only. A validation error
          leaves the key untouched, so the user's in-progress edits survive.
        */}
        <ApplicationFields
          defaultValues={activePrefill?.values}
          errors={errors}
          extractionRan={Boolean(activePrefill)}
          key={`${prefillKey}-${succeeded}`}
          optionalDetailsOpen={Boolean(activePrefill)}
        />

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
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
    </Card>
  );
}
