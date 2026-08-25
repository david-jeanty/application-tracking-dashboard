import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One flat notice, in the language the newer surfaces already speak.
 *
 * Every logged-in surface had grown its own: a rounded one on the archive, a
 * `Card` in settings, a smaller `rounded-control` one inside each form, three
 * different icon sizes between them. None of that was a decision — it was the
 * order the pages were written in. This is that treatment written once: a
 * hairline, a soft semantic ground, a thin icon, no rounding and no card.
 *
 * The tone carries the colour, and never the meaning on its own: the icon
 * differs between an outcome and a problem, and the words say which it is.
 *
 * `role` is left to the caller because the right one depends on how the notice
 * arrived. A confirmation the page was rendered with is a `status`; something
 * that went wrong while the student was working is an `alert`. Both defaults
 * below are the common case, and either can be overridden.
 */
const tones = {
  success: "border-success/30 bg-success-soft text-success",
  error: "border-danger/30 bg-danger-soft text-danger",
  warning: "border-warning/30 bg-warning-soft text-warning",
} as const;

export type NoticeTone = keyof typeof tones;

export function Notice({
  children,
  className,
  heading,
  headingLevel = 2,
  role,
  tone,
  ...props
}: Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  /** A short line above the body, for a notice that reports a failed read. */
  heading?: string;
  /** Kept in the caller's hands so the document outline stays correct. */
  headingLevel?: 2 | 3;
  tone: NoticeTone;
}) {
  const Icon = tone === "success" ? CheckCircle2 : AlertCircle;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <div
      className={cn(
        "flex border p-4 text-sm",
        heading ? "gap-3" : "gap-2",
        tones[tone],
        className,
      )}
      role={role ?? (tone === "success" ? "status" : "alert")}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {heading ? (
        <div>
          <Heading className="text-[15px] font-medium">{heading}</Heading>
          <p className="mt-1 text-[13px] leading-6">{children}</p>
        </div>
      ) : (
        <div className="leading-6">{children}</div>
      )}
    </div>
  );
}
