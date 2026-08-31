import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The release packaging script's placeholder/secret guard, exercised for
 * real rather than re-implemented as a duplicate assertion.
 *
 * `extension/src/config.ts` now carries real production configuration (see
 * `docs/chrome-web-store-release.md`), so this test cannot rely on the
 * repository's ambient state to exercise the guard — it has to actually put
 * a placeholder back. It does that by injecting a known placeholder string
 * into the compiled `dist/config.js`, the same file the packaging script
 * scans, and restoring the original content immediately after. That file is
 * a gitignored build artifact, never a tracked source, so this never risks
 * corrupting anything committed.
 */

const extensionRoot = join(import.meta.dirname, "..");
const scriptPath = join(extensionRoot, "scripts/package.mjs");
const distConfigPath = join(extensionRoot, "dist/config.js");

function runPackageScript(): { threw: boolean; output: string } {
  try {
    execFileSync("node", [scriptPath], {
      cwd: extensionRoot,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { threw: false, output: "" };
  } catch (error) {
    return {
      threw: true,
      output: String(
        (error as { stderr?: unknown; message?: unknown }).stderr ??
          (error as { message?: unknown }).message ??
          "",
      ),
    };
  }
}

describe("extension release packaging", () => {
  it("refuses to package a ZIP when the compiled output carries a placeholder value", () => {
    if (!existsSync(distConfigPath)) {
      // extension/dist doesn't exist yet in this test run's ordering
      // (extension:test runs before extension:build in the aggregate gate).
      // The script's own "dist is missing" refusal is an equally legitimate
      // way to exercise "the guard fires" — it cannot possibly succeed here.
      const result = runPackageScript();
      expect(result.threw).toBe(true);
      expect(result.output).toMatch(/does not exist/);
      return;
    }

    const original = readFileSync(distConfigPath, "utf8");
    const withPlaceholder = original.replace(
      /jobtrackOrigin: ".*?"/,
      'jobtrackOrigin: "https://jobtrack.example.com"',
    );

    // Confirm the substitution actually landed before trusting the assertion
    // below — a regex that silently matched nothing would make this test
    // pass for the wrong reason.
    expect(withPlaceholder).not.toBe(original);
    expect(withPlaceholder).toContain("https://jobtrack.example.com");

    writeFileSync(distConfigPath, withPlaceholder);

    try {
      const result = runPackageScript();
      expect(result.threw).toBe(true);
      expect(result.output).toMatch(/placeholder configuration/);
    } finally {
      writeFileSync(distConfigPath, original);
    }
  });
});
