import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-base text-slate-950 shadow-sm placeholder:text-slate-400 hover:border-slate-400 focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-100 sm:text-sm",
        className,
      )}
      {...props}
    />
  );
}
