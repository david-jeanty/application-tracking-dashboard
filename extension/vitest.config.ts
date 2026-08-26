import { defineConfig } from "vitest/config";

/**
 * The extension's own test project.
 *
 * Separate from the application's `vitest.config.ts` because the two run
 * different code in different environments: the app's suite loads React
 * components and server modules, and this one loads browser-extension modules
 * that must not depend on Next.js, React, or the `@/` alias at all.
 */
export default defineConfig({
  // Anchored to this directory rather than to whatever the shell's working
  // directory happens to be, so running it from the repository root does not
  // sweep the application's own suite into the extension project.
  root: import.meta.dirname,
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
