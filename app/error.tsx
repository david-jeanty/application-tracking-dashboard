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
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto mb-4 size-9 text-amber-600"
        />
        <h1 className="text-xl font-semibold text-slate-950">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
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
