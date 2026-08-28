import { cn } from "@/lib/utils";

type InterndexLogoProps = {
  className?: string;
  /** Show the document mark without the wordmark in compact contexts. */
  iconOnly?: boolean;
};

/**
 * The one product-identity component used across public, auth, and app
 * navigation surfaces. The source artwork stays in `public/brand` so it is
 * also available to the web manifest and the browser extension.
 */
export function InterndexLogo({
  className,
  iconOnly = false,
}: InterndexLogoProps) {
  if (iconOnly) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset; no responsive image optimization is needed. */
      <img
        alt="Interndex"
        className={cn("block object-contain aspect-square", className)}
        src="/brand/icon/interndex-icon.svg"
      />
    );
  }

  return (
    <span aria-label="Interndex" role="img">
      {/* The root theme attribute swaps these without duplicate accessible names. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset; no responsive image optimization is needed. */}
      <img
        alt=""
        className={cn("interndex-logo-light block object-contain aspect-[21/5]", className)}
        src="/brand/logo/interndex-logo-light.svg"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset; no responsive image optimization is needed. */}
      <img
        alt=""
        className={cn("interndex-logo-dark hidden object-contain aspect-[21/5]", className)}
        src="/brand/logo/interndex-logo-dark.svg"
      />
    </span>
  );
}
