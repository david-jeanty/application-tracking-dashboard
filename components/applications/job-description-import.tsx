"use client";

import { useState } from "react";
import { ClipboardPaste, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseJobDescription } from "@/lib/job-description-parser";
import { mapToFormValues } from "@/lib/job-description-parser/map-to-form";
import type { PrefillResult } from "@/lib/job-description-parser/map-to-form";

const textareaClassName =
  "min-h-40 w-full resize-y rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-950 shadow-sm placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-100 sm:text-sm";

export function JobDescriptionImport({
  onExtract,
}: {
  onExtract: (result: PrefillResult) => void;
}) {
  const [text, setText] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const trimmed = text.trim();

  if (!isOpen) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Start from a job description
            </p>
            <p className="mt-0.5 text-sm text-slate-600">
              Paste a posting and we will fill in what we can read confidently.
            </p>
          </div>
          <Button onClick={() => setIsOpen(true)} type="button" variant="secondary">
            <ClipboardPaste aria-hidden="true" className="size-4" />
            Paste posting
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <label
        className="text-sm font-medium text-slate-800"
        htmlFor="jobDescriptionImport"
      >
        Paste the job description
      </label>
      <p className="mt-0.5 text-sm text-slate-600">
        Nothing is saved until you review the fields and submit the form.
      </p>
      <textarea
        className={`${textareaClassName} mt-2`}
        id="jobDescriptionImport"
        onChange={(event) => setText(event.target.value)}
        placeholder="Paste the full posting here, including any labels such as “Application deadline:”."
        value={text}
      />
      <div className="mt-3 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          onClick={() => {
            setText("");
            setIsOpen(false);
          }}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={trimmed.length === 0}
          onClick={() => onExtract(mapToFormValues(parseJobDescription(text)))}
          type="button"
        >
          <Wand2 aria-hidden="true" className="size-4" />
          Extract details
        </Button>
      </div>
    </div>
  );
}
