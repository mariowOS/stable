# mariowOS 2 design language

mariowOS 2 has its own look: graphite glass with one hairline rim per sheet, a soft accent wash
for selection (with a short accent bar at the leading edge of sidebars), rounded-square icon tiles
with a diagonal gradient, and calm motion. It is not a copy of another desktop: no traffic lights,
no Fluent acrylic, no hover magnification and no rubber-band springs.

Everything shared lives in:

| File | What it is |
| --- | --- |
| [`desktop/assets/mw-design.css`](../desktop/assets/mw-design.css) | Tokens: colors, surfaces, glass, radii, shadows, type, motion, focus. Custom properties only. |
| [`desktop/assets/mw-theme.js`](../desktop/assets/mw-theme.js) | Sets `<html data-theme>` from the saved choice and keeps every page in sync. |
| [`desktop/assets/mw-shell.css`](../desktop/assets/mw-shell.css) | The desktop shell drawn with the tokens: taskbar, apps menu, control panel, notification centre, menus, window chrome, toasts, dialogs. |
| [`desktop/assets/icons/system/`](../desktop/assets/icons/system/) | The system app icons (SVG, 48×48). |
| [`desktop/apps/settings/assets/mw2-settings.css`](../desktop/apps/settings/assets/mw2-settings.css) | The common look of every Settings page (cards, rows, switches, fields, buttons). |

## Using it in a page

```html
<script src="/desktop/assets/i18n-data.js"></script>
<script src="/desktop/assets/i18n.js"></script>
<script src="/desktop/assets/accent.js"></script>
<script src="/desktop/assets/mw-theme.js"></script>
<link rel="stylesheet" href="/desktop/assets/mw-design.css">
```

`mw-theme.js` goes before any stylesheet so the first paint is already in the right theme.
Stylesheets that are not pages start with `@import url('/desktop/assets/mw-design.css');`.

Apps keep their short local names and point them at the tokens:

```css
:root {
  --accent: var(--mw-accent);
  --text: var(--mw-text);
  --muted: var(--mw-text-secondary);
  --sidebar: var(--mw-glass-sidebar);
}
```

## Themes

Dark is the default. `:root[data-theme="light"]` redefines colors, fills, lines, surfaces, glass
and shadows; radii, spacing, motion and type are the same in both.

**How the theme is chosen.** The user picks Dark, Light or Automatic in Settings › Wallpaper &
Style › Appearance. The choice is saved as `theme` (`"dark"`, `"light"` or `"auto"`) in
`config.json` through `POST /save-settings` (it is in the allowlist), and cached in
`localStorage["mwTheme"]` so pages can paint without waiting for the server. `"auto"` follows
`prefers-color-scheme`. The old Functions Lab `darkMode` flag is unrelated: it is an experiment that
deepens the dark surfaces.

**How a page follows it.** `mw-theme.js`:

- reads `localStorage["mwTheme"]` and sets `document.documentElement.dataset.theme` to `"dark"` or
  `"light"` (and `dataset.themeChoice` to the raw choice) before the first paint;
- listens for the `storage` event, so every same-origin page and frame updates as soon as Settings
  saves a new choice;
- listens for `postMessage({ type: 'mw-theme', theme })` from the same origin and passes it on to
  its own iframes (nested Settings pages, app frames);
- in the top-level window only (desktop, lock screen, sign-in) fetches `/get-settings` once, in case
  the cache is missing or stale.

API: `mariowOSTheme.get()` (saved choice), `mariowOSTheme.resolved()` (`"dark"`/`"light"`),
`mariowOSTheme.set(choice)` (save, apply here, tell the top window and the frames),
`mariowOSTheme.apply(choice)` (apply here only).

To switch from code: `mariowOSTheme.set('light')`. From a page that does not load the script:
`window.top.postMessage({ type: 'mw-theme', theme: 'light' }, location.origin)`.

Pages that always stay dark: Terminal (a terminal), the lock screen and the sign-in screen (they sit
on the wallpaper with light text), boot and setup (black stage).

## Writing theme-aware CSS

- Text: `var(--mw-text)` and the `--mw-text-*` ramp, never `#fff`.
- Layers on glass: `--mw-fill-*`, or `rgba(var(--mw-ink), a)` for an exact alpha. `--mw-ink` is
  `255, 255, 255` in dark and `0, 0, 0` in light.
- Darkening layers (title bars, wells): `rgba(var(--mw-shade), a)`; `--mw-shade` is black in dark
  and white in light.
- Solid surfaces (menus, select options, sticky headers): `--mw-surface-0..3`.
- White stays white only on things that keep their color in both themes: colored icon tiles,
  artwork, video. Text on an accent fill is `--mw-accent-on`.
- Shadows are always black and never use `--mw-ink`.

## Tokens

### Accent

Picked by the user (Settings › Wallpaper & Style) and set live by `accent.js`.

| Token | Use |
| --- | --- |
| `--mw-accent` | Fills: primary buttons, switches that are on, progress |
| `--mw-accent-on` | Text and icons on an accent fill |
| `--mw-accent-text` | Text, icons and thin marks on a surface (darkened in light) |
| `--mw-accent-hover`, `--mw-accent-pressed` | Primary button states |
| `--mw-accent-soft`, `--mw-accent-softer` | Selection wash, chips |
| `--mw-accent-line` | Selection outline |

Never put white text on `--mw-accent`: any accent can be picked.

### Colors and status

`--mw-blue`, `--mw-indigo`, `--mw-green`, `--mw-red`, `--mw-orange`, `--mw-yellow`, `--mw-purple`,
`--mw-pink`, `--mw-teal`, `--mw-graphite` (slightly deeper in light). For meaning use the roles:
`--mw-success`, `--mw-warning`, `--mw-danger`, `--mw-info`, and their `-soft` washes.

### Text

`--mw-text` (#f4f5f8 / #15171c), then `--mw-text-strong` 88%, `--mw-text-body` 80%,
`--mw-text-secondary` 60%, `--mw-text-muted` 50%, `--mw-text-dim` 36%, `--mw-text-disabled` 28%.

### Fills and lines

Fills, weakest to strongest: `--mw-fill-faint`, `-subtle`, `-soft`, `-hover`, `--mw-fill`,
`-strong`, `-tile`, `-pressed`, `-key-hover`. Lines: `--mw-divider`, `--mw-border-subtle`,
`--mw-border`, `--mw-border-strong`.

### Surfaces and glass

| Token | Use |
| --- | --- |
| `--mw-surface-0` | Desktop and full-screen pages |
| `--mw-surface-1` | Window body (solid) |
| `--mw-surface-2` | Cards and raised panes |
| `--mw-surface-3` | Menus, popovers, dialogs |
| `--mw-glass-thin` | Bars on the wallpaper (taskbar) |
| `--mw-glass-regular` | Windows and panels |
| `--mw-glass-thick` | Menus, popovers, notification cards |
| `--mw-glass-solid` | No-blur fallback, dialogs |
| `--mw-glass-sidebar`, `--mw-glass-panel` | App sidebars |
| `--mw-glass-menu` | In-app context menus |
| `--mw-titlebar` | Window title bars and app toolbars |
| `--mw-field`, `--mw-field-strong`, `--mw-field-border` | Inputs and search boxes |
| `--mw-scrim` | Behind modal dialogs |

Pair glass with `backdrop-filter: blur(var(--mw-blur-xl)) saturate(var(--mw-glass-saturate))`.
Blur radii: `--mw-blur-sm` 12px, `-md` 20px, `-lg` 30px, `-xl` 40px.

### Radii

`--mw-radius-xs` 4, `-sm` 6, `-md` 8, `-card` 12, `-lg` 14, `-xl` 18, `-2xl` 24, `-full` (pills);
roles: `--mw-radius-window` 14, `--mw-radius-control` 8, `--mw-radius-squircle` 26% (icon tiles).

### Elevation

`--mw-shadow-xs`, `-sm`, `-md` (popovers), `-lg` (panels, dialogs), `--mw-shadow-window`.
`--mw-edge` is the hairline rim every glass sheet carries (`box-shadow: var(--mw-edge), var(--mw-shadow-lg)`),
`--mw-edge-top` and `--mw-edge-right` are single-side highlights.

### Focus

`--mw-focus-ring` (2px gap + 2px accent, for buttons) and `--mw-focus-ring-inset` (for list rows).
Fields show `border-color: var(--mw-accent-text)` plus `0 0 0 3px var(--mw-accent-soft)`. Use them
on `:focus-visible`; the desktop disables outlines, so rings are box-shadows.

### Spacing and controls

A 4px grid: `--mw-space-1` 4 … `--mw-space-10` 40. Controls: `--mw-control-h-sm` 28,
`--mw-control-h` 34, `--mw-control-h-lg` 40, list rows `--mw-row-h` 52.

### Motion

| Token | Value | Use |
| --- | --- | --- |
| `--mw-ease-out` | `cubic-bezier(0.2, 0, 0, 1)` | Almost everything |
| `--mw-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving |
| `--mw-ease-standard` | `cubic-bezier(0.2, 0, 0.2, 1)` | Moves within the page |
| `--mw-ease-sheet` | `cubic-bezier(0.25, 0.8, 0.25, 1)` | Panels rising from the taskbar |
| `--mw-ease-spring`, `--mw-ease-bounce` | = `--mw-ease-out` | Legacy names, no overshoot any more |

Durations: `--mw-duration-instant` 80ms, `-fast` 120ms (hover), `-base` 180ms, `-medium` 240ms
(open), `-slow` 360ms (sheets). Rules: hover changes color or fill only, never size; a press may
scale to `--mw-press-scale` (0.97) at most; nothing overshoots. `prefers-reduced-motion` shortens
every duration.

### Typography

Poppins (self-hosted in `desktop/assets/fonts/fonts.css`), `--mw-font-mono` for code, Material
Symbols Outlined (`--mw-font-icons`) for UI glyphs. Sizes: `--mw-font-size-2xs` 10, `-xs` 11,
`-sm` 12, `-base` 13, `-md` 14, `-lg` 16, `-xl` 20, `-2xl` 24, `-title` 28, `-display` 40.
Weights 400 / 500 / 600. Page titles 24px semibold with -0.015em tracking; section labels 11px
semibold uppercase with `--mw-tracking-caps`.

## Icons

UI glyphs are Material Symbols, never emoji. App icons are the SVG set in
`desktop/assets/icons/system/`: a 44×44 rounded tile (rx 12.5) on a 48×48 canvas, a diagonal
two-stop gradient (top-left to bottom-right), a soft top sheen, a 1px inner rim, and a white
2.6px-stroke glyph. Files: `calculator.svg`, `calendar.svg`, `explorer.svg` (= `files.svg`),
`help.svg`, `music.svg`, `notes.svg`, `pictures.svg`, `settings.svg`, `terminal.svg`,
`videoplayer.svg` (= `videos.svg`), `store.svg`, and the logo mark `mariowos.svg`.

Small icon tiles inside apps (Settings sidebar, Files places) use the same diagonal gradients.

## Components (as drawn in Settings and Files)

- **Sidebar item**: 8px radius, hover `--mw-fill-hover`; selected `--mw-accent-soft` with a 3px
  `--mw-accent-text` bar at the leading edge.
- **Card**: `--mw-fill-subtle` on glass, 1px `--mw-border-subtle`, 12px radius; rows inside are
  separated by `--mw-divider`.
- **Switch**: pill track `--mw-fill-key-hover`, `--mw-accent` when on, white knob, 180ms ease-out.
- **Button**: 34px high, 8px radius, 500 weight; primary is `--mw-accent` / `--mw-accent-on`.
- **Field**: `--mw-field` with `--mw-field-border`, accent border and soft ring on focus.
- **Window**: 14px radius, `--mw-titlebar` header with a bottom divider, caption buttons that fill
  on hover (close turns `--mw-danger`).
