import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-9 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground transition-colors placeholder:text-foreground-muted hover:border-border-strong focus:border-accent focus:outline-none focus-visible:outline-none sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
