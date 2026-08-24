"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-surface-muted px-6">
      <section className="w-full max-w-md rounded-surface border border-border bg-surface p-8 text-center">
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto mb-4 size-9 text-warning"
        />
        <h1 className="text-xl font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-6 text-foreground-secondary">
          Your data has not been changed. Try the request again, or return later
          if the problem continues.
        </p>
        <Button className="mt-6" onClick={reset} type="button">
          Try again
        </Button>
      </section>
    </main>
  );
}
