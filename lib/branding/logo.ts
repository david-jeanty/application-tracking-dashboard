import { normalizeCompanyDomain } from "@/lib/branding/domain";

/**
 * The one place a Logo.dev URL is constructed.
 *
 * Nothing else in the product knows the host, the parameter names, or where
 * the token comes from. That is the point: a logo URL is an external request
 * built from stored data, and it should be built in exactly one reviewable
 * place rather than assembled inline wherever a company name is rendered.
 *
 * JobTrack calls no Logo.dev API from the server. The Logo API is a plain
 * image endpoint, so the browser fetches the image directly and this module
 * only ever produces a string.
 */

/**
 * The only external host this product ever points an image at.
 *
 * Fixed, never taken from data. The stored domain varies the *path*, and the
 * path alone — which is what keeps this from becoming a general remote-image
 * field or an open proxy.
 */
export const LOGO_DEV_HOST = "img.logo.dev";

/** Logo.dev renders at most 800 pixels. */
const MAXIMUM_LOGO_PIXELS = 800;

/**
 * The publishable Logo.dev key, or nothing.
 *
 * `NEXT_PUBLIC_` because the Logo API is called by the browser and the key is
 * a publishable one, designed to be visible in an image URL. No Logo.dev
 * secret or Brand API key belongs in this product.
 *
 * Deliberately absent from `lib/env.ts`. That module validates the
 * configuration the application cannot start without and throws when it is
 * missing; company logos are an enhancement, and a deployment with no
 * Logo.dev key must keep working exactly as before.
 */
export function logoDevToken(): string | undefined {
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN?.trim();
  return token ? token : undefined;
}

/**
 * The Logo.dev image URL for one company, or null when there is nothing to ask
 * for.
 *
 * Null in three cases, and each one means "render the local fallback instead":
 * no stored domain, no configured token, or a stored value that does not
 * normalize to a domain. The last is a safety floor rather than an expected
 * case — every write path normalizes first — but it is what guarantees that
 * arbitrary text can never reach an external URL, whatever put it in the
 * column.
 *
 * The URL is built through `URL` and `URLSearchParams` rather than by string
 * concatenation, and the domain is encoded on the way into the path, so no
 * stored value can add a path segment, a query parameter, or a host.
 *
 * `size` is the rendered CSS size; the image is requested at twice that so it
 * stays sharp on high-density screens.
 *
 * JPEG, and that choice carries weight beyond file size. The mark is drawn as
 * a lettermark with the logo layered over it, so the layer on top has to be
 * opaque once it arrives — otherwise a transparent logo lets the letter show
 * through it. JPEG has no alpha channel at all, so opacity is a property of
 * the format rather than a background the component paints. That distinction
 * is the whole point: a painted background would also cover the letter while
 * the image is still loading, or forever if the request fails.
 */
export function companyLogoUrl(
  domain: string | null | undefined,
  options: { token: string | undefined; size: number },
): string | null {
  const normalized = normalizeCompanyDomain(domain);
  if (!normalized || !options.token) return null;

  const requested = Math.min(
    Math.round(options.size * 2),
    MAXIMUM_LOGO_PIXELS,
  );

  const url = new URL(
    `https://${LOGO_DEV_HOST}/${encodeURIComponent(normalized)}`,
  );
  url.searchParams.set("token", options.token);
  url.searchParams.set("size", String(requested));
  // No alpha channel, so what arrives covers the lettermark completely and
  // nothing in the component has to paint a background to make it do so.
  url.searchParams.set("format", "jpg");

  return url.toString();
}

/**
 * The letter shown when no logo is available.
 *
 * The first letter or digit of the company name, so the same employer always
 * gets the same mark. Non-alphanumeric leading characters are skipped, because
 * a mark reading `&` identifies nothing. A name with no letter or digit at all
 * falls back to a neutral glyph rather than rendering an empty box.
 */
export function companyInitial(companyName: string): string {
  const match = companyName.match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : "?";
}
