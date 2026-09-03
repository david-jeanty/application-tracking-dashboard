"use client";

import { useRef, type FormEvent, type ReactNode } from "react";
import { StatusTransitionDialog } from "@/components/applications/status-transition-dialog";
import { useStatusTransitionGuard } from "@/components/applications/use-status-transition-guard";
import type { ApplicationStatus } from "@/lib/applications/constants";

/**
 * Wraps a form whose submission may change an application's status, pausing
 * on an unusual transition for `StatusTransitionDialog` to confirm.
 *
 * Exists so the detail page's quick update and the pipeline board's move
 * control — both server-rendered forms with no other client JavaScript —
 * can gain this one interaction without becoming client components
 * themselves beyond this wrapper. `action` is passed straight through to the
 * native form: this only ever calls `preventDefault` and, on confirmation,
 * `requestSubmit()` on the same form, so ownership checks, validation, and
 * everything else the Server Action already does is untouched.
 */
export function StatusTransitionForm({
  action,
  children,
  className,
  currentStatus,
  statusFieldName = "currentStatus",
}: {
  action: (formData: FormData) => void | Promise<void>;
  children: ReactNode;
  className?: string;
  currentStatus: ApplicationStatus;
  statusFieldName?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { cancel, confirm, intercept, pending } = useStatusTransitionGuard({
    currentStatus,
    statusFieldName,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (intercept(event.currentTarget)) event.preventDefault();
  }

  return (
    <>
      <form
        action={action}
        className={className}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {children}
      </form>
      {pending ? (
        <StatusTransitionDialog
          fromStatus={currentStatus}
          onCancel={cancel}
          onConfirm={() => {
            if (formRef.current) confirm(formRef.current);
          }}
          reason={pending.reason}
          toStatus={pending.to}
        />
      ) : null}
    </>
  );
}
