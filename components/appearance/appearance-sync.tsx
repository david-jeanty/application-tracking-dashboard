"use client";

import { useEffect } from "react";
import { watchAppearance } from "@/components/appearance/use-appearance";

/**
 * Mounted once, for every page, from the root layout.
 *
 * It renders nothing. Its only job is to keep a `system` preference following
 * the operating system after the page has loaded — the blocking script in
 * `<head>` already handles the first paint, and the `prefers-color-scheme`
 * rules in the stylesheet cover a visitor without JavaScript.
 */
export function AppearanceSync() {
  useEffect(() => watchAppearance(), []);

  return null;
}
