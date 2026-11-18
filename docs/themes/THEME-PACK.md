# Nest Theme Pack Specification (v1)

Nest's look is **data, not code**. A theme pack is a folder with a `theme.json`
and optional fonts/images. Nest maps the JSON tokens onto CSS variables, the
native title bar and (later) preview cards. The layout — rail width, card grid,
timeline placement — is owned by Nest and is **not** themeable.

This document is written so that an AI can generate a valid pack from a short
natural-language brief. Feed it the **AI prompt template** at the end.

---

## 1. Folder layout

```
themes/<id>/
  theme.json          # required, validated against schemas/theme.schema.json
  preview.webp        # optional, 16:9, shown in the theme picker
  fonts/*.woff2       # optional, referenced from fonts.*.files[].src
  assets/bg.webp      # optional, referenced from background.image
  assets/logo.svg     # optional, referenced from assets.logo
```

- Built-in packs: `resources/themes/<id>/`
- User packs: `<userData>/themes/<id>/` (a user pack with the same `id` overrides the built-in one)
- `id` must match `^[a-z0-9][a-z0-9-]{1,48}$`

## 2. Hard rules

1. **No code**: only JSON/fonts/images. CSS, JS, HTML are rejected.
2. **No path escapes**: every `src`/`image`/`preview` is resolved inside the pack.
3. **Size limits**: each asset ≤ 16 MB; keep the whole pack under ~40 MB.
4. **Allowed asset formats**: `woff2/woff/ttf/otf` (fonts), `webp/png/jpg` (images), `svg` (logo).
5. **Unknown keys are errors**. `schemaVersion` is `1`.
6. Layout tokens do not exist here; do not invent selectors or CSS.

Validate a pack with:

```bash
node tools/validate-theme.mjs resources/themes/default
```

## 3. Token reference

Every token below becomes a CSS custom property (last column). Defaults are the
values shipped in `resources/themes/default/theme.json`.

| Token | Default | CSS variable |
|---|---|---|
| `colors.bg` | `#08080a` | `--bg` |
| `colors.ink` | `#f4f4f6` | `--ink` |
| `colors.muted` | `rgba(255, 255, 255, 0.44)` | `--muted` |
| `colors.hair` | `rgba(255, 255, 255, 0.08)` | `--hair` |
| `colors.accent` | `#f4f4f6` | `--theme-accent` |
| `colors.accentInk` | `#08080a` | `--theme-accent-ink` |
| `colors.danger` | `#ff5a5a` | `--theme-danger` |
| `colors.success` | `#61d095` | `--theme-success` |
| `colors.warning` | `#f5c451` | `--theme-warning` |
| `colors.overlay` | `rgba(0, 0, 0, 0.55)` | `--theme-overlay` |
| `colors.selection` | `rgba(255, 255, 255, 0.16)` | `--theme-selection` |
| `colors.panel` | `rgba(255, 255, 255, 0.04)` | `--theme-panel` |
| `colors.panelStrong` | `rgba(255, 255, 255, 0.06)` | `--theme-panel-strong` |
| `colors.menu` | `rgba(18, 18, 21, 0.94)` | `--theme-menu` |
| `colors.shelf` | `rgba(10, 10, 12, 0.55)` | `--theme-shelf` |
| `colors.toast` | `rgba(28, 28, 32, 0.96)` | `--theme-toast` |
| `colors.dialog` | `rgba(16, 16, 19, 0.97)` | `--theme-dialog` |
| `typography.body.size` | `15px` | `--type-body-size` |
| `typography.body.weight` | `500` | `--type-body-weight` |
| `typography.body.lineHeight` | `1.4` | `--type-body-line` |
| `typography.body.letterSpacing` | `0` | `--type-body-tracking` |
| `typography.title.size` | `20px` | `--type-title-size` |
| `typography.title.weight` | `700` | `--type-title-weight` |
| `typography.title.lineHeight` | `1.2` | `--type-title-line` |
| `typography.title.letterSpacing` | `0` | `--type-title-tracking` |
| `typography.h1.size` | `28px` | `--type-h1-size` |
| `typography.h1.weight` | `800` | `--type-h1-weight` |
| `typography.h1.lineHeight` | `1.1` | `--type-h1-line` |
| `typography.h1.letterSpacing` | `0` | `--type-h1-tracking` |
| `typography.label.size` | `11px` | `--type-label-size` |
| `typography.label.weight` | `700` | `--type-label-weight` |
| `typography.label.lineHeight` | `1.2` | `--type-label-line` |
| `typography.label.letterSpacing` | `0.08em` | `--type-label-tracking` |
| `shape.radiusSmall` | `10px` | `--radius-sm` |
| `shape.radius` | `16px` | `--radius` |
| `shape.radiusLarge` | `24px` | `--radius-lg` |
| `shape.borderWidth` | `1px` | `--border-width` |
| `effects.panelBlur` | `18px` | `--panel-blur` |
| `effects.photoBlur` | `4.5px` | `--photo-blur` |
| `effects.grain` | `0.5` | `--grain-opacity` |
| `effects.shadow` | `0 24px 60px rgba(0, 0, 0, 0.45)` | `--shadow` |
| `effects.glow` | `0 0 24px rgba(255, 255, 255, 0.08)` | `--glow` |
| `background.type` | `gradient` | `--theme-bg-type` |
| `background.color` | `` | `--theme-bg-color` |
| `background.image` | `` | `--theme-bg-image` |
| `background.fit` | `cover` | `--theme-bg-fit` |
| `background.dim` | `0` | `--theme-bg-dim` |
| `background.blur` | `0px` | `--theme-bg-blur` |
| `background.grain` | `0.5` | `--theme-bg-grain` |
| `background.parallax` | `1` | `--theme-parallax` |
| `window.titleBar.height` | `38` | `--titlebar-height` |
| `window.titleBar.background` | `#08080a` | `--titlebar-bg` |
| `window.titleBar.symbolColor` | `#f4f4f6` | `--titlebar-symbol` |
| `window.titleBar.border` | `rgba(255,255,255,0.08)` | `--titlebar-border` |
| `surfaces.panel.background` | `rgba(255,255,255,0.04)` | `--surface-panel-bg` |
| `surfaces.panel.blur` | `18px` | `--surface-panel-blur` |
| `surfaces.panel.border` | `rgba(255,255,255,0.08)` | `--surface-panel-border` |
| `surfaces.panel.radius` | `16px` | `--surface-panel-radius` |
| `surfaces.panel.shadow` | `0 24px 60px rgba(0,0,0,0.45)` | `--surface-panel-shadow` |
| `surfaces.menu.background` | `rgba(18,18,21,0.94)` | `--surface-menu-bg` |
| `surfaces.menu.blur` | `18px` | `--surface-menu-blur` |
| `surfaces.menu.border` | `rgba(255,255,255,0.08)` | `--surface-menu-border` |
| `surfaces.menu.radius` | `16px` | `--surface-menu-radius` |
| `surfaces.menu.shadow` | `0 24px 60px rgba(0,0,0,0.55)` | `--surface-menu-shadow` |
| `surfaces.shelf.background` | `rgba(10,10,12,0.55)` | `--surface-shelf-bg` |
| `surfaces.shelf.blur` | `12px` | `--surface-shelf-blur` |
| `surfaces.shelf.border` | `rgba(255,255,255,0.06)` | `--surface-shelf-border` |
| `surfaces.shelf.radius` | `20px` | `--surface-shelf-radius` |
| `surfaces.shelf.shadow` | `0 18px 48px rgba(0,0,0,0.4)` | `--surface-shelf-shadow` |
| `surfaces.toast.background` | `rgba(28,28,32,0.96)` | `--surface-toast-bg` |
| `surfaces.toast.blur` | `10px` | `--surface-toast-blur` |
| `surfaces.toast.border` | `rgba(255,255,255,0.08)` | `--surface-toast-border` |
| `surfaces.toast.radius` | `12px` | `--surface-toast-radius` |
| `surfaces.toast.shadow` | `0 12px 32px rgba(0,0,0,0.45)` | `--surface-toast-shadow` |
| `surfaces.dialog.background` | `rgba(16,16,19,0.97)` | `--surface-dialog-bg` |
| `surfaces.dialog.blur` | `20px` | `--surface-dialog-blur` |
| `surfaces.dialog.border` | `rgba(255,255,255,0.08)` | `--surface-dialog-border` |
| `surfaces.dialog.radius` | `18px` | `--surface-dialog-radius` |
| `surfaces.dialog.shadow` | `0 32px 80px rgba(0,0,0,0.6)` | `--surface-dialog-shadow` |
| `components.button.background` | `rgba(255,255,255,0.06)` | `--button-bg` |
| `components.button.hover` | `rgba(255,255,255,0.12)` | `--button-hover` |
| `components.button.text` | `#f4f4f6` | `--button-text` |
| `components.button.radius` | `10px` | `--button-radius` |
| `components.card.background` | `rgba(255,255,255,0.04)` | `--card-bg` |
| `components.card.border` | `rgba(255,255,255,0.08)` | `--card-border` |
| `components.card.radius` | `16px` | `--card-radius` |
| `components.card.shadow` | `0 24px 60px rgba(0,0,0,0.45)` | `--card-shadow` |
| `components.input.background` | `rgba(255,255,255,0.05)` | `--input-bg` |
| `components.input.border` | `rgba(255,255,255,0.1)` | `--input-border` |
| `components.input.radius` | `10px` | `--input-radius` |
| `components.scrollbar.thumb` | `rgba(255,255,255,0.18)` | `--scrollbar-thumb` |
| `components.scrollbar.track` | `transparent` | `--scrollbar-track` |
| `components.focusRing.color` | `rgba(255,255,255,0.6)` | `--focus-ring` |
| `components.focusRing.width` | `2px` | `--focus-ring-width` |
| `motion.easing` | `cubic-bezier(0.2, 0.75, 0.25, 1)` | `--ease` |
| `motion.fast` | `120ms` | `--motion-fast` |
| `motion.normal` | `240ms` | `--motion-normal` |
| `motion.slow` | `420ms` | `--motion-slow` |
| `motion.parallax` | `1` | `--theme-motion-parallax` |

Additional derived values:

- `--theme-bg-gradient` is built from `background.gradient` when `background.type` is `gradient`.
- `--font-ui`, `--font-display`, `--font-mono` combine `fonts.*.family` with its `fallback` list.
- `window.titleBar.*` is applied to Electron's native overlay (colors + height), not CSS.

## 4. Field notes

### colors
Semantic colors. `bg`/`ink` are the page background and primary text. `accent` is
used for selection/focus highlights; `accentInk` is text drawn on the accent.
`muted`/`hair` are secondary text and 1px separators. Surface colors are also
available per component under `surfaces` and `components`; the `colors.panel*`
values are fallbacks.

### fonts / typography
`fonts` declares families; `typography` assigns them to roles. Font files are
loaded by the renderer via the pack's asset URLs. If a file is omitted, the
family must be installed on the user's system (or the fallback is used).

### background
- `solid`: uses `color`
- `gradient`: uses `gradient` (2–4 CSS colors, rendered as a 160° linear gradient)
- `image`: uses `image`, `fit`, `dim`, `blur`
- `grain` adds the film-grain overlay (0–1); `parallax` scales pointer parallax (0–2)

### window
Native title bar overlay: height 24–64 px, background/symbol colors, border color
(CSS variable for the divider). `roundedCorners` is a hint for future Windows 11
theming.

### surfaces / components
Each surface owns background, blur, border, radius and shadow. Components define
the shared button/card/input/scrollbar/focus-ring look. Keep contrast readable:
text must remain legible on every surface.

### motion
`easing` is a CSS timing function; `fast/normal/slow` are CSS durations;
`parallax` is the multiplier for pointer-driven movement.

## 5. Example (minimal, valid)

```json
{
  "schemaVersion": 1,
  "id": "example-dark",
  "name": "Example Dark",
  "version": "1.0.0",
  "colors": {
    "bg": "#0a0a0c", "ink": "#f2f2f5", "muted": "rgba(255,255,255,0.45)",
    "hair": "rgba(255,255,255,0.08)", "accent": "#7aa2ff",
    "accentInk": "#08101f", "danger": "#ff5a5a", "success": "#61d095",
    "warning": "#f5c451", "overlay": "rgba(0,0,0,0.55)",
    "selection": "rgba(122,162,255,0.25)", "panel": "rgba(255,255,255,0.04)",
    "panelStrong": "rgba(255,255,255,0.06)", "menu": "rgba(18,18,21,0.94)",
    "shelf": "rgba(10,10,12,0.55)", "toast": "rgba(28,28,32,0.96)",
    "dialog": "rgba(16,16,19,0.97)"
  },
  "fonts": {
    "ui": { "family": "Nunito", "fallback": ["Microsoft YaHei UI", "system-ui", "sans-serif"] },
    "display": { "family": "Nunito", "fallback": ["Microsoft YaHei UI", "system-ui", "sans-serif"] },
    "mono": { "family": "Cascadia Mono", "fallback": ["Consolas", "monospace"] }
  },
  "typography": {
    "body": { "font": "ui", "size": "15px", "weight": 500, "lineHeight": 1.4, "letterSpacing": "0" },
    "title": { "font": "display", "size": "20px", "weight": 700, "lineHeight": 1.2, "letterSpacing": "0" },
    "h1": { "font": "display", "size": "28px", "weight": 800, "lineHeight": 1.1, "letterSpacing": "0" },
    "label": { "font": "ui", "size": "11px", "weight": 700, "lineHeight": 1.2, "letterSpacing": "0.08em" }
  },
  "shape": { "radiusSmall": "10px", "radius": "16px", "radiusLarge": "24px", "borderWidth": "1px" },
  "effects": { "panelBlur": "18px", "photoBlur": "4.5px", "grain": 0.5, "shadow": "0 24px 60px rgba(0,0,0,0.45)", "glow": "0 0 24px rgba(255,255,255,0.08)" },
  "background": { "type": "solid", "color": "#0a0a0c", "fit": "cover", "dim": 0, "blur": "0px", "grain": 0.4, "parallax": 1 },
  "window": { "titleBar": { "height": 38, "background": "#0a0a0c", "symbolColor": "#f2f2f5", "border": "rgba(255,255,255,0.08)" }, "roundedCorners": false },
  "surfaces": {
    "panel": { "background": "rgba(255,255,255,0.04)", "blur": "18px", "border": "rgba(255,255,255,0.08)", "radius": "16px", "shadow": "0 24px 60px rgba(0,0,0,0.45)" },
    "menu": { "background": "rgba(18,18,21,0.94)", "blur": "18px", "border": "rgba(255,255,255,0.08)", "radius": "16px", "shadow": "0 24px 60px rgba(0,0,0,0.55)" },
    "shelf": { "background": "rgba(10,10,12,0.55)", "blur": "12px", "border": "rgba(255,255,255,0.06)", "radius": "20px", "shadow": "0 18px 48px rgba(0,0,0,0.4)" },
    "toast": { "background": "rgba(28,28,32,0.96)", "blur": "10px", "border": "rgba(255,255,255,0.08)", "radius": "12px", "shadow": "0 12px 32px rgba(0,0,0,0.45)" },
    "dialog": { "background": "rgba(16,16,19,0.97)", "blur": "20px", "border": "rgba(255,255,255,0.08)", "radius": "18px", "shadow": "0 32px 80px rgba(0,0,0,0.6)" }
  },
  "components": {
    "button": { "background": "rgba(255,255,255,0.06)", "hover": "rgba(255,255,255,0.12)", "text": "#f2f2f5", "radius": "10px" },
    "card": { "background": "rgba(255,255,255,0.04)", "border": "rgba(255,255,255,0.08)", "radius": "16px", "shadow": "0 24px 60px rgba(0,0,0,0.45)" },
    "input": { "background": "rgba(255,255,255,0.05)", "border": "rgba(255,255,255,0.1)", "radius": "10px" },
    "scrollbar": { "thumb": "rgba(255,255,255,0.18)", "track": "transparent" },
    "focusRing": { "color": "rgba(255,255,255,0.6)", "width": "2px" }
  },
  "motion": { "easing": "cubic-bezier(0.2,0.75,0.25,1)", "fast": "120ms", "normal": "240ms", "slow": "420ms", "parallax": 1 }
}
```

## 6. AI prompt template

Copy this block into any capable AI, append the user's brief, then validate the
result with `tools/validate-theme.mjs`.

> You are a Nest theme generator. Output **only** a single JSON object, no
> markdown fences, no commentary. It must validate against the Nest theme pack
> schema v1:
>
> - Required top-level keys: `schemaVersion` (1), `id`, `name`, `version`,
>   `colors`, `fonts`, `typography`, `shape`, `effects`, `background`,
>   `window`, `surfaces`, `components`, `motion`.
> - `id`: lowercase letters/digits/hyphens, 2–49 chars.
> - Colors are CSS color strings (hex or rgba). Keep text/surface contrast
>   readable (WCAG-ish: prefer ≥ 4.5:1 for body text).
> - `fonts.*`: { family, fallback[] } — only reference font files if the user
>   supplies them; otherwise use families likely installed on Windows.
> - `typography`: body/title/h1/label with font (ui|display|mono), size (px),
>   weight 100–900, lineHeight 0.8–3, letterSpacing.
> - `background`: type solid|gradient|image; solid needs color; gradient needs
>   2–4 colors; image needs a relative path inside the pack.
> - `window.titleBar`: height 24–64, background, symbolColor, border.
> - `surfaces`: panel/menu/shelf/toast/dialog, each with background, blur,
>   border, radius, shadow.
> - `components`: button, card, input, scrollbar, focusRing exactly as in the
>   schema.
> - `motion`: easing (CSS timing function), fast/normal/slow (durations),
>   parallax 0–2.
> - Do not add unknown keys, CSS, JS, or layout properties.
>
> Theme brief: <describe the look here>. Return the JSON now.

## 7. Roadmap

- **P0/P1 (landed)**: schema, default pack, validator, loader + CSS-variable
  apply, window title bar apply, Settings → Nest → 外观主题 (list/preview/apply),
  zip import, font/image asset loading (data URLs), user override of built-ins.
- **P2**: video backgrounds, per-system variants, theme-scoped cover treatment,
  live reload while editing a pack.
