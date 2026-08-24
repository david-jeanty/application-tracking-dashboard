"use client";

import { useSyncExternalStore } from "react";
import {
  APPEARANCE_STORAGE_KEY,
  DARK_MEDIA_QUERY,
  DEFAULT_APPEARANCE,
  applyAppearance,
  parseAppearance,
  serializeAppearance,
  type Accent,
  type Appearance,
  type Mode,
} from "@/lib/appearance/appearance";

export type AppearanceSnapshot = Appearance & {
  /**
   * False in server-rendered HTML and during hydration, true once the stored
   * preference has actually been read in the browser.
   */
  ready: boolean;
};

/**
 * The appearance preference, held outside React.
 *
 * `useSyncExternalStore` is used rather than state-in-an-effect because the
 * value genuinely lives in an external system — `localStorage` plus the
 * `<html>` attributes. React renders the server snapshot during hydration and
 * swaps to the browser snapshot immediately afterwards, so the markup matches
 * on both sides without a mismatch warning.
 *
 * The visible theme never waits for any of this: the blocking script in
 * `<head>` has already stamped `<html>` before the first paint. This store
 * only decides what the Settings controls report to assistive technology.
 */
const SERVER_SNAPSHOT: AppearanceSnapshot = { ...DEFAULT_APPEARANCE, ready: false };

let snapshot: AppearanceSnapshot | null = null;
const listeners = new Set<() => void>();

function prefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(DARK_MEDIA_QUERY).matches
  );
}

function read(): AppearanceSnapshot {
  try {
    return {
      ...parseAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)),
      ready: true,
    };
  } catch {
    // Private browsing and blocked storage both land here.
    return { ...DEFAULT_APPEARANCE, ready: true };
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

function getSnapshot(): AppearanceSnapshot {
  snapshot ??= read();
  return snapshot;
}

function getServerSnapshot(): AppearanceSnapshot {
  return SERVER_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  const first = listeners.size === 0;
  listeners.add(listener);

  // Re-read on the first subscription: another tab may have changed the
  // preference while nothing here was mounted.
  if (first) {
    snapshot = read();
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
    snapshot = read();
    applyAppearance(document.documentElement, snapshot, prefersDark());
    emit();
  };

  // `system` keeps following the operating system while the tab is open.
  const query =
    typeof window.matchMedia === "function"
      ? window.matchMedia(DARK_MEDIA_QUERY)
      : null;
  const onSystemChange = () => {
    if (getSnapshot().mode !== "system") return;
    applyAppearance(document.documentElement, getSnapshot(), prefersDark());
  };

  window.addEventListener("storage", onStorage);
  query?.addEventListener("change", onSystemChange);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    query?.removeEventListener("change", onSystemChange);
  };
}

function update(next: Appearance): void {
  snapshot = { ...next, ready: true };
  applyAppearance(document.documentElement, next, prefersDark());

  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      serializeAppearance(next),
    );
  } catch {
    // The choice still applies to this page; it just will not be remembered.
  }

  emit();
}

export function setMode(mode: Mode): void {
  const { accent } = getSnapshot();
  update({ mode, accent });
}

export function setAccent(accent: Accent): void {
  const { mode } = getSnapshot();
  update({ mode, accent });
}

export function useAppearance(): AppearanceSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
