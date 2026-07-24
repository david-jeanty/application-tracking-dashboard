"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, LoaderCircle, Plus, X } from "lucide-react";
import { createApplicationAction } from "@/lib/applications/actions";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  WORK_ARRANGEMENTS,
} from "@/lib/applications/constants";
import { initialApplicationState } from "@/lib/applications/state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const selectClassName =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-950 shadow-sm hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-100 sm:text-sm";
const textareaClassName =
  "min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-950 shadow-sm placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-100 sm:text-sm";

function Field({
  children,
  error,
  id,
  label,
  required = false,
}: {
  children: ReactNode;
  error?: string[];
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-800" htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-red-600">
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error?.length ? (
        <p className="mt-1.5 text-sm text-red-700" id={`${id}-error`}>
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

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
  const describedBy = (name: string) =>
    errors[name]?.length ? `${name}-error` : undefined;

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

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            error={errors.companyName}
            id="companyName"
            label="Company name"
            required
          >
            <Input
              aria-describedby={describedBy("companyName")}
              aria-invalid={Boolean(errors.companyName)}
              autoComplete="organization"
              id="companyName"
              maxLength={160}
              name="companyName"
              required
            />
          </Field>
          <Field
            error={errors.originalJobTitle}
            id="originalJobTitle"
            label="Original job title"
            required
          >
            <Input
              aria-describedby={describedBy("originalJobTitle")}
              aria-invalid={Boolean(errors.originalJobTitle)}
              id="originalJobTitle"
              maxLength={200}
              name="originalJobTitle"
              required
            />
          </Field>
          <Field
            error={errors.normalizedJobCategory}
            id="normalizedJobCategory"
            label="Normalized category"
            required
          >
            <select
              aria-describedby={describedBy("normalizedJobCategory")}
              aria-invalid={Boolean(errors.normalizedJobCategory)}
              className={selectClassName}
              defaultValue=""
              id="normalizedJobCategory"
              name="normalizedJobCategory"
              required
            >
              <option disabled value="">
                Select a category
              </option>
              {JOB_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field
            error={errors.currentStatus}
            id="currentStatus"
            label="Current status"
            required
          >
            <select
              aria-describedby={describedBy("currentStatus")}
              aria-invalid={Boolean(errors.currentStatus)}
              className={selectClassName}
              defaultValue=""
              id="currentStatus"
              name="currentStatus"
              required
            >
              <option disabled value="">
                Select a status
              </option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </Field>
          <Field
            error={errors.workTermSeason}
            id="workTermSeason"
            label="Work-term season"
            required
          >
            <Input
              aria-describedby={describedBy("workTermSeason")}
              aria-invalid={Boolean(errors.workTermSeason)}
              id="workTermSeason"
              maxLength={80}
              name="workTermSeason"
              placeholder="Summer 2027"
              required
            />
          </Field>
        </div>

        <details className="rounded-xl border border-slate-200 bg-slate-50/60">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
            Optional details
          </summary>
          <div className="grid gap-5 border-t border-slate-200 p-4 sm:grid-cols-2">
            <Field error={errors.location} id="location" label="Location">
              <Input
                aria-describedby={describedBy("location")}
                aria-invalid={Boolean(errors.location)}
                id="location"
                maxLength={200}
                name="location"
                placeholder="Toronto, ON"
              />
            </Field>
            <Field
              error={errors.workArrangement}
              id="workArrangement"
              label="Work arrangement"
            >
              <select
                aria-describedby={describedBy("workArrangement")}
                aria-invalid={Boolean(errors.workArrangement)}
                className={selectClassName}
                defaultValue=""
                id="workArrangement"
                name="workArrangement"
              >
                <option value="">Not specified</option>
                {WORK_ARRANGEMENTS.map((arrangement) => (
                  <option key={arrangement} value={arrangement}>
                    {arrangement}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              error={errors.applicationUrl}
              id="applicationUrl"
              label="Application URL"
            >
              <Input
                aria-describedby={describedBy("applicationUrl")}
                aria-invalid={Boolean(errors.applicationUrl)}
                id="applicationUrl"
                maxLength={2048}
                name="applicationUrl"
                placeholder="https://company.example/jobs/role"
                type="url"
              />
            </Field>
            <Field
              error={errors.applicationSource}
              id="applicationSource"
              label="Application source"
            >
              <Input
                aria-describedby={describedBy("applicationSource")}
                aria-invalid={Boolean(errors.applicationSource)}
                id="applicationSource"
                maxLength={100}
                name="applicationSource"
                placeholder="Company website"
              />
            </Field>
            <Field
              error={errors.applicationDeadline}
              id="applicationDeadline"
              label="Application deadline"
            >
              <Input
                aria-describedby={describedBy("applicationDeadline")}
                aria-invalid={Boolean(errors.applicationDeadline)}
                id="applicationDeadline"
                name="applicationDeadline"
                type="date"
              />
            </Field>
            <Field
              error={errors.dateApplied}
              id="dateApplied"
              label="Date applied"
            >
              <Input
                aria-describedby={describedBy("dateApplied")}
                aria-invalid={Boolean(errors.dateApplied)}
                id="dateApplied"
                name="dateApplied"
                type="date"
              />
            </Field>
            <Field
              error={errors.workTermDuration}
              id="workTermDuration"
              label="Work-term duration"
            >
              <Input
                aria-describedby={describedBy("workTermDuration")}
                aria-invalid={Boolean(errors.workTermDuration)}
                id="workTermDuration"
                maxLength={80}
                name="workTermDuration"
                placeholder="4 months"
              />
            </Field>
            <Field error={errors.salary} id="salary" label="Salary">
              <Input
                aria-describedby={describedBy("salary")}
                aria-invalid={Boolean(errors.salary)}
                id="salary"
                maxLength={100}
                name="salary"
                placeholder="$20–$25/hour"
              />
            </Field>
            <Field
              error={errors.nextAction}
              id="nextAction"
              label="Next action"
            >
              <Input
                aria-describedby={describedBy("nextAction")}
                aria-invalid={Boolean(errors.nextAction)}
                id="nextAction"
                maxLength={500}
                name="nextAction"
                placeholder="Follow up with recruiter"
              />
            </Field>
            <Field
              error={errors.nextActionDueDate}
              id="nextActionDueDate"
              label="Next-action due date"
            >
              <Input
                aria-describedby={describedBy("nextActionDueDate")}
                aria-invalid={Boolean(errors.nextActionDueDate)}
                id="nextActionDueDate"
                name="nextActionDueDate"
                type="date"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                error={errors.jobDescription}
                id="jobDescription"
                label="Job description"
              >
                <textarea
                  aria-describedby={describedBy("jobDescription")}
                  aria-invalid={Boolean(errors.jobDescription)}
                  className={textareaClassName}
                  id="jobDescription"
                  maxLength={50000}
                  name="jobDescription"
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field error={errors.notes} id="notes" label="Notes">
                <textarea
                  aria-describedby={describedBy("notes")}
                  aria-invalid={Boolean(errors.notes)}
                  className={textareaClassName}
                  id="notes"
                  maxLength={20000}
                  name="notes"
                />
              </Field>
            </div>
          </div>
        </details>

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
