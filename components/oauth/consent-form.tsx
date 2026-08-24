"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  decideConsentAction,
  type ConsentDecisionState,
} from "@/lib/oauth/actions";

const initialState: ConsentDecisionState = { status: "idle" };

function DecisionButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse">
      <Button
        className="sm:flex-1"
        disabled={pending}
        name="decision"
        type="submit"
        value="approve"
      >
        {pending ? "Working…" : "Allow access"}
      </Button>
      <Button
        className="sm:flex-1"
        disabled={pending}
        name="decision"
        type="submit"
        value="deny"
        variant="secondary"
      >
        Cancel
      </Button>
    </div>
  );
}

export function ConsentForm({ authorizationId }: { authorizationId: string }) {
  const [state, formAction] = useActionState(decideConsentAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="authorizationId" type="hidden" value={authorizationId} />

      {state.status === "error" && state.message ? (
        <p
          className="rounded-control border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
          role="alert"
        >
          {state.message}
        </p>
      ) : null}

      <DecisionButtons />
    </form>
  );
}
