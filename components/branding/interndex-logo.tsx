import { cn } from "@/lib/utils";

type InterndexLogoProps = {
  className?: string;
  /** Show the handheld without the wordmark in compact contexts. */
  iconOnly?: boolean;
  size?: "small" | "medium" | "large";
};

const sizes = {
  small: {
    divider: "h-5",
    icon: "size-5",
    wordmark: "text-[15px]",
  },
  medium: {
    divider: "h-7",
    icon: "size-7",
    wordmark: "text-[20px]",
  },
  large: {
    divider: "h-10",
    icon: "size-10",
    wordmark: "text-[28px]",
  },
} as const;

/**
 * The Interndex lockup.
 *
 * The handheld is the nostalgic brand mark. The wordmark is ordinary IBM Plex
 * Sans rendered by the page, rather than text baked into an external SVG. That
 * separation keeps the lettering stable across browsers and lets compact
 * product surfaces scale the two pieces without distorting either one.
 */
export function InterndexLogo({
  className,
  iconOnly = false,
  size = "medium",
}: InterndexLogoProps) {
  const dimensions = sizes[size];

  return (
    <span
      aria-label="Interndex"
      className={cn("inline-flex items-center", className)}
      role="img"
    >
      <span
        aria-hidden="true"
        className={cn("relative block shrink-0", dimensions.icon)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset. */}
        <img
          alt=""
          className="interndex-icon-light absolute inset-0 block size-full object-contain"
          src="/brand/icon/interndex-icon.svg"
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset. */}
        <img
          alt=""
          className="interndex-icon-dark absolute inset-0 hidden size-full object-contain"
          src="/brand/icon/interndex-icon-dark.svg"
        />
      </span>

      {iconOnly ? null : (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "mx-2 w-0 shrink-0 border-l border-accent/75",
              dimensions.divider,
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "whitespace-nowrap font-sans font-semibold leading-none tracking-[-0.045em] text-foreground",
              dimensions.wordmark,
            )}
          >
            inter<span className="text-accent">n</span>dex
          </span>
        </>
      )}
    </span>
  );
}
