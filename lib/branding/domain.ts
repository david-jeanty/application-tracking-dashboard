/**
 * The employer's canonical internet domain, normalized once.
 *
 * One deterministic function, called at every runtime boundary that can accept
 * a domain — the web form's schema and, through the same schema, the MCP
 * tools. Storing a normalized hostname rather than whatever was typed is what
 * lets the logo URL be built by concatenation-free construction from a value
 * that is already known to be a bare hostname.
 *
 * This is deliberately not a domain-discovery engine. Nothing here guesses a
 * domain from a company name: a wrong brand is worse than no brand, and a
 * hard-coded employer-to-domain map would rot. The value arrives from a
 * student typing it or from Claude supplying one it already knows.
 */

/**
 * The longest input accepted before parsing is attempted.
 *
 * A DNS name cannot exceed 253 characters, but a pasted URL legitimately can,
 * so the cap is the same 2,048 the application URL field already uses. Past
 * that, the input is not a mistyped domain.
 */
export const MAXIMUM_DOMAIN_INPUT_LENGTH = 2048;

/** The longest a DNS name itself may be. */
export const MAXIMUM_DOMAIN_LENGTH = 253;

/**
 * One DNS label: alphanumeric at both ends, hyphens allowed inside, 63 max.
 */
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The final label. Alphabetic, or a punycode `xn--` form for an
 * internationalized suffix, which is what the URL parser produces for a domain
 * typed in a non-Latin script. Requiring this is what separates `shopify.com`
 * from `192.168.1.1` and from a bare word with a dot in it.
 */
const TOP_LEVEL_PATTERN = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

/** Any `scheme://` prefix, which is the only form a pasted URL can take here. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Whether a lowercase hostname is a plausible registrable domain name.
 *
 * At least two labels, so a single word is rejected; every label well formed;
 * an alphabetic or punycode suffix, so an IP address is rejected. This is a
 * shape check, not a existence check — no lookup is performed anywhere in this
 * product.
 */
export function isCompanyDomain(value: string): boolean {
  if (!value || value.length > MAXIMUM_DOMAIN_LENGTH) return false;

  const labels = value.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => LABEL_PATTERN.test(label))) return false;

  return TOP_LEVEL_PATTERN.test(labels[labels.length - 1]);
}

/**
 * Reduces whatever was supplied to a bare lowercase hostname, or nothing.
 *
 * Accepts a bare hostname (`shopify.com`) and tolerates a pasted URL
 * (`https://www.shopify.com/careers`), because a student copying from the
 * address bar is the ordinary case and refusing it would be pedantry. Both
 * paths run through the URL parser rather than through string surgery, so
 * lowercasing, punycode conversion, and the removal of paths, queries, and
 * fragments are the platform's job and cannot drift.
 *
 * A leading `www.` is dropped: `www.shopify.com` and `shopify.com` are the same
 * brand, and storing one form means the same employer never yields two
 * different logo URLs. Deeper subdomains are kept, so `careers.google.com`
 * survives if that is genuinely what was meant.
 *
 * Anything carrying credentials, a port, or a non-web scheme is rejected
 * outright rather than salvaged. Those are pastes of something that is not a
 * company website — an email address, a local development URL — and quietly
 * extracting a domain from them would store a guess.
 *
 * Returns `undefined` for blank input and for anything that is not a plausible
 * domain, which is the same value the surrounding schemas use for "not
 * provided". Never throws.
 */
export function normalizeCompanyDomain(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAXIMUM_DOMAIN_INPUT_LENGTH) {
    return undefined;
  }

  const candidate = SCHEME_PATTERN.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return undefined;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return undefined;
  }
  if (parsed.username || parsed.password || parsed.port) return undefined;

  const hostname = parsed.hostname
    .toLowerCase()
    // A fully qualified name may end in the root dot. It names the same host.
    .replace(/\.$/, "")
    .replace(/^www\./, "");

  return isCompanyDomain(hostname) ? hostname : undefined;
}
