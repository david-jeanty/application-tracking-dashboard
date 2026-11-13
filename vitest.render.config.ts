import { defineConfig } from "vitest/config";

/**
 * Tests that drive a real headless Chrome (`lib/agent/resume/render.ts`).
 *
 * Separate from `vitest.config.ts` because CI's unit job installs no browser.
 * Run with `npm run test:render` where Chrome is available (Playwright's
 * browsers, or CHROMIUM_EXECUTABLE_PATH). Nothing here is mocked; the point
 * is to measure what Chrome actually lays out and prints.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/render/**/*.test.ts"],
    testTimeout: 60_000,
    fileParallelism: false,
  },
});
