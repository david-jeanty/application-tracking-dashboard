import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-10 w-full rounded-control border border-border-strong bg-surface px-3 text-base text-foreground transition-colors placeholder:text-foreground-muted hover:border-foreground-muted focus:border-accent focus:outline-none focus-visible:outline-none sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
