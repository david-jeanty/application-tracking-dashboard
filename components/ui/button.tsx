import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-blue-600 text-white shadow-sm hover:bg-blue-700",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  ghost: "text-slate-700 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
} as const;

type Variant = keyof typeof variants;

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(base, variants[variant], className)}
      {...props}
    />
  );
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
    <Link
      className={cn(base, variants[variant], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
