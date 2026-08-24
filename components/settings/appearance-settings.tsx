"use client";

import { Check } from "lucide-react";
import {
  setAccent,
  setMode,
  useAppearance,
} from "@/components/appearance/use-appearance";
import {
  ACCENTS,
  ACCENT_LABELS,
  MODES,
  MODE_LABELS,
} from "@/lib/appearance/appearance";

/**
 * Mode and accent pickers.
 *
 * Which option looks selected is decided in CSS from the `data-mode` and
 * `data-accent` attributes the blocking script writes before first paint, so
 * the controls are already correct when the page appears. React contributes
 * the `aria-checked` state once it has read the stored preference, which is
 * why `ready` gates it — announcing a selection the student did not make would
 * be worse than announcing none for a frame.
 */
export function AppearanceSettings() {
  const { mode, accent, ready } = useAppearance();

  return (
    <section aria-labelledby="appearance-heading" className="space-y-5">
      <h2
        className="text-base font-semibold text-foreground"
        id="appearance-heading"
      >
        Appearance
      </h2>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="max-w-sm">
          <h3 className="text-sm font-medium text-foreground" id="mode-label">
            Mode
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-foreground-secondary">
            Follow your system or choose a fixed appearance.
          </p>
        </div>

        <div
          aria-labelledby="mode-label"
          className="flex w-full shrink-0 sm:w-auto gap-0.5 rounded-record border border-border bg-surface-muted p-0.5"
          role="radiogroup"
        >
          {MODES.map((value) => (
            <button
              aria-checked={ready ? mode === value : false}
              className="min-h-9 flex-1 rounded-control px-3.5 text-[13px] transition-colors hover:text-foreground sm:flex-none"
              data-appearance-mode={value}
              key={value}
              onClick={() => setMode(value)}
              role="radio"
              type="button"
            >
              {MODE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="max-w-sm">
          <h3 className="text-sm font-medium text-foreground" id="accent-label">
            Accent
          </h3>
          <p className="mt-1 text-[13px] leading-5 text-foreground-secondary">
            Used for interaction and lifecycle progress, not for status colours.
          </p>
        </div>

        <div
          aria-labelledby="accent-label"
          className="flex shrink-0 items-center gap-2"
          role="radiogroup"
        >
          {ACCENTS.map((value) => (
            <button
              aria-checked={ready ? accent === value : false}
              aria-label={ACCENT_LABELS[value]}
              className="grid size-9 place-items-center rounded-full"
              data-appearance-accent={value}
              key={value}
              onClick={() => setAccent(value)}
              role="radio"
              title={ACCENT_LABELS[value]}
              type="button"
            >
              <span className="appearance-accent-dot grid size-5 place-items-center rounded-full">
                <Check
                  aria-hidden="true"
                  className="appearance-accent-check size-3"
                  strokeWidth={3}
                />
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
