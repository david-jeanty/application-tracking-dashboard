import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(extensionDirectory, "..");
const outputDirectory = resolve(extensionDirectory, "dist");

if (outputDirectory !== resolve(repositoryDirectory, "extension", "dist")) {
  throw new Error("Refusing to clean an unexpected extension output path.");
}

function readEnvironmentFile(path) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function requiredOrigin(value, name) {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} must be an origin without a path, query, or hash.`);
  }
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  ) {
    throw new Error(`${name} must use HTTPS except on localhost.`);
  }
  return url.origin;
}

const fileEnvironment = readEnvironmentFile(resolve(repositoryDirectory, ".env.local"));
const environment = { ...fileEnvironment, ...process.env };
const jobTrackOrigin = requiredOrigin(
  environment.JOBTRACK_EXTENSION_SITE_ORIGIN ??
    environment.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000",
  "JOBTRACK_EXTENSION_SITE_ORIGIN",
);
const supabaseOrigin = requiredOrigin(
  environment.JOBTRACK_EXTENSION_SUPABASE_URL ??
    environment.NEXT_PUBLIC_SUPABASE_URL ??
    "http://127.0.0.1:54321",
  "JOBTRACK_EXTENSION_SUPABASE_URL",
);
const oauthClientId = (environment.JOBTRACK_EXTENSION_OAUTH_CLIENT_ID ?? "").trim();

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const tscPath = resolve(repositoryDirectory, "node_modules", "typescript", "bin", "tsc");
execFileSync(process.execPath, [tscPath, "-p", resolve(extensionDirectory, "tsconfig.json")], {
  cwd: repositoryDirectory,
  stdio: "inherit",
});

const manifest = JSON.parse(
  readFileSync(resolve(extensionDirectory, "manifest.json"), "utf8"),
);
manifest.host_permissions = [`${jobTrackOrigin}/*`, `${supabaseOrigin}/*`];

writeFileSync(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
writeFileSync(
  resolve(outputDirectory, "config.json"),
  `${JSON.stringify(
    { jobTrackOrigin, supabaseOrigin, oauthClientId },
    null,
    2,
  )}\n`,
);

for (const file of ["popup.html", "popup.css"]) {
  cpSync(resolve(extensionDirectory, file), resolve(outputDirectory, file));
}
cpSync(resolve(extensionDirectory, "icons"), resolve(outputDirectory, "icons"), {
  recursive: true,
});

console.log(`Built Interndex Capture in ${outputDirectory}`);
console.log(`Interndex origin: ${jobTrackOrigin}`);
console.log(`Supabase origin: ${supabaseOrigin}`);
console.log(`Dedicated OAuth client: ${oauthClientId ? "configured" : "not configured"}`);
