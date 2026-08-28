"use client";

import {
  setMode,
  useAppearance,
} from "@/components/appearance/use-appearance";
import {
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
  const { mode, ready } = useAppearance();

  return (
    <section aria-labelledby="appearance-heading" className="space-y-5">
      {/*
        The section heading and its rule, in the same language every other
        section of the product uses. The first row below sits straight under
        that rule rather than drawing a second one of its own.
      */}
      <div className="border-b border-border pb-2">
        <h2
          className="text-[17px] font-medium text-foreground"
          id="appearance-heading"
        >
          Appearance
        </h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
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

    </section>
  );
}
