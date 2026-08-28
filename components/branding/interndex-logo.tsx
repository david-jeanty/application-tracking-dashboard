import { cn } from "@/lib/utils";

type InterndexLogoProps = {
  className?: string;
  /** Show the document mark without the wordmark in compact contexts. */
  iconOnly?: boolean;
};

/** The approved Interndex mark for public, auth, and app navigation. */
export function InterndexLogo({
  className,
  iconOnly = false,
}: InterndexLogoProps) {
  if (iconOnly) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset. */
      <img
        alt="Interndex"
        className={cn("block aspect-square object-contain", className)}
        src="/brand/icon/interndex-icon.svg"
      />
    );
  }

  return (
    <span aria-label="Interndex" role="img">
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset. */}
      <img
        alt=""
        className={cn("interndex-logo-light block aspect-[21/5] object-contain", className)}
        src="/brand/logo/interndex-logo-light.svg"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset. */}
      <img
        alt=""
        className={cn("interndex-logo-dark hidden aspect-[21/5] object-contain", className)}
        src="/brand/logo/interndex-logo-dark.svg"
      />
    </span>
  );
}
