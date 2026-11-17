import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

/**
 * The MCP function prints resumes in headless Chrome on Vercel. Two packages
 * need files that build tracing cannot see, and without them Chrome never
 * launches on the server (calibrate_template answered launch_failed:
 * "Cannot find module .../playwright-core/browsers.json").
 */
describe("files copied into the MCP function", () => {
  const includes = nextConfig.outputFileTracingIncludes?.["/api/mcp"] ?? [];

  it("copies the compressed Chrome from @sparticuz/chromium", () => {
    expect(includes).toContain("./node_modules/@sparticuz/chromium/bin/**");
  });

  it("copies all of playwright-core, including browsers.json", () => {
    expect(includes).toContain("./node_modules/playwright-core/**");
  });

  it("keeps both packages out of the bundle", () => {
    expect(nextConfig.serverExternalPackages).toEqual(
      expect.arrayContaining(["@sparticuz/chromium", "playwright-core"]),
    );
  });
});
