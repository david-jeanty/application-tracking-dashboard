/**
 * Appearance is a browser-level interface preference, not application data.
 *
 * It is deliberately kept out of Supabase: nothing about a chosen accent
 * belongs in a row-level-secured table, and a database round trip would make
 * the very first paint depend on the network. The preference lives in
 * `localStorage` and is applied to `<html>` by a small blocking script before
 * the browser paints, so a reload never flashes the wrong theme.
 */

export const APPEARANCE_STORAGE_KEY = "jobtrack.appearance";

export const MODES = ["system", "light", "dark"] as const;
export const ACCENTS = ["blue", "rose", "violet", "emerald"] as const;

export type Mode = (typeof MODES)[number];
export type Accent = (typeof ACCENTS)[number];
/** What `system` resolves to once the operating system has been consulted. */
export type ResolvedMode = "light" | "dark";

export type Appearance = {
  mode: Mode;
  accent: Accent;
};

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "system",
  accent: "blue",
};

export const MODE_LABELS: Record<Mode, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const ACCENT_LABELS: Record<Accent, string> = {
  blue: "JobTrack Blue",
  rose: "Rose",
  violet: "Violet",
  emerald: "Emerald",
};

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function isMode(value: unknown): value is Mode {
  return MODES.includes(value as Mode);
}

function isAccent(value: unknown): value is Accent {
  return ACCENTS.includes(value as Accent);
}

/**
 * Reads a stored preference, ignoring anything unrecognized.
 *
 * A hand-edited or stale `localStorage` value must never leave the interface
 * in an unstyled state, so each field falls back to its default on its own.
 */
export function parseAppearance(raw: string | null): Appearance {
  if (!raw) return DEFAULT_APPEARANCE;

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULT_APPEARANCE;

    const candidate = value as Partial<Record<keyof Appearance, unknown>>;

    return {
      mode: isMode(candidate.mode) ? candidate.mode : DEFAULT_APPEARANCE.mode,
      accent: isAccent(candidate.accent)
        ? candidate.accent
        : DEFAULT_APPEARANCE.accent,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function serializeAppearance(appearance: Appearance): string {
  return JSON.stringify(appearance);
}

export function resolveMode(mode: Mode, systemPrefersDark: boolean): ResolvedMode {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}

/**
 * Stamps the preference onto `<html>`.
 *
 * `data-theme` carries the resolved light/dark value that the stylesheet keys
 * its neutral and accent palettes off. `data-mode` carries the raw choice so
 * the Settings controls can show which button is selected in CSS, before React
 * has hydrated.
 */
export function applyAppearance(
  root: HTMLElement,
  appearance: Appearance,
  systemPrefersDark: boolean,
): void {
  const theme = resolveMode(appearance.mode, systemPrefersDark);
  root.dataset.theme = theme;
  root.dataset.mode = appearance.mode;
  root.dataset.accent = appearance.accent;
  root.style.colorScheme = theme;
}
