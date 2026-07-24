import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  APPLICATION_STATUSES,
  JOB_CATEGORIES,
  WORK_ARRANGEMENTS,
} from "@/lib/applications/constants";
import type { ApplicationFormValues } from "@/lib/applications/types";

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

  return (
    <>
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
            defaultValue={defaultValues?.companyName}
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
            defaultValue={defaultValues?.originalJobTitle}
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

      <details
        className="rounded-xl border border-slate-200 bg-slate-50/60"
        open={optionalDetailsOpen}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
          Optional details
        </summary>
        <div className="grid gap-5 border-t border-slate-200 p-4 sm:grid-cols-2">
          <Field error={errors.location} id="location" label="Location">
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
          <Field error={errors.salary} id="salary" label="Salary">
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
          <Field error={errors.nextAction} id="nextAction" label="Next action">
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
                defaultValue={defaultValues?.jobDescription}
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
