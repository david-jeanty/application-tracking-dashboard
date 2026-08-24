"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import { ApplicationFields } from "@/components/applications/application-fields";
import { createApplicationAction } from "@/lib/applications/actions";
import { initialApplicationState } from "@/lib/applications/state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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
          <h2 className="text-lg font-semibold text-foreground">
            Add application
          </h2>
          <p className="mt-1 text-sm leading-6 text-foreground-secondary">
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
                ? "flex gap-2 rounded-control border border-success/30 bg-success-soft p-3 text-sm text-success"
                : "rounded-control border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
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
    </Card>
  );
}
