import { cn } from "@/lib/utils";

type InterndexLogoProps = {
  className?: string;
  /** Show the handheld without the wordmark in compact contexts. */
  iconOnly?: boolean;
  size?: "small" | "medium" | "large";
};

const sizes = {
  small: "h-8",
  medium: "h-10",
  large: "h-14",
} as const;

/**
 * The Interndex lockup.
 *
 * The supplied raster artwork is the brand source of truth. Light and dark
 * lockups preserve its exact handheld, lettering, highlighted `n`, divider and
 * tagline. The standalone supplied handheld is used for icon-only contexts.
 */
export function InterndexLogo({
  className,
  iconOnly = false,
  size = "medium",
}: InterndexLogoProps) {
  const dimensions = sizes[size];

  if (iconOnly) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element -- local PNG brand asset. */
      <img
        alt="Interndex"
        className={cn("block aspect-square object-contain", dimensions, className)}
        src="/brand/icon/interndex-icon.png"
      />
    );
  }

  return (
    <span
      aria-label="Interndex"
      className={cn("inline-flex items-center", className)}
      role="img"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- supplied PNG brand artwork. */}
      <img
        alt=""
        className={cn(
          "interndex-logo-light block w-auto object-contain",
          dimensions,
        )}
        src="/brand/logo/interndex-logo-light.png"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- supplied PNG brand artwork. */}
      <img
        alt=""
        className={cn(
          "interndex-logo-dark hidden w-auto object-contain",
          dimensions,
        )}
        src="/brand/logo/interndex-logo-dark.png"
      />
    </span>
  );
}
