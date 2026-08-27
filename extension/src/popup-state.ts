import type {
  CaptureOutcome,
  CaptureStatus,
  ExtractedJob,
} from "./types.js";
import type { ConnectResult } from "./auth.js";

/**
 * What the popup is showing, as a value rather than as a pile of DOM state.
 *
 * The popup has more states than its size suggests — signed out, connecting,
 * reading the page, ready with everything, ready with gaps, saving, rejected,
 * offline, unauthorized, duplicate, saved — and every one of them has to be
 * legible in a 360-pixel window. Keeping the whole machine here as pure data
 * means each of those can be asserted in a test without a browser, and the
 * rendering code stays a translation of one value instead of a set of
 * independently toggled flags that can contradict each other.
 */

/** The three values the student can correct before saving. */
export type CaptureForm = {
  company: string;
  jobTitle: string;
  location: string;
  status: CaptureStatus;
};

export type PopupState =
  | { view: "loading" }
  | { view: "disconnected" }
  | { view: "connecting" }
  | { view: "connect_failed"; message: string }
  | { view: "extracting" }
  | { view: "extraction_failed"; message: string }
  | {
      view: "ready";
      job: ExtractedJob;
      form: CaptureForm;
      /** Set when a save was refused, so the reason stays beside the form. */
      problem?: { message: string; issues?: string[] };
    }
  | { view: "saving"; job: ExtractedJob; form: CaptureForm }
  | { view: "unauthorized" }
  | {
      view: "saved";
      duplicate: boolean;
      application: { company: string; jobTitle: string; url: string };
    };

export type PopupEvent =
  | { type: "connection"; connected: boolean }
  | { type: "connect_started" }
  | { type: "connect_result"; result: ConnectResult }
  | { type: "extraction_started" }
  | { type: "extracted"; job: ExtractedJob }
  | { type: "extraction_failed"; message: string }
  | { type: "field_changed"; field: keyof CaptureForm; value: string }
  | { type: "save_started" }
  | { type: "save_result"; outcome: CaptureOutcome };

export function initialState(): PopupState {
  return { view: "loading" };
}

/**
 * The starting form values: what was extracted, and `Interested` by default.
 *
 * Status is not inferred. Nothing visible on a job page tells the extension
 * whether the student has applied — being on the application form does not mean
 * they submitted it — so the default is the one that is true of every capture:
 * they are interested enough to save it.
 */
export function formFor(job: ExtractedJob): CaptureForm {
  return {
    company: job.company ?? "",
    jobTitle: job.jobTitle ?? "",
    location: job.location ?? "",
    status: "Interested",
  };
}

/** Whether the form holds the two values JobTrack requires. */
export function canSave(state: PopupState): boolean {
  if (state.view !== "ready") return false;

  return (
    state.form.company.trim().length > 0 && state.form.jobTitle.trim().length > 0
  );
}

/** Whether the page gave enough that the student is confirming, not typing. */
export function isIncomplete(job: ExtractedJob): boolean {
  return !job.company || !job.jobTitle;
}

const CONNECT_MESSAGES: Record<Exclude<ConnectResult["status"], "connected">, string> = {
  cancelled: "Connecting was cancelled. Try again when you are ready.",
  denied: "JobTrack was not given access. Try connecting again to approve it.",
  state_mismatch:
    "That sign-in response could not be verified, so it was rejected. Try connecting again.",
  no_code: "Sign-in did not complete. Try connecting again.",
  token_rejected: "JobTrack could not finish signing you in. Try connecting again.",
  network_error: "JobTrack could not be reached. Check your connection and try again.",
};

const OUTCOME_MESSAGES = {
  network_error: "JobTrack could not be reached. Check your connection and try again.",
  server_error: "JobTrack could not save this job. Try again in a moment.",
  invalid: "JobTrack could not accept this job.",
} as const;

/**
 * The one place a popup state changes.
 *
 * A save that fails returns to `ready` with the reason attached rather than
 * replacing the form with an error screen: the student has just typed a company
 * name, and throwing that away to show a message would make a recoverable
 * problem feel like a lost one.
 */
export function reduce(state: PopupState, event: PopupEvent): PopupState {
  switch (event.type) {
    case "connection":
      return event.connected ? { view: "extracting" } : { view: "disconnected" };

    case "connect_started":
      return { view: "connecting" };

    case "connect_result":
      return event.result.status === "connected"
        ? { view: "extracting" }
        : {
            view: "connect_failed",
            message: CONNECT_MESSAGES[event.result.status],
          };

    case "extraction_started":
      return { view: "extracting" };

    case "extracted":
      return { view: "ready", job: event.job, form: formFor(event.job) };

    case "extraction_failed":
      return { view: "extraction_failed", message: event.message };

    case "field_changed": {
      if (state.view !== "ready") return state;

      // Each field is assigned by name rather than through a computed key, so
      // status stays one of the two values the popup offers instead of
      // whatever string arrived from a control.
      const form: CaptureForm =
        event.field === "status"
          ? {
              ...state.form,
              status: event.value === "Applied" ? "Applied" : "Interested",
            }
          : event.field === "company"
            ? { ...state.form, company: event.value }
            : event.field === "jobTitle"
              ? { ...state.form, jobTitle: event.value }
              : { ...state.form, location: event.value };

      // Typing is an answer to the problem; keeping the message would leave a
      // stale complaint beside a corrected field.
      return { view: "ready", job: state.job, form };
    }

    case "save_started":
      return state.view === "ready"
        ? { view: "saving", job: state.job, form: state.form }
        : state;

    case "save_result": {
      if (state.view !== "saving") return state;

      switch (event.outcome.kind) {
        case "created":
          return {
            view: "saved",
            duplicate: false,
            application: event.outcome.application,
          };
        case "already_tracked":
          return {
            view: "saved",
            duplicate: true,
            application: event.outcome.application,
          };
        case "unauthorized":
          return { view: "unauthorized" };
        case "invalid":
          return {
            view: "ready",
            job: state.job,
            form: state.form,
            problem: {
              message: OUTCOME_MESSAGES.invalid,
              ...(event.outcome.issues.length > 0
                ? { issues: event.outcome.issues }
                : {}),
            },
          };
        case "network_error":
          return {
            view: "ready",
            job: state.job,
            form: state.form,
            problem: { message: OUTCOME_MESSAGES.network_error },
          };
        case "server_error":
          return {
            view: "ready",
            job: state.job,
            form: state.form,
            problem: { message: OUTCOME_MESSAGES.server_error },
          };
      }
    }
  }
}

/**
 * What the popup says about the page it just read.
 *
 * One line, and it never claims more than happened: a page that yielded
 * nothing says so, so a student who sees three empty boxes knows why and knows
 * that typing into them is the expected next step.
 */
export function describeExtraction(job: ExtractedJob): string {
  if (job.warnings.includes("no_job_posting_found")) {
    return "No job details found on this page — add them below.";
  }

  if (job.warnings.includes("description_too_long")) {
    return "Job description found, shortened to fit JobTrack.";
  }

  if (job.jobDescription) return "Job description found";

  return "No job description found on this page";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * `2026-09-13` as `Sep 13, 2026`, read as written.
 *
 * Built from the parts rather than through `Date`, because parsing the string
 * and formatting it back would put it through a timezone — and a deadline that
 * shifts a day in the display is the same bug the extractor refuses to create.
 */
export function formatCaptureDate(value: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return value;

  const month = MONTHS[Number(parts[2]) - 1];

  return month ? `${month} ${Number(parts[3])}, ${parts[1]}` : value;
}

/** One line of the read-only summary, as the popup will show it. */
export type FoundFact = { label: string; value: string };

/**
 * The facts that will be saved without the student having typed them.
 *
 * The popup asks them to confirm a company, a title, a location and a status.
 * It was also quietly sending a description, a deadline, a salary, a source and
 * the posting URL — real data, entering their tracker invisibly, which is how a
 * wrong deadline or a bogus salary survives unnoticed. This is the compact,
 * read-only answer to "what else is going in".
 *
 * It lists only what will actually be stored, so a deadline the extractor
 * refused never appears here as a promise. It is not the JobTrack form: no
 * category, no work term, no confidence score, nothing editable.
 */
export function alsoFound(job: ExtractedJob): FoundFact[] {
  const facts: FoundFact[] = [];

  if (job.jobDescription) {
    facts.push({
      label: "Job description",
      value: job.warnings.includes("description_too_long")
        ? "Saved, shortened"
        : "Saved",
    });
  }

  if (job.deadline) {
    facts.push({ label: "Deadline", value: formatCaptureDate(job.deadline) });
  }

  if (job.salary) facts.push({ label: "Salary", value: job.salary });

  // The rich facts, from the projected job and nowhere else: an ambiguous
  // candidate has no projected value, so it cannot be promised here. Only the
  // value is shown — where it came from and how sure the extractor was are
  // troubleshooting details, not something to make a student read.
  if (job.workArrangement) {
    facts.push({ label: "Work arrangement", value: job.workArrangement });
  }
  if (job.workTerm) facts.push({ label: "Work term", value: job.workTerm });
  if (job.duration) facts.push({ label: "Duration", value: job.duration });

  if (job.source) facts.push({ label: "Source", value: job.source });
  if (job.jobUrl) facts.push({ label: "Original posting", value: "Saved" });

  return facts;
}
