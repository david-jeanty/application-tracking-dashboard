import type { ReactNode } from "react";

/**
 * A section heading and the rule under it.
 *
 * The rule is the whole visual container. Nothing on this page sits in a card:
 * a heading, a hairline, and the space beneath it are what separate one part of
 * the analysis from the next — the same structure the applications list and the
 * dashboard use, so Analytics reads as the same product rather than as a
 * reporting tool bolted onto it.
 *
 * `action` is the slot a section control sits in, kept on the heading line so a
 * toggle never becomes a floating widget above a chart.
 */
export function SectionHeading({
  action,
  children,
  id,
}: {
  action?: ReactNode;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border pb-2">
      <h2 className="text-[17px] font-medium text-foreground" id={id}>
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * One sentence, where a section would otherwise be an empty panel.
 *
 * Analytics becomes richer as a search does, and the alternative to this is
 * five bordered boxes each announcing that it has nothing to say. Stated
 * flatly and only about the data: a student with three submitted applications
 * is not behind, and this page has no opinion about how many they should have.
 */
export function QuietNote({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-xl text-[13px] leading-6 text-foreground-muted">
      {children}
    </p>
  );
}
