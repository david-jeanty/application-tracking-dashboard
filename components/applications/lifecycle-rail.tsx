import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeLifecycle, type Lifecycle } from "@/lib/applications/lifecycle";

/**
 * Interndex's lifecycle rail.
 *
 * A coarse visual summary of how far an application has travelled, led by the
 * stage names rather than by the dots: the labels are the information, and the
 * track underneath is what turns five words into a journey.
 *
 * It draws only what the lifecycle calculation says was reached, so a skipped
 * stage keeps an open node with an unjoined connector on either side rather
 * than being quietly drawn over.
 *
 * The rail follows the chosen accent, because progress is interface rather
 * than outcome. Exact status colour never does — a rejection reads as a
 * rejection in every theme — which is why the status label is rendered beside
 * or beneath the rail by the caller.
 *
 * **Accessibility.** The nodes are informational, not interactive: they are
 * never focusable and never become five tab stops. The whole rail is announced
 * as one description, and the labelled form additionally spells out each
 * stage's state so reached, current and future do not depend on seeing colour.
 */

function Node({
  reached,
  current,
}: {
  reached: boolean;
  current: boolean;
}) {
  if (current) {
    return (
      <span
        aria-hidden="true"
        className="relative z-10 grid size-[13px] shrink-0 place-items-center rounded-full bg-accent ring-4 ring-accent/20"
      />
    );
  }

  if (reached) {
    return (
      <span
        aria-hidden="true"
        className="relative z-10 grid size-[13px] shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
      >
        <Check className="size-2" strokeWidth={3.5} />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="relative z-10 size-[13px] shrink-0 rounded-full border border-rail-track bg-background"
    />
  );
}

function Connector({ completed }: { completed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute left-[-50%] right-1/2 top-[6px] h-px",
        completed ? "bg-accent" : "bg-rail-track",
      )}
    />
  );
}

/**
 * The full rail: a stage name over every node.
 *
 * Used on a list record and on the detail page alike — the composition is the
 * same, only the type sizes differ, which is what keeps one application
 * recognisable in both places.
 */
export function LifecycleRail({
  lifecycle,
  className,
  size = "compact",
}: {
  lifecycle: Lifecycle;
  className?: string;
  size?: "compact" | "detail";
}) {
  return (
    <ol
      aria-label={describeLifecycle(lifecycle)}
      className={cn("flex items-start", className)}
    >
      {lifecycle.stages.map((stage, index) => (
        // Equal shares, each centring its node, so a connector can run from
        // one node's centre to the next without anything being measured.
        <li
          className="relative flex flex-1 flex-col items-center gap-1.5"
          key={stage.id}
        >
          <span
            className={cn(
              "text-center leading-4",
              size === "detail" ? "text-[12px]" : "text-[11px]",
              stage.current
                ? "text-accent"
                : stage.reached
                  ? "text-foreground-secondary"
                  : "text-foreground-muted",
            )}
          >
            <span className="hidden sm:inline">{stage.label}</span>
            <span className="sm:hidden">{stage.shortLabel}</span>
            <span className="sr-only">
              {stage.current
                ? " — current stage"
                : stage.reached
                  ? " — reached"
                  : " — not reached"}
            </span>
          </span>

          <span className="relative flex w-full items-center justify-center">
            {index > 0 ? (
              <Connector completed={lifecycle.connectors[index - 1]} />
            ) : null}
            <Node current={stage.current} reached={stage.reached} />
          </span>
        </li>
      ))}
    </ol>
  );
}
