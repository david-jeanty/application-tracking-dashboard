"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The existing column strip, with a quiet edge while more of it remains.
 *
 * The cue is measured rather than unconditional: a wide viewport that fits the
 * whole board gets no stray rule, and reaching the last column removes it. The
 * scroller itself keeps the same classes and native scrolling behaviour it had
 * before this wrapper was introduced.
 */
export function PipelineColumnScroller({
  children,
}: {
  children: React.ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hasContinuation, setHasContinuation] = useState(false);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const updateContinuation = () => {
      const overflow = scroller.scrollWidth > scroller.clientWidth + 1;
      const atEnd =
        scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1;

      setHasContinuation(overflow && !atEnd);
    };

    updateContinuation();
    scroller.addEventListener("scroll", updateContinuation, { passive: true });
    window.addEventListener("resize", updateContinuation);

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateContinuation);
    resizeObserver?.observe(scroller);

    return () => {
      resizeObserver?.disconnect();
      scroller.removeEventListener("scroll", updateContinuation);
      window.removeEventListener("resize", updateContinuation);
    };
  }, []);

  return (
    <div className="relative mt-5">
      <div
        className="flex flex-col gap-8 md:-mx-1 md:flex-row md:items-start md:gap-4 md:overflow-x-auto md:px-1 md:pb-3"
        data-pipeline-column-scroller
        ref={scrollerRef}
      >
        {children}
      </div>

      {hasContinuation ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-px bg-border-strong md:block"
          data-pipeline-continuation-cue
        />
      ) : null}
    </div>
  );
}
