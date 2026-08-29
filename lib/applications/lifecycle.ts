import type { ApplicationStatus } from "@/lib/applications/constants";
import type { ApplicationStatusEvent } from "@/lib/applications/types";

/**
 * The coarse lifecycle Interndex draws as a rail.
 *
 * This is a visual summary layered over the ten exact statuses, not a second
 * status model. Nothing is stored against it, no column or enum backs it, and
 * the exact status a student chose is always rendered as text beside the rail.
 *
 * Every exact status belongs to exactly one stage, so the mapping is total and
 * a status can never fall through it.
 */
export const LIFECYCLE_STAGES = [
  {
    id: "saved",
    label: "Saved",
    /** Used where a full label will not fit, such as a narrow phone. */
    shortLabel: "Saved",
    statuses: ["Interested", "Preparing"],
  },
  {
    id: "applied",
    label: "Applied",
    shortLabel: "Applied",
    statuses: ["Applied"],
  },
  {
    id: "in-process",
    label: "In process",
    shortLabel: "Process",
    statuses: ["Screening", "Assessment"],
  },
  {
    id: "interview",
    label: "Interview",
    shortLabel: "Interview",
    statuses: ["Interview"],
  },
  {
    id: "outcome",
    label: "Outcome",
    shortLabel: "Outcome",
    statuses: ["Offer", "Accepted", "Rejected", "Withdrawn"],
  },
] as const satisfies readonly {
  id: string;
  label: string;
  shortLabel: string;
  statuses: readonly ApplicationStatus[];
}[];

/**
 * The calmer four-milestone projection used by the Applications index.
 *
 * Screening and Assessment remain exact statuses, but both sit within the
 * broader Applied milestone here. The five-stage detail rail above remains
 * unchanged for surfaces where that finer distinction has room to be useful.
 */
export const APPLICATION_INDEX_STAGES = [
  {
    id: "saved",
    label: "Saved",
    shortLabel: "Saved",
    statuses: ["Interested", "Preparing"],
  },
  {
    id: "applied",
    label: "Applied",
    shortLabel: "Applied",
    statuses: ["Applied", "Screening", "Assessment"],
  },
  {
    id: "interview",
    label: "Interview",
    shortLabel: "Interview",
    statuses: ["Interview"],
  },
  {
    id: "outcome",
    label: "Outcome",
    shortLabel: "Outcome",
    statuses: ["Offer", "Accepted", "Rejected", "Withdrawn"],
  },
] as const satisfies readonly {
  id: LifecycleStageId;
  label: string;
  shortLabel: string;
  statuses: readonly ApplicationStatus[];
}[];

export type LifecycleStageId = (typeof LIFECYCLE_STAGES)[number]["id"];

export type LifecycleStage = {
  id: LifecycleStageId;
  label: string;
  shortLabel: string;
  /** This application has held one of the stage's exact statuses. */
  reached: boolean;
  /** The stage the application's current exact status belongs to. */
  current: boolean;
};

export type Lifecycle = {
  stages: LifecycleStage[];
  /**
   * One entry per gap between adjacent stages, so `connectors[0]` joins
   * `stages[0]` to `stages[1]`. True only when both ends were reached, which
   * is what stops a skipped stage from being drawn over.
   */
  connectors: boolean[];
};

/** The stage one exact status belongs to. */
export function stageForStatus(status: ApplicationStatus): LifecycleStageId {
  const stage = LIFECYCLE_STAGES.find((candidate) =>
    (candidate.statuses as readonly ApplicationStatus[]).includes(status),
  );

  // Unreachable while every status is mapped, which the type above enforces.
  if (!stage) throw new Error(`No lifecycle stage covers status ${status}.`);

  return stage.id;
}

/**
 * Builds the rail for one application.
 *
 * A stage is reached only when the application actually held one of *its* own
 * statuses. Nothing is filled in backwards: an application that went
 * `Applied → Interview → Rejected` reached Applied, Interview and Outcome, and
 * its In process node stays empty, because it never was screened. Claiming
 * otherwise would invent a stage the student never went through.
 *
 * `Saved` is the one stage that is always reached: the record exists, so it
 * was saved, whatever the history says.
 *
 * The current status is folded into the set of statuses held. History is the
 * better source — it remembers stages already left behind — but the two must
 * never disagree, and an application whose history is missing or still
 * catching up must never show a rail that contradicts the status printed
 * beside it.
 */
export function buildLifecycle(
  currentStatus: ApplicationStatus,
  everHeld: Iterable<ApplicationStatus> = [],
): Lifecycle {
  const held = new Set<ApplicationStatus>(everHeld);
  held.add(currentStatus);

  const stages: LifecycleStage[] = LIFECYCLE_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    shortLabel: stage.shortLabel,
    reached:
      stage.id === "saved" ||
      (stage.statuses as readonly ApplicationStatus[]).some((status) =>
        held.has(status),
      ),
    current: (stage.statuses as readonly ApplicationStatus[]).includes(
      currentStatus,
    ),
  }));

  const connectors = stages
    .slice(0, -1)
    .map((stage, index) => stage.reached && stages[index + 1].reached);

  return { stages, connectors };
}

/** Builds the four visible milestones used in index rows and their preview. */
export function buildApplicationIndexLifecycle(
  currentStatus: ApplicationStatus,
  everHeld: Iterable<ApplicationStatus> = [],
): Lifecycle {
  const held = new Set<ApplicationStatus>(everHeld);
  held.add(currentStatus);

  const stages: LifecycleStage[] = APPLICATION_INDEX_STAGES.map((stage) => ({
    id: stage.id,
    label: stage.label,
    shortLabel: stage.shortLabel,
    reached:
      stage.id === "saved" ||
      (stage.statuses as readonly ApplicationStatus[]).some((status) =>
        held.has(status),
      ),
    current: (stage.statuses as readonly ApplicationStatus[]).includes(
      currentStatus,
    ),
  }));

  const connectors = stages
    .slice(0, -1)
    .map((stage, index) => stage.reached && stages[index + 1].reached);

  return { stages, connectors };
}

/**
 * The set of statuses each application has ever held, from one pass over the
 * whole of a user's history.
 *
 * The applications list builds every row's rail from this single map, so a
 * page of fifty applications still costs one history read rather than fifty.
 */
export function reachedStatusesByApplication(
  events: readonly ApplicationStatusEvent[],
): Map<string, Set<ApplicationStatus>> {
  const reached = new Map<string, Set<ApplicationStatus>>();

  for (const event of events) {
    const statuses = reached.get(event.application_id) ?? new Set();
    statuses.add(event.new_status);
    reached.set(event.application_id, statuses);
  }

  return reached;
}

/**
 * The rail for every application in a list, keyed by application id.
 *
 * `events` is null when the history read failed. The lifecycle is decoration
 * over data the list already shows, so a failed history read must not take the
 * list down with it — the caller renders the exact status alone in that case,
 * which is honest about what is known rather than guessing at progress.
 */
export function buildLifecycles(
  applications: readonly { id: string; current_status: ApplicationStatus }[],
  events: readonly ApplicationStatusEvent[] | null,
): Map<string, Lifecycle> | null {
  if (!events) return null;

  const reached = reachedStatusesByApplication(events);

  return new Map(
    applications.map((application) => [
      application.id,
      buildLifecycle(
        application.current_status,
        reached.get(application.id) ?? [],
      ),
    ]),
  );
}

/** The four-milestone rail for every application in an Applications index. */
export function buildApplicationIndexLifecycles(
  applications: readonly { id: string; current_status: ApplicationStatus }[],
  events: readonly ApplicationStatusEvent[] | null,
): Map<string, Lifecycle> | null {
  if (!events) return null;

  const reached = reachedStatusesByApplication(events);

  return new Map(
    applications.map((application) => [
      application.id,
      buildApplicationIndexLifecycle(
        application.current_status,
        reached.get(application.id) ?? [],
      ),
    ]),
  );
}

/**
 * The rail in words, for assistive technology.
 *
 * The dots are informational rather than interactive, so the compact rail is
 * announced as a single description instead of becoming five tab stops.
 */
export function describeLifecycle(lifecycle: Lifecycle): string {
  const described = lifecycle.stages.map((stage) => {
    if (stage.current) return `${stage.label} current stage`;
    return `${stage.label} ${stage.reached ? "reached" : "not reached"}`;
  });

  return `Lifecycle progress: ${described.join(", ")}.`;
}
