import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

/**
 * The clickjacking defense, asserted against the configuration itself.
 *
 * There is no other seam for this: the header is set by Next.js from
 * `next.config.ts` rather than by any code a test could call, so what a test
 * can hold is the declaration. What it is holding is the shape of the mistake
 * that was there before — a list of individually named routes, which silently
 * covered `/settings` but not `/settings/delete-account`, and none of the
 * one-click destructive controls at all.
 */

const FRAME_ANCESTORS = "frame-ancestors 'none'";

async function headerRules() {
  if (!nextConfig.headers) throw new Error("next.config.ts declares no headers");
  return nextConfig.headers();
}

function policyFor(
  rules: Awaited<ReturnType<typeof headerRules>>,
  source: string,
): string | undefined {
  return rules
    .find((rule) => rule.source === source)
    ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
}

describe("security headers", () => {
  it("refuses framing on every route through a single wildcard rule", async () => {
    const rules = await headerRules();

    expect(policyFor(rules, "/:path*")).toBe(FRAME_ANCESTORS);
  });

  it("names no individual route, so no path can be left uncovered", async () => {
    const rules = await headerRules();

    const sources = rules
      .filter((rule) =>
        rule.headers.some(
          (header) =>
            header.key === "Content-Security-Policy" &&
            header.value.includes("frame-ancestors"),
        ),
      )
      .map((rule) => rule.source);

    expect(sources).toEqual(["/:path*"]);
  });

  it("sets frame-ancestors and nothing wider yet", async () => {
    const rules = await headerRules();

    // A full policy is a later, report-only rollout. Adding `script-src` or a
    // `default-src` here without that would break the app silently.
    const policy = policyFor(rules, "/:path*") ?? "";
    expect(policy).toBe(FRAME_ANCESTORS);
    expect(policy).not.toMatch(/script-src|default-src/);
  });
});
