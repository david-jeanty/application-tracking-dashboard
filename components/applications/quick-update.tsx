import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearNextActionAction,
  updateApplicationStatusAction,
  updateNextActionAction,
} from "@/lib/applications/actions";
import { APPLICATION_STATUSES } from "@/lib/applications/constants";
import type { ApplicationRecord } from "@/lib/applications/types";

const selectClassName =
  "min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-foreground hover:border-foreground-muted focus:border-accent focus:outline-none focus-visible:outline-none sm:text-sm";
const labelClassName = "text-[13px] font-medium text-foreground";

/**
 * The two fields a student changes over and over, on the page they are already
 * looking at.
 *
 * Status and next action move every time something happens in a search, while
 * company, category, and salary are set once. Reaching the full edit form to
 * move an application from Applied to Interview meant loading fifteen other
 * fields and re-submitting the whole record; this does neither.
 *
 * Two independent forms rather than one. Saving a status and saving a follow-up
 * are separate intentions, and separate forms mean each posts only its own
 * fields — a status change carries no next action to write, and vice versa.
 * They are siblings because a form cannot be nested inside another.
 *
 * Everything here is server-rendered and posts to a Server Action, so the
 * section works with no client JavaScript and adds no state to keep in sync
 * with the record shown below it.
 *
 * Renders nothing for an archived application. The rule lives here rather than
 * in the page so it travels with the component and cannot be forgotten by a
 * second caller — an archived record is out of the working set, so a section
 * built to keep a live search moving would be noise. That is the courtesy, not
 * the guard: both mutations require `archived_at is null` in the statement
 * itself, so a crafted post against an archived record changes nothing either
 * way.
 */
export function QuickUpdate({
  application,
}: {
  application: ApplicationRecord;
}) {
  if (application.archived_at) return null;

  return (
    <section className="pt-6">
      <h2 className="border-b border-border pb-2 text-base font-semibold text-foreground">
        Quick update
      </h2>

      <div className="grid gap-6 pt-4 lg:grid-cols-2">
        <form
          action={updateApplicationStatusAction}
          className="flex flex-col gap-1.5"
        >
          <input name="applicationId" type="hidden" value={application.id} />
          <label className={labelClassName} htmlFor="quickStatus">
            Status
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              className={selectClassName}
              defaultValue={application.current_status}
              id="quickStatus"
              name="currentStatus"
            >
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <Button className="sm:shrink-0" type="submit" variant="secondary">
              Save status
            </Button>
          </div>
        </form>

        <form
          action={updateNextActionAction}
          className="flex flex-col gap-3"
        >
          <input name="applicationId" type="hidden" value={application.id} />
          <div className="flex flex-col gap-1.5">
            <label className={labelClassName} htmlFor="quickNextAction">
              Next action
            </label>
            <Input
              defaultValue={application.next_action ?? ""}
              id="quickNextAction"
              maxLength={500}
              name="nextAction"
              placeholder="Follow up with recruiter"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={labelClassName} htmlFor="quickNextActionDueDate">
              Due date
            </label>
            <Input
              aria-describedby="quickNextActionDueDateHint"
              className="sm:max-w-56"
              defaultValue={application.next_action_due_date ?? ""}
              id="quickNextActionDueDate"
              name="nextActionDueDate"
              type="date"
            />
            {/*
              Said plainly rather than enforced with a validation error: a due
              date on its own describes nothing, so the write drops it. A
              student who empties the action field sees "Next action cleared."
              and is not left wondering where their date went.
            */}
            <p
              className="text-[13px] leading-5 text-foreground-secondary"
              id="quickNextActionDueDateHint"
            >
              A due date is kept only alongside a next action.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="secondary">
              Save next action
            </Button>
            {/*
              Same form, different action. Clearing is the one case where the
              field values are irrelevant, so the button says what it does
              instead of asking the student to empty two inputs and save.
            */}
            <Button
              formAction={clearNextActionAction}
              type="submit"
              variant="ghost"
            >
              Clear
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
