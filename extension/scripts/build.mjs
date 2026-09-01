#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Rebuilds the one supported unpacked-extension layout.
 *
 * Chrome loads `extension/manifest.json`, whose popup is the root
 * `extension/popup.html`. `dist` is compiled JavaScript only. Recreating it
 * prevents obsolete manifests, HTML, CSS, icons, or configuration files from
 * surviving an earlier build and masquerading as a second loadable extension.
 */
const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = dirname(extensionRoot);
const compiler = join(repositoryRoot, "node_modules", "typescript", "bin", "tsc");

rmSync(join(extensionRoot, "dist"), { recursive: true, force: true });
execFileSync(process.execPath, [compiler, "-p", join(extensionRoot, "tsconfig.json")], {
  cwd: repositoryRoot,
  stdio: "inherit",
});
