/**
 * The run ledger: which steps of a run are finished for an application.
 *
 * The database stores step names as plain text (`run_ledger.step`) so Spec 2
 * can add its people and outreach steps here without a migration. This file
 * is the vocabulary and the rules, kept pure so they are unit tested.
 *
 * The rule the spec asks the server to enforce: a finished step is not redone
 * unless the call says `force: true`, which the playbook only allows when
 * David asks.
 */

export const RUN_STEPS = ["application", "fit_read", "tailor", "build"] as const;

export type RunStep = (typeof RUN_STEPS)[number];

export type LedgerStatus = "started" | "done" | "failed" | "skipped";

export type LedgerRow = { step: string; status: LedgerStatus; count: number };

export type RunState = {
  steps: Record<RunStep, LedgerStatus | null>;
  /** The first step that is neither done nor skipped, or null when finished. */
  next_step: RunStep | null;
};

export function summarizeRunState(rows: readonly LedgerRow[]): RunState {
  const byStep = new Map(rows.map((row) => [row.step, row.status]));
  const steps = Object.fromEntries(
    RUN_STEPS.map((step) => [step, byStep.get(step) ?? null]),
  ) as Record<RunStep, LedgerStatus | null>;

  const next_step =
    RUN_STEPS.find(
      (step) => steps[step] !== "done" && steps[step] !== "skipped",
    ) ?? null;

  return { steps, next_step };
}

/** Whether a step may run now: not finished yet, or the caller forced it. */
export function mayRunStep(
  rows: readonly LedgerRow[],
  step: RunStep,
  force: boolean,
): boolean {
  if (force) return true;
  const status = rows.find((row) => row.step === step)?.status;
  return status !== "done";
}
