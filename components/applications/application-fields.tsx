import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  WORK_ARRANGEMENTS,
} from "@/lib/applications/constants";
import type { ApplicationFormValues } from "@/lib/applications/types";

/*
 * The native controls, borrowing `Input`'s border language rather than their
 * own. They used to carry `border-strong` and a `foreground-muted` hover while
 * the text input beside them in the same grid row carried a hairline, so half
 * of every row of this form was outlined more heavily than the other half.
 * Their height is unchanged: 44px is a comfortable target for a select on a
 * phone, and nothing about the borders required shrinking it.
 */
const selectClassName =
  "min-h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none sm:text-sm";
const textareaClassName =
  "min-h-28 w-full resize-y rounded-control border border-border bg-surface px-3 py-3 text-base text-foreground transition-colors placeholder:text-foreground-muted hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none sm:text-sm";

function Field({
  children,
  className,
  error,
  hint,
  id,
  label,
  required = false,
}: {
  children: ReactNode;
  className?: string;
  error?: string[];
  /**
   * One short line under the control, for a field whose purpose is not
   * obvious from its label. It is associated with the input through
   * `aria-describedby`, so it is read rather than merely seen.
   */
  hint?: string;
  id: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-danger">
            *
          </span>
        ) : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint ? (
        <p className="mt-1.5 text-sm text-foreground-muted" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error?.length ? (
        <p className="mt-1.5 text-sm text-danger" id={`${id}-error`}>
          {error[0]}
        </p>
      ) : null}
    </div>
  );
}

export function ApplicationFields({
  defaultValues,
  errors = {},
  optionalDetailsOpen = false,
}: {
  defaultValues?: Partial<ApplicationFormValues>;
  errors?: Record<string, string[]>;
  optionalDetailsOpen?: boolean;
}) {
  const describedBy = (name: string) =>
    errors[name]?.length ? `${name}-error` : undefined;

  /** A hinted field is described by its hint, and by its error when it has one. */
  const describedByWithHint = (name: string) =>
    [`${name}-hint`, errors[name]?.length ? `${name}-error` : null]
      .filter(Boolean)
      .join(" ");

  return (
    <>
      <fieldset>
        <legend className="mb-5 text-[15px] font-medium text-foreground">
          Core details
        </legend>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
          <Field
          className="lg:col-span-3"
          error={errors.companyName}
          id="companyName"
          label="Company name"
          required
        >
          <Input
            aria-describedby={describedBy("companyName")}
            aria-invalid={Boolean(errors.companyName)}
            autoComplete="organization"
            defaultValue={defaultValues?.companyName}
            id="companyName"
            maxLength={160}
            name="companyName"
            required
          />
          </Field>
          <Field
          className="lg:col-span-3"
          error={errors.originalJobTitle}
          id="originalJobTitle"
          label="Original job title"
          required
        >
          <Input
            aria-describedby={describedBy("originalJobTitle")}
            aria-invalid={Boolean(errors.originalJobTitle)}
            defaultValue={defaultValues?.originalJobTitle}
            id="originalJobTitle"
            maxLength={200}
            name="originalJobTitle"
            required
          />
          </Field>
          <Field
          className="lg:col-span-2"
          error={errors.normalizedJobCategory}
          id="normalizedJobCategory"
          label="Normalized category"
          required
        >
          <select
            aria-describedby={describedBy("normalizedJobCategory")}
            aria-invalid={Boolean(errors.normalizedJobCategory)}
            className={selectClassName}
            defaultValue={defaultValues?.normalizedJobCategory ?? ""}
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
          className="lg:col-span-2"
          error={errors.currentStatus}
          id="currentStatus"
          label="Current status"
          required
        >
          <select
            aria-describedby={describedBy("currentStatus")}
            aria-invalid={Boolean(errors.currentStatus)}
            className={selectClassName}
            defaultValue={defaultValues?.currentStatus ?? ""}
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
          className="lg:col-span-2"
          error={errors.workTermSeason}
          id="workTermSeason"
          label="Work-term season"
          required
        >
          <Input
            aria-describedby={describedBy("workTermSeason")}
            aria-invalid={Boolean(errors.workTermSeason)}
            defaultValue={defaultValues?.workTermSeason}
            id="workTermSeason"
            maxLength={80}
            name="workTermSeason"
            placeholder="Summer 2027"
            required
          />
          </Field>
        </div>
      </fieldset>

      {/*
        Still a native disclosure — the browser gives it a focusable summary,
        keyboard operation and an announced expanded state for nothing. What
        changed is the box: a filled, bordered panel made a section of one form
        look like a second card, so it is a rule and a heading now, the same
        shape the detail page's disclosures use.
      */}
      <details className="group border-t border-border pt-4" open={optionalDetailsOpen}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          Optional details
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-foreground-muted transition-transform group-open:rotate-90"
            strokeWidth={1.5}
          />
        </summary>
        <div className="grid gap-5 pt-5 sm:grid-cols-2 lg:grid-cols-6">
          <Field className="lg:col-span-3" error={errors.location} id="location" label="Location">
            <Input
              aria-describedby={describedBy("location")}
              aria-invalid={Boolean(errors.location)}
              defaultValue={defaultValues?.location}
              id="location"
              maxLength={200}
              name="location"
              placeholder="Toronto, ON"
            />
          </Field>
          <Field
            className="lg:col-span-3"
            error={errors.workArrangement}
            id="workArrangement"
            label="Work arrangement"
          >
            <select
              aria-describedby={describedBy("workArrangement")}
              aria-invalid={Boolean(errors.workArrangement)}
              className={selectClassName}
              defaultValue={defaultValues?.workArrangement ?? ""}
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
            className="lg:col-span-3"
            error={errors.companyDomain}
            hint="Optional. Used to display the company logo."
            id="companyDomain"
            label="Company website"
          >
            <Input
              aria-describedby={describedByWithHint("companyDomain")}
              aria-invalid={Boolean(errors.companyDomain)}
              autoComplete="off"
              defaultValue={defaultValues?.companyDomain}
              id="companyDomain"
              maxLength={2048}
              name="companyDomain"
              placeholder="shopify.com"
            />
          </Field>
          <Field
            className="lg:col-span-3"
            error={errors.applicationUrl}
            id="applicationUrl"
            label="Application URL"
          >
            <Input
              aria-describedby={describedBy("applicationUrl")}
              aria-invalid={Boolean(errors.applicationUrl)}
              defaultValue={defaultValues?.applicationUrl}
              id="applicationUrl"
              maxLength={2048}
              name="applicationUrl"
              placeholder="https://company.example/jobs/role"
              type="url"
            />
          </Field>
          <Field
            className="lg:col-span-2"
            error={errors.applicationSource}
            id="applicationSource"
            label="Application source"
          >
            <Input
              aria-describedby={describedBy("applicationSource")}
              aria-invalid={Boolean(errors.applicationSource)}
              defaultValue={defaultValues?.applicationSource}
              id="applicationSource"
              maxLength={100}
              name="applicationSource"
              placeholder="Company website"
            />
          </Field>
          <Field
            className="lg:col-span-2"
            error={errors.applicationDeadline}
            id="applicationDeadline"
            label="Application deadline"
          >
            <Input
              aria-describedby={describedBy("applicationDeadline")}
              aria-invalid={Boolean(errors.applicationDeadline)}
              defaultValue={defaultValues?.applicationDeadline}
              id="applicationDeadline"
              name="applicationDeadline"
              type="date"
            />
          </Field>
          <Field
            className="lg:col-span-2"
            error={errors.dateApplied}
            id="dateApplied"
            label="Date applied"
          >
            <Input
              aria-describedby={describedBy("dateApplied")}
              aria-invalid={Boolean(errors.dateApplied)}
              defaultValue={defaultValues?.dateApplied}
              id="dateApplied"
              name="dateApplied"
              type="date"
            />
          </Field>
          <Field
            className="lg:col-span-2"
            error={errors.workTermDuration}
            id="workTermDuration"
            label="Work-term duration"
          >
            <Input
              aria-describedby={describedBy("workTermDuration")}
              aria-invalid={Boolean(errors.workTermDuration)}
              defaultValue={defaultValues?.workTermDuration}
              id="workTermDuration"
              maxLength={80}
              name="workTermDuration"
              placeholder="4 months"
            />
          </Field>
          <Field className="lg:col-span-2" error={errors.salary} id="salary" label="Salary">
            <Input
              aria-describedby={describedBy("salary")}
              aria-invalid={Boolean(errors.salary)}
              defaultValue={defaultValues?.salary}
              id="salary"
              maxLength={100}
              name="salary"
              placeholder="$20–$25/hour"
            />
          </Field>
          <Field className="lg:col-span-4" error={errors.nextAction} id="nextAction" label="Next action">
            <Input
              aria-describedby={describedBy("nextAction")}
              aria-invalid={Boolean(errors.nextAction)}
              defaultValue={defaultValues?.nextAction}
              id="nextAction"
              maxLength={500}
              name="nextAction"
              placeholder="Follow up with recruiter"
            />
          </Field>
          <Field
            className="lg:col-span-2"
            error={errors.nextActionDueDate}
            id="nextActionDueDate"
            label="Next-action due date"
          >
            <Input
              aria-describedby={describedBy("nextActionDueDate")}
              aria-invalid={Boolean(errors.nextActionDueDate)}
              defaultValue={defaultValues?.nextActionDueDate}
              id="nextActionDueDate"
              name="nextActionDueDate"
              type="date"
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-6">
            <Field
              error={errors.jobDescription}
              id="jobDescription"
              label="Job description"
            >
              <textarea
                aria-describedby={describedBy("jobDescription")}
                aria-invalid={Boolean(errors.jobDescription)}
                className={textareaClassName}
                defaultValue={defaultValues?.jobDescription}
                id="jobDescription"
                maxLength={50000}
                name="jobDescription"
              />
            </Field>
          </div>
          <div className="sm:col-span-2 lg:col-span-6">
            <Field error={errors.notes} id="notes" label="Notes">
              <textarea
                aria-describedby={describedBy("notes")}
                aria-invalid={Boolean(errors.notes)}
                className={textareaClassName}
                defaultValue={defaultValues?.notes}
                id="notes"
                maxLength={20000}
                name="notes"
              />
            </Field>
          </div>
        </div>
      </details>
    </>
  );
}
