import { companyInitial, companyLogoUrl, logoDevToken } from "@/lib/branding/logo";
import { cn } from "@/lib/utils";

/**
 * The company's brand mark, or a deterministic letter standing in for it.
 *
 * One component, used by every surface that lists or shows an application, so
 * Logo.dev's URL shape is never written out beside a company name. It renders
 * a mark and nothing else: the company name stays where it already is, as real
 * text, in the caller.
 *
 * **Accessibility.** The mark is decorative and hidden from assistive
 * technology. Every caller renders the company name as adjacent text — that is
 * the invariant this component depends on — so announcing the logo too would
 * say the same employer twice. A caller that ever shows the mark without a
 * visible name must supply the name some other accessible way rather than
 * relying on this.
 *
 * **Degradation.** The lettermark is not an error branch; it is the layer
 * underneath. It is always rendered, and the image sits on top of it, so a
 * blocked, failed, or slow Logo.dev request leaves a readable initial in a
 * correctly sized box rather than a hole. Nothing about this page depends on
 * Logo.dev being reachable.
 *
 * That only holds because the `img` paints nothing of its own. It carries no
 * background: an element with one paints it whether or not any image data ever
 * arrives, so a background here would sit as an opaque blank square over the
 * letter for the whole of a slow load, and permanently on a failed one — which
 * is precisely the fallback this component claims to have. Covering the letter
 * once the logo *has* arrived is the image format's job instead: the URL helper
 * requests JPEG, which has no alpha channel.
 *
 * No external request is made when there is no stored domain: with no domain
 * there is no `img` element at all, so a student who never entered one causes
 * no traffic to Logo.dev.
 */

/**
 * The two sizes in use, as literal classes so Tailwind can see them.
 *
 * `sm` sits beside a company name in a list row; `md` beside the heading on
 * the detail page. Both stay smaller than the name they accompany — the mark
 * is there to make a row scannable, not to brand the page.
 */
const SIZES = {
  sm: { className: "size-8 text-[0.7rem]", pixels: 32 },
  md: { className: "size-10 text-sm", pixels: 40 },
} as const;

export type CompanyLogoSize = keyof typeof SIZES;

export function CompanyLogo({
  className,
  companyName,
  domain,
  size = "sm",
}: {
  className?: string;
  companyName: string;
  domain?: string | null;
  size?: CompanyLogoSize;
}) {
  const { className: sizeClassName, pixels } = SIZES[size];
  const source = companyLogoUrl(domain, {
    token: logoDevToken(),
    size: pixels,
  });

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 font-semibold uppercase text-slate-600",
        sizeClassName,
        className,
      )}
    >
      {companyInitial(companyName)}
      {source ? (
        /*
          A plain `img`. This product renders no other bitmap images, so Next's
          image pipeline would be infrastructure added for one 32-pixel mark
          that Logo.dev already serves resized, cached, and CDN-backed. The
          intrinsic size is stated to reserve the box before the image arrives,
          and `object-contain` keeps the logo's own aspect ratio inside it.

          No background class belongs here. See the note above: one would hide
          the lettermark underneath for as long as the image has not arrived.
        */
        // eslint-disable-next-line @next/next/no-img-element -- deliberate: see above.
        <img
          alt=""
          className="absolute inset-0 size-full object-contain"
          height={pixels}
          loading="lazy"
          src={source}
          width={pixels}
        />
      ) : null}
    </span>
  );
}
