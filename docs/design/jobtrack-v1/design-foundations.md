# Design foundations (UI PR 1)

The presentation-layer foundation later page redesigns build on. No backend,
schema, auth, or MCP behaviour is involved.

## Where things live

| Concern | File |
| --- | --- |
| Tokens, theme blocks, base styles | `app/globals.css` |
| Preference type, parsing, DOM application | `lib/appearance/appearance.ts` |
| Pre-paint blocking script | `lib/appearance/inline-script.ts` |
| React binding for the Settings controls | `components/appearance/use-appearance.ts` |
| Mode and accent pickers | `components/settings/appearance-settings.tsx` |
| Shell and sidebar | `components/app-shell/` |

## Two independent axes

`<html>` carries three attributes:

- `data-theme` — `light` or `dark`, the *resolved* palette.
- `data-mode` — `system`, `light` or `dark`, the raw choice. Only the Settings
  controls read this, so the selected option can be styled in CSS before React
  has hydrated.
- `data-accent` — `blue`, `rose`, `violet` or `emerald`.

Mode and accent never interact. Each accent declares a `-light` and a `-dark`
value; the theme block picks one set:

```css
[data-accent="rose"] { --accent-light: #ad3a5d; --accent-dark: #e28ba4; /* … */ }
:root                { --accent: var(--accent-light); }
:root[data-theme="dark"] { --accent: var(--accent-dark); }
```

Adding an accent is four declarations, not eight rules.

## Tokens

Neutrals — `--background`, `--surface`, `--surface-muted`, `--surface-raised`,
`--foreground`, `--foreground-secondary`, `--foreground-muted`, `--border`,
`--border-strong`.

Accent ink — `--accent`, `--accent-hover`, `--accent-soft`,
`--accent-foreground`, `--focus`.

Semantic status — `--success`, `--warning`, `--danger` (each with a `-soft`
companion), plus `--status-applied`, `--status-screening`,
`--status-assessment` and `--status-interview` for the lifecycle chips.

**Status colour is never derived from the accent.** A rejection reads the same
whichever accent the student picked. Accent governs interaction only: primary
actions, active navigation, links, selection, focus rings, and — later — the
Lifecycle Rail and neutral analytics bars.

Every token is exposed to Tailwind through `@theme inline`, so `bg-surface`,
`text-foreground-muted`, `border-border` and `rounded-control` are ordinary
utilities that follow the live custom properties. A theme change is a variable
swap, never a class swap.

## Shape and spacing

Spacing steps: 4 / 8 / 12 / 16 / 24 / 32 / 48.

Radii: `rounded-control` 6px, `rounded-record` 8px, `rounded-surface` 10px.
`rounded-full` only for genuine pill states such as status chips. Shadows are
reserved for genuinely floating UI — `shadow-menu` on menus, dialogs and the
mobile drawer. `Card` is flat: a border and a 10px radius.

Type scale: page heading ~26px semibold, detail heading ~22–24px, section
heading 16px semibold, body 14px, metadata 13px, micro labels 11–12px.

## Persistence

`localStorage` under `jobtrack.appearance`, holding `{ mode, accent }`. This is
an interface preference, not application data: it is deliberately not a
Supabase table, and the first paint never waits on the network.

The blocking script in `<head>` stamps the attributes before the browser
paints, so a reload cannot flash the wrong theme. Without JavaScript a
`prefers-color-scheme` block guarded by `:root:not([data-theme="light"])`
still honours the operating system.

`useSyncExternalStore` binds React to that state. It is deliberately not
state-set-in-an-effect: the server has no `localStorage`, so the server
snapshot is the default and the browser snapshot takes over immediately after
hydration, with no mismatch.

## Shell

Sidebar 212px, quiet `--surface-muted`, one thin divider, 36–40px navigation
rows with 16px icons. The active row is `accent-soft` plus a short accent
indicator, not a filled pill. Archive sits apart from the live workflow;
Settings sits at the foot above a quiet account row.

There is no desktop page-title header. The sidebar establishes location and
each page supplies its own heading, so a shell header only printed the same
word twice. Mobile keeps a slim bar because the drawer needs a trigger.

Workspace: `max-width` 1440px, padding 32px desktop / 24px tablet / 16px
mobile.
