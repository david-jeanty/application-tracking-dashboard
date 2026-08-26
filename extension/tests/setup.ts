import { webcrypto } from "node:crypto";

/**
 * jsdom supplies `crypto.getRandomValues` but not always `crypto.subtle`, and
 * PKCE needs a real SHA-256. Node's own Web Crypto implementation is used so
 * the tests exercise the same algorithm the browser will, rather than a stub
 * that would let a broken challenge pass.
 */
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
}
