import {
  ACCENTS,
  APPEARANCE_STORAGE_KEY,
  DARK_MEDIA_QUERY,
  DEFAULT_APPEARANCE,
  MODES,
} from "@/lib/appearance/appearance";

/**
 * The blocking script that applies the stored appearance before first paint.
 *
 * This runs in `<head>`, ahead of hydration, which is the only way to avoid a
 * visible flash of the default light theme for someone who chose dark. It is
 * intentionally dependency-free and never throws: if `localStorage` is
 * unavailable (private browsing, blocked storage) the document simply keeps
 * the default appearance the stylesheet already provides.
 *
 * It is generated from the same constants the React code uses so the two
 * cannot drift apart.
 */
export function appearanceInlineScript(): string {
  const key = JSON.stringify(APPEARANCE_STORAGE_KEY);
  const modes = JSON.stringify(MODES);
  const accents = JSON.stringify(ACCENTS);
  const query = JSON.stringify(DARK_MEDIA_QUERY);
  const defaults = JSON.stringify(DEFAULT_APPEARANCE);

  return `(function(){try{var d=document.documentElement,f=${defaults},m=f.mode,a=f.accent;try{var s=localStorage.getItem(${key});if(s){var v=JSON.parse(s);if(v&&typeof v==="object"){if(${modes}.indexOf(v.mode)>-1)m=v.mode;if(${accents}.indexOf(v.accent)>-1)a=v.accent;}}}catch(e){}var t=m==="system"?(window.matchMedia&&window.matchMedia(${query}).matches?"dark":"light"):m;d.dataset.theme=t;d.dataset.mode=m;d.dataset.accent=a;d.style.colorScheme=t;}catch(e){}})();`;
}
