import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * A contained surface.
 *
 * Deliberately flat: a border and a 10px radius, no shadow. Shadows are
 * reserved for genuinely floating UI such as menus and the mobile drawer, so a
 * page of these does not read as a tray of drifting cards.
 */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-surface border border-border bg-surface",
        className,
      )}
      {...props}
    />
  );
}
