import { cn } from "@/lib/utils";
import { describeLifecycle, type Lifecycle } from "@/lib/applications/lifecycle";

/**
 * JobTrack's lifecycle rail.
 *
 * A coarse visual summary of how far an application has travelled. It draws
 * only what the lifecycle calculation says was reached, so a skipped stage
 * stays an open node with an unjoined connector on either side rather than
 * being quietly drawn over.
 *
 * The rail is lifecycle and navigation information, so it follows the chosen
 * accent. Exact status colour never does — a rejection reads as a rejection in
 * every theme — which is why the status label is rendered by the caller,
 * beside the rail, rather than colouring the rail itself.
 *
 * **Accessibility.** The nodes are informational, not interactive: they are
 * not focusable and never become five tab stops. The compact rail is announced
 * as one description; the labelled rail carries visible stage names plus a
 * short state for each, so reached, current and not reached are all
 * distinguishable without seeing colour.
 */

function Connector({ completed }: { completed: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "h-px min-w-3 flex-1 transition-colors",
        completed ? "bg-accent" : "bg-rail-track",
      )}
    />
  );
}

function Node({
  reached,
  current,
  size = "compact",
}: {
  reached: boolean;
  current: boolean;
  size?: "compact" | "labelled";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 grid shrink-0 place-items-center rounded-full transition-colors",
        // The ring is drawn outside the node so the current stage reads as
        // different in shape, not only in colour.
        // A soft halo, so the current stage differs in shape as well as fill.
        current && "ring-4 ring-accent/25",
        size === "compact" ? "size-2" : "size-2.5",
        reached
          ? "bg-accent"
          : "border border-rail-track bg-background",
      )}
    />
  );
}

/**
 * The rail as it appears in a list row: dots and connectors, no labels.
 *
 * The caller renders the exact status next to it, which is what carries the
 * precise meaning; this carries the shape of the journey.
 */
export function CompactLifecycleRail({
  lifecycle,
  className,
}: {
  lifecycle: Lifecycle;
  className?: string;
}) {
  return (
    <span
      aria-label={describeLifecycle(lifecycle)}
      className={cn("flex w-full max-w-40 items-center gap-0.5", className)}
      role="img"
    >
      {lifecycle.stages.map((stage, index) => (
        <span className="contents" key={stage.id}>
          <Node current={stage.current} reached={stage.reached} />
          {index < lifecycle.connectors.length ? (
            <Connector completed={lifecycle.connectors[index]} />
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * The rail as it appears on the detail page, with a name under every stage.
 *
 * An ordered list, because the stages are a sequence and their order is part
 * of the information. Each stage's state is spelled out for a screen reader
 * rather than left to the colour of a dot.
 */
export function LabelledLifecycleRail({
  lifecycle,
  className,
}: {
  lifecycle: Lifecycle;
  className?: string;
}) {
  return (
    <ol className={cn("flex items-start", className)}>
      {lifecycle.stages.map((stage, index) => (
        // Every stage takes an equal share of the width and centres its node,
        // so the connector can span exactly from one node's centre to the
        // next without any measuring.
        <li
          className="relative flex flex-1 flex-col items-center gap-2"
          key={stage.id}
        >
          {index > 0 ? (
            <span
              aria-hidden="true"
              className={cn(
                "absolute right-1/2 left-[-50%] top-[5px] h-px",
                lifecycle.connectors[index - 1]
                  ? "bg-accent"
                  : "bg-rail-track",
              )}
            />
          ) : null}

          <Node
            current={stage.current}
            reached={stage.reached}
            size="labelled"
          />

          <span
            className={cn(
              "text-center text-[11px] leading-4",
              stage.current
                ? "font-semibold text-foreground"
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
        </li>
      ))}
    </ol>
  );
}
