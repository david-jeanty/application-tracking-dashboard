/**
 * Rendering the two values on the consent screen that an attacker chooses.
 *
 * Dynamic client registration is open, by design: an MCP client registers
 * itself rather than being pre-arranged with us (`supabase/config.toml`'s
 * `allow_dynamic_registration`). Registration grants nothing on its own — a
 * signed-in student still has to approve — but it does mean two of the strings
 * the consent screen shows are written by whoever registered the client: its
 * name, and the address the student is returned to.
 *
 * React escapes both, so neither is an injection risk. What they are is a
 * spoofing risk, and the three things that make a name deceptive are handled
 * here rather than in the page:
 *
 *   1. length — a 300-character name pushes the buttons, and the destination
 *      the student is meant to check, off the bottom of a phone screen;
 *   2. line structure — a name containing newlines draws itself as several
 *      lines of what looks like the page's own copy;
 *   3. direction and invisibility — bidirectional overrides and zero-width
 *      characters let a name render as text other than what it contains.
 *
 * None of this makes an unfamiliar client safe. It makes the name legible as
 * one bounded value, which is what lets the page present it as something the
 * request claims rather than something Interndex is saying.
 */

/** Long enough for a real product name, short enough to stay one line. */
export const MAXIMUM_CLIENT_NAME_CHARACTERS = 60;

/** The redirect address is shown in full below its host, but not endlessly. */
export const MAXIMUM_REDIRECT_URI_CHARACTERS = 120;

/**
 * Characters that change how the text around them is drawn without being
 * drawn themselves: C0/C1 controls, the bidirectional marks and overrides,
 * the isolates, and the zero-width joiners and spaces.
 */
const INVISIBLE_PATTERN =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** The ellipsis marking a value the screen shortened. */
const ELLIPSIS = "…";

/**
 * Reduces caller-supplied text to a single clean line, shortened if need be.
 *
 * Whitespace of every kind collapses to one space, so a name cannot occupy
 * more vertical room than the one line the layout gives it.
 *
 * Whitespace collapses *before* the invisible characters are removed, and the
 * order is load-bearing: a line feed is both whitespace and a C0 control, so
 * stripping first would delete it outright and run the words on either side
 * together — turning "Claude\nOfficial" into "ClaudeOfficial", a name the
 * registration never chose. Collapsing first turns it into the space it is
 * standing in for. The second collapse tidies the gaps that removing a
 * zero-width character between two spaces can leave behind.
 */
function toSingleLine(value: string, limit: number): string {
  const flattened = value
    .replace(/\s+/g, " ")
    .replace(INVISIBLE_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= limit) return flattened;

  return `${flattened.slice(0, limit - 1).trimEnd()}${ELLIPSIS}`;
}

/**
 * The client's name as the consent screen should show it, or `null` when the
 * registration supplied nothing usable.
 *
 * `null` is a real answer rather than a fallback string: a client that did not
 * name itself is worth saying so about, and the page says it in its own voice
 * instead of inventing a name on the client's behalf.
 */
export function displayClientName(
  name: unknown,
  limit = MAXIMUM_CLIENT_NAME_CHARACTERS,
): string | null {
  if (typeof name !== "string") return null;

  const displayed = toSingleLine(name, limit);
  return displayed.length > 0 ? displayed : null;
}

export type RedirectTarget = {
  /** The host the student will be sent to, shown prominently. Never invented. */
  host: string | null;
  /** The whole address, shortened for display only. */
  url: string;
};

/**
 * Splits the return address into the part worth reading first and the rest.
 *
 * The host is the only part of a redirect URI that says who receives the
 * authorization code, so it is pulled out and shown on its own. A URI that
 * does not parse gets `null` for the host and is shown as text: better a
 * student sees something they cannot recognize than a host this function
 * guessed at by pattern.
 */
export function describeRedirectTarget(
  redirectUri: unknown,
  limit = MAXIMUM_REDIRECT_URI_CHARACTERS,
): RedirectTarget {
  const raw = typeof redirectUri === "string" ? redirectUri : "";
  const url = toSingleLine(raw, limit);

  try {
    // `host` rather than `hostname`: a non-default port is part of who this
    // is, and hiding it would flatter an address that deserves a second look.
    const { host } = new URL(raw);
    return { host: host.length > 0 ? toSingleLine(host, limit) : null, url };
  } catch {
    return { host: null, url };
  }
}
