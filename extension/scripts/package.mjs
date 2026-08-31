#!/usr/bin/env node
/**
 * Builds the exact Chrome Web Store release ZIP from `extension/dist`.
 *
 * This is deliberately a plain Node script, not a bundler or release
 * framework: the extension already builds with `tsc` and nothing else, and
 * packaging just has to assemble the same runtime files a `Load unpacked`
 * install uses, plus a placeholder/secret guard a manual `zip -r` cannot give
 * you. Run `npm run extension:build` first (or use `npm run extension:package`,
 * which does both).
 *
 * Refuses to produce a ZIP that still carries development placeholder values
 * or anything that looks like a secret, so a release candidate can never be
 * built from an unconfigured `extension/src/config.ts` by accident.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(extensionRoot, "dist");
const releaseDir = join(extensionRoot, "release");

const PLACEHOLDER_STRINGS = [
  "jobtrack.example.com",
  "your-project-ref.supabase.co",
  "replace-with-the-extension-oauth-client-id",
];

const SECRET_PATTERNS = [
  /client_secret/i,
  /service_role/i,
  /sb_secret/i,
  /SUPABASE_SERVICE/i,
];

// Exactly the files a `Load unpacked` install reads at runtime. No src/,
// tests/, tsconfig*.json, vitest.config.ts, node_modules, or .map files.
const RUNTIME_FILES = ["manifest.json", "popup.html", "popup.css"];
const RUNTIME_DIRS = ["icons", "dist"];

function fail(message) {
  console.error(`\npackage.mjs: ${message}\n`);
  process.exit(1);
}

function readManifest() {
  const path = join(extensionRoot, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function collectSourceText() {
  const manifestText = readFileSync(join(extensionRoot, "manifest.json"), "utf8");
  const distFiles = existsSync(distDir) ? listDistJsFiles(distDir) : [];
  const distText = distFiles.map((file) => readFileSync(file, "utf8")).join("\n");
  return `${manifestText}\n${distText}`;
}

function listDistJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listDistJsFiles(full));
    else if (entry.name.endsWith(".js")) files.push(full);
  }
  return files;
}

function guardAgainstPlaceholdersAndSecrets() {
  if (!existsSync(distDir)) {
    fail("extension/dist does not exist. Run `npm run extension:build` first.");
  }

  const combined = collectSourceText();

  const foundPlaceholders = PLACEHOLDER_STRINGS.filter((value) =>
    combined.includes(value),
  );
  if (foundPlaceholders.length > 0) {
    fail(
      "Refusing to package a ZIP with development placeholder configuration.\n" +
        `  Found: ${foundPlaceholders.join(", ")}\n` +
        "  Fix: set the real production values in extension/src/config.ts " +
        "(jobtrackOrigin, supabaseUrl, oauthClientId) and the matching " +
        "host_permissions in extension/manifest.json, then rebuild.",
    );
  }

  const foundSecretPatterns = SECRET_PATTERNS.filter((pattern) =>
    pattern.test(combined),
  );
  if (foundSecretPatterns.length > 0) {
    fail(
      "Refusing to package a ZIP that appears to reference a secret-shaped " +
        `value (matched: ${foundSecretPatterns.map((p) => p.source).join(", ")}). ` +
        "An extension package can never hold a client secret or service-role key.",
    );
  }
}

function guardManifestHostPermissionsAgainstConfig(manifest) {
  // Re-derive the two required origins the same way extension/src/config.ts
  // does, without importing TypeScript into a plain Node script: read the
  // compiled dist/config.js, which is what actually ships.
  const configPath = join(distDir, "config.js");
  if (!existsSync(configPath)) {
    fail("extension/dist/config.js is missing. Run `npm run extension:build` first.");
  }

  const configSource = readFileSync(configPath, "utf8");
  const jobtrackMatch = configSource.match(/jobtrackOrigin:\s*"([^"]+)"/);
  const supabaseMatch = configSource.match(/supabaseUrl:\s*"([^"]+)"/);

  if (!jobtrackMatch || !supabaseMatch) {
    fail("Could not read jobtrackOrigin/supabaseUrl out of extension/dist/config.js.");
  }

  const required = [jobtrackMatch[1], supabaseMatch[1]]
    .map((value) => `${new URL(value).origin}/*`)
    .sort();
  const actual = [...manifest.host_permissions].sort();

  if (JSON.stringify(required) !== JSON.stringify(actual)) {
    fail(
      "manifest.json host_permissions do not match extension/src/config.ts.\n" +
        `  Expected: ${JSON.stringify(required)}\n` +
        `  Found:    ${JSON.stringify(actual)}`,
    );
  }
}

function guardNoAllUrlsOrWildcard(manifest) {
  const forbidden = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"];
  const present = manifest.host_permissions.filter((value) =>
    forbidden.includes(value),
  );
  if (present.length > 0) {
    fail(`manifest.json requests a broad host pattern: ${present.join(", ")}`);
  }
}

async function assembleStagingDirectory() {
  const staging = mkdtempSync(join(tmpdir(), "interndex-capture-"));

  for (const file of RUNTIME_FILES) {
    await cp(join(extensionRoot, file), join(staging, file));
  }
  for (const dir of RUNTIME_DIRS) {
    await cp(join(extensionRoot, dir), join(staging, dir), { recursive: true });
  }

  return staging;
}

function sha256Of(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

async function main() {
  const manifest = readManifest();

  guardAgainstPlaceholdersAndSecrets();
  guardManifestHostPermissionsAgainstConfig(manifest);
  guardNoAllUrlsOrWildcard(manifest);

  const staging = await assembleStagingDirectory();
  await mkdir(releaseDir, { recursive: true });

  const outputName = `interndex-capture-v${manifest.version}.zip`;
  const outputPath = join(releaseDir, outputName);
  rmSync(outputPath, { force: true });

  // `zip` is used rather than a bundled dependency: it is the standard tool
  // for producing a Chrome Web Store package and this avoids adding a whole
  // archiving library for one command run at release time.
  execFileSync("zip", ["-X", "-r", outputPath, "."], { cwd: staging });

  const size = statSync(outputPath).size;
  const checksum = sha256Of(outputPath);
  const listing = execFileSync("unzip", ["-l", outputPath], { encoding: "utf8" });

  rmSync(staging, { recursive: true, force: true });

  console.log(`\nBuilt ${outputPath}`);
  console.log(`  manifest version: ${manifest.version}`);
  console.log(`  size: ${size} bytes`);
  console.log(`  sha256: ${checksum}`);
  console.log(`\nContents:\n${listing}`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.stack ?? error.message : String(error));
});
