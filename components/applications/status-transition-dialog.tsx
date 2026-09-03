"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus } from "@/lib/applications/constants";
import {
  describeStatusTransition,
  type StatusTransitionReason,
} from "@/lib/applications/status-transitions";

/**
 * The confirmation a student sees before an unusual status change saves.
 *
 * A warning, not a restriction: both buttons leave the change reachable —
 * one keeps the current status, the other proceeds with the one just chosen.
 * Nothing here decides which transitions are unusual; that classification
 * comes from `assessStatusTransition`, called by whichever surface renders
 * this dialog.
 *
 * Flat and bordered like the rest of Interndex's controls, rather than a
 * shadowed card — the app has no other modal to match, so this follows the
 * same quiet language `Button` and `Notice` already use.
 */
export function StatusTransitionDialog({
  fromStatus,
  onCancel,
  onConfirm,
  reason,
  toStatus,
}: {
  fromStatus: ApplicationStatus;
  onCancel: () => void;
  onConfirm: () => void;
  reason: StatusTransitionReason;
  toStatus: ApplicationStatus;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div
        aria-describedby="status-transition-description"
        aria-labelledby="status-transition-title"
        aria-modal="true"
        className="w-full max-w-sm border border-border-strong bg-surface p-5 focus:outline-none"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <h2
          className="text-[15px] font-medium text-foreground"
          id="status-transition-title"
        >
          Confirm status change
        </h2>
        <p
          className="mt-2 text-[13px] leading-6 text-foreground-secondary"
          id="status-transition-description"
        >
          {describeStatusTransition(fromStatus, toStatus, reason)}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onCancel} type="button" variant="secondary">
            Keep {fromStatus}
          </Button>
          <Button onClick={onConfirm} type="button" variant="primary">
            Change to {toStatus}
          </Button>
        </div>
      </div>
    </div>
  );
}
