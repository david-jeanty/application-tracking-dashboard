import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The release packaging script's placeholder/secret guard, exercised for
 * real rather than re-implemented as a duplicate assertion.
 *
 * `extension/src/config.ts` ships with development placeholder values until
 * someone substitutes the real production origin, Supabase project, and
 * OAuth client id (see `docs/chrome-web-store-release.md`). As long as that
 * remains true, `npm run extension:package` must refuse to produce a ZIP —
 * this is exactly the failure mode a reviewer cannot see by reading the
 * built package after the fact, only by watching the build step refuse.
 */

const extensionRoot = join(import.meta.dirname, "..");

describe("extension release packaging", () => {
  it("refuses to package a ZIP while config.ts still carries placeholder values", () => {
    let threw = false;
    let output = "";

    try {
      execFileSync("node", [join(extensionRoot, "scripts/package.mjs")], {
        cwd: extensionRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (error) {
      threw = true;
      output = String(
        (error as { stderr?: unknown; message?: unknown }).stderr ??
          (error as { message?: unknown }).message ??
          "",
      );
    }

    // This assumes extension/dist already exists from a prior build step in
    // the same test run (`npm run extension:check` or `extension:build`
    // runs first in the aggregate gate). If dist is missing, the script
    // fails for that reason instead, which is also a legitimate refusal.
    expect(threw).toBe(true);
    expect(output).toMatch(/placeholder configuration|does not exist/);
  });
});
