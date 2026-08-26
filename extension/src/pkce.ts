/**
 * The one-time secrets an OAuth authorization request needs.
 *
 * The extension is a public client: it ships to every user, so it holds no
 * client secret and could not keep one if it tried. Proof Key for Code Exchange
 * is what replaces that secret. The verifier stays inside the extension, only
 * its SHA-256 hash travels with the authorization request, and the code that
 * comes back is worthless to anyone who cannot produce the original.
 *
 * `S256` only. RFC 7636 also defines a `plain` method that sends the verifier
 * itself, which protects against nothing an attacker who can see the request
 * cannot already do.
 */

/** 32 bytes, which base64url-encodes to the 43 characters RFC 7636 allows. */
const VERIFIER_BYTES = 32;

/** 32 bytes of state as well: this must be unguessable, not merely unique. */
const STATE_BYTES = 32;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);

  return base64UrlEncode(bytes);
}

/**
 * The value that ties an authorization response back to the request that
 * started it, so a callback the extension did not ask for is rejected.
 */
export function createState(): string {
  return randomBase64Url(STATE_BYTES);
}

/** A fresh code verifier. Never leaves the extension, never reused. */
export function createCodeVerifier(): string {
  return randomBase64Url(VERIFIER_BYTES);
}

/** The `S256` challenge derived from a verifier. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );

  return base64UrlEncode(new Uint8Array(digest));
}

export type PkcePair = { verifier: string; challenge: string };

/** A matched verifier/challenge pair for one authorization attempt. */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = createCodeVerifier();

  return { verifier, challenge: await deriveCodeChallenge(verifier) };
}

/**
 * Whether a value is shaped like a usable RFC 7636 code verifier.
 *
 * Used by the tests to hold the generator to the specification, and cheap
 * enough to keep as a guard on anything that claims to be one.
 */
export function isValidCodeVerifier(value: string): boolean {
  return /^[A-Za-z0-9\-._~]{43,128}$/.test(value);
}
