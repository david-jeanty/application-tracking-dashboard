import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/*
 * Controls are deliberately quiet: 4px corners, no shadow, regular weight.
 * An icon is never implied by a button — callers pass one only where it
 * genuinely helps, which for most of Interndex is nowhere.
 */
const base =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-control px-3.5 text-sm transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-accent text-accent-foreground hover:bg-accent-hover",
  secondary:
    "border border-border-strong bg-surface text-foreground hover:bg-surface-muted",
  ghost: "text-foreground-secondary hover:bg-surface-muted hover:text-foreground",
  // Destructive stays on the semantic danger token, never the chosen accent.
  danger: "bg-danger text-danger-foreground hover:opacity-90",
} as const;

type Variant = keyof typeof variants;

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function ButtonLink({
  children,
  className,
  variant = "primary",
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  children: ReactNode;
  href: string;
  variant?: Variant;
}) {
  return (
    <Link className={cn(base, variants[variant], className)} {...props}>
      {children}
    </Link>
  );
}
