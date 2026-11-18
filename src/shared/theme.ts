import { z } from 'zod';

/**
 * Nest theme pack v1.
 *
 * A theme is pure data: JSON plus optional fonts/images. It never ships CSS or
 * JavaScript. The renderer maps these tokens onto CSS variables, the main
 * process maps the window block onto Electron's title bar, and layout stays
 * owned by Nest.
 */

const cssColor = z.string().min(3).max(80);
const cssSize = z.string().min(1).max(16);
const fontFile = z
  .object({
    src: z.string().min(1).max(200),
    weight: z.string().max(20).optional(),
    style: z.enum(['normal', 'italic']).optional(),
  })
  .strict();

const fontDef = z
  .object({
    family: z.string().min(1).max(80),
    fallback: z.array(z.string().max(80)).max(8).optional(),
    files: z.array(fontFile).max(8).optional(),
  })
  .strict();

const typeRole = z
  .object({
    font: z.enum(['ui', 'display', 'mono']).optional(),
    size: cssSize,
    weight: z.number().int().min(100).max(900),
    lineHeight: z.number().min(0.8).max(3),
    letterSpacing: cssSize,
  })
  .strict();

const surface = z
  .object({
    background: cssColor,
    blur: cssSize,
    border: cssColor,
    radius: cssSize,
    shadow: z.string().max(160),
  })
  .strict();

export const themeSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,48}$/),
    name: z.string().min(1).max(60),
    version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+/),
    author: z.string().max(80).optional(),
    description: z.string().max(400).optional(),
    license: z.string().max(80).optional(),
    preview: z.string().max(260).optional(),
    colors: z
      .object({
        bg: cssColor,
        ink: cssColor,
        muted: cssColor,
        hair: cssColor,
        accent: cssColor,
        accentInk: cssColor,
        danger: cssColor,
        success: cssColor,
        warning: cssColor,
        overlay: cssColor,
        selection: cssColor,
        panel: cssColor,
        panelStrong: cssColor,
        menu: cssColor,
        shelf: cssColor,
        toast: cssColor,
        dialog: cssColor,
      })
      .strict(),
    fonts: z.object({ ui: fontDef, display: fontDef, mono: fontDef }).strict(),
    typography: z.object({ body: typeRole, title: typeRole, h1: typeRole, label: typeRole }).strict(),
    shape: z
      .object({ radiusSmall: cssSize, radius: cssSize, radiusLarge: cssSize, borderWidth: cssSize })
      .strict(),
    effects: z
      .object({
        panelBlur: cssSize,
        photoBlur: cssSize,
        grain: z.number().min(0).max(1),
        shadow: z.string().max(160),
        glow: z.string().max(160),
      })
      .strict(),
    background: z
      .object({
        type: z.enum(['solid', 'gradient', 'image']),
        color: cssColor.optional(),
        gradient: z.array(cssColor).min(2).max(4).optional(),
        image: z.string().max(200).optional(),
        fit: z.enum(['cover', 'contain', 'fill']),
        dim: z.number().min(0).max(1),
        blur: cssSize,
        grain: z.number().min(0).max(1),
        parallax: z.number().min(0).max(2),
      })
      .strict(),
    window: z
      .object({
        titleBar: z
          .object({
            height: z.number().int().min(24).max(64),
            background: cssColor,
            symbolColor: cssColor,
            border: cssColor,
          })
          .strict(),
        roundedCorners: z.boolean(),
      })
      .strict(),
    surfaces: z
      .object({ panel: surface, menu: surface, shelf: surface, toast: surface, dialog: surface })
      .strict(),
    components: z
      .object({
        button: z
          .object({ background: cssColor, hover: cssColor, text: cssColor, radius: cssSize })
          .strict(),
        card: z
          .object({ background: cssColor, border: cssColor, radius: cssSize, shadow: z.string().max(160) })
          .strict(),
        input: z.object({ background: cssColor, border: cssColor, radius: cssSize }).strict(),
        scrollbar: z.object({ thumb: cssColor, track: cssColor }).strict(),
        focusRing: z.object({ color: cssColor, width: cssSize }).strict(),
      })
      .strict(),
    motion: z
      .object({
        easing: z.string().max(80),
        fast: cssSize,
        normal: cssSize,
        slow: cssSize,
        parallax: z.number().min(0).max(2),
      })
      .strict(),
    assets: z.object({ logo: z.string().max(200).optional() }).strict().optional(),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;

/** Flat token path -> CSS custom property. Keep this table in sync with docs/themes/THEME-PACK.md. */
export const THEME_CSS_VARS: Record<string, string> = {
  'colors.bg': '--bg',
  'colors.ink': '--ink',
  'colors.muted': '--muted',
  'colors.hair': '--hair',
  'colors.accent': '--theme-accent',
  'colors.accentInk': '--theme-accent-ink',
  'colors.danger': '--theme-danger',
  'colors.success': '--theme-success',
  'colors.warning': '--theme-warning',
  'colors.overlay': '--theme-overlay',
  'colors.selection': '--theme-selection',
  'colors.panel': '--theme-panel',
  'colors.panelStrong': '--theme-panel-strong',
  'colors.menu': '--theme-menu',
  'colors.shelf': '--theme-shelf',
  'colors.toast': '--theme-toast',
  'colors.dialog': '--theme-dialog',

  'typography.body.size': '--type-body-size',
  'typography.body.weight': '--type-body-weight',
  'typography.body.lineHeight': '--type-body-line',
  'typography.body.letterSpacing': '--type-body-tracking',
  'typography.title.size': '--type-title-size',
  'typography.title.weight': '--type-title-weight',
  'typography.title.lineHeight': '--type-title-line',
  'typography.title.letterSpacing': '--type-title-tracking',
  'typography.h1.size': '--type-h1-size',
  'typography.h1.weight': '--type-h1-weight',
  'typography.h1.lineHeight': '--type-h1-line',
  'typography.h1.letterSpacing': '--type-h1-tracking',
  'typography.label.size': '--type-label-size',
  'typography.label.weight': '--type-label-weight',
  'typography.label.lineHeight': '--type-label-line',
  'typography.label.letterSpacing': '--type-label-tracking',

  'shape.radiusSmall': '--radius-sm',
  'shape.radius': '--radius',
  'shape.radiusLarge': '--radius-lg',
  'shape.borderWidth': '--border-width',

  'effects.panelBlur': '--panel-blur',
  'effects.photoBlur': '--photo-blur',
  'effects.grain': '--grain-opacity',
  'effects.shadow': '--shadow',
  'effects.glow': '--glow',

  'background.type': '--theme-bg-type',
  'background.color': '--theme-bg-color',
  'background.image': '--theme-bg-image',
  'background.fit': '--theme-bg-fit',
  'background.dim': '--theme-bg-dim',
  'background.blur': '--theme-bg-blur',
  'background.grain': '--theme-bg-grain',
  'background.parallax': '--theme-parallax',

  'window.titleBar.height': '--titlebar-height',
  'window.titleBar.background': '--titlebar-bg',
  'window.titleBar.symbolColor': '--titlebar-symbol',
  'window.titleBar.border': '--titlebar-border',

  'surfaces.panel.background': '--surface-panel-bg',
  'surfaces.panel.blur': '--surface-panel-blur',
  'surfaces.panel.border': '--surface-panel-border',
  'surfaces.panel.radius': '--surface-panel-radius',
  'surfaces.panel.shadow': '--surface-panel-shadow',
  'surfaces.menu.background': '--surface-menu-bg',
  'surfaces.menu.blur': '--surface-menu-blur',
  'surfaces.menu.border': '--surface-menu-border',
  'surfaces.menu.radius': '--surface-menu-radius',
  'surfaces.menu.shadow': '--surface-menu-shadow',
  'surfaces.shelf.background': '--surface-shelf-bg',
  'surfaces.shelf.blur': '--surface-shelf-blur',
  'surfaces.shelf.border': '--surface-shelf-border',
  'surfaces.shelf.radius': '--surface-shelf-radius',
  'surfaces.shelf.shadow': '--surface-shelf-shadow',
  'surfaces.toast.background': '--surface-toast-bg',
  'surfaces.toast.blur': '--surface-toast-blur',
  'surfaces.toast.border': '--surface-toast-border',
  'surfaces.toast.radius': '--surface-toast-radius',
  'surfaces.toast.shadow': '--surface-toast-shadow',
  'surfaces.dialog.background': '--surface-dialog-bg',
  'surfaces.dialog.blur': '--surface-dialog-blur',
  'surfaces.dialog.border': '--surface-dialog-border',
  'surfaces.dialog.radius': '--surface-dialog-radius',
  'surfaces.dialog.shadow': '--surface-dialog-shadow',

  'components.button.background': '--button-bg',
  'components.button.hover': '--button-hover',
  'components.button.text': '--button-text',
  'components.button.radius': '--button-radius',
  'components.card.background': '--card-bg',
  'components.card.border': '--card-border',
  'components.card.radius': '--card-radius',
  'components.card.shadow': '--card-shadow',
  'components.input.background': '--input-bg',
  'components.input.border': '--input-border',
  'components.input.radius': '--input-radius',
  'components.scrollbar.thumb': '--scrollbar-thumb',
  'components.scrollbar.track': '--scrollbar-track',
  'components.focusRing.color': '--focus-ring',
  'components.focusRing.width': '--focus-ring-width',

  'motion.easing': '--ease',
  'motion.fast': '--motion-fast',
  'motion.normal': '--motion-normal',
  'motion.slow': '--motion-slow',
  'motion.parallax': '--theme-motion-parallax',
};

function lookup(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, source);
}

function fontStack(font: { family: string; fallback?: string[] }): string {
  const fallback = font.fallback ?? [];
  return [`'${font.family}'`, ...fallback].join(', ');
}

/** Token values as CSS custom properties. Missing optional values are skipped. */
export function themeToCssVars(theme: Theme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, variable] of Object.entries(THEME_CSS_VARS)) {
    const value = lookup(theme, path);
    if (value === undefined || value === null) continue;
    out[variable] = String(value);
  }
  // Font families need their fallback list expanded.
  out['--font-ui'] = fontStack(theme.fonts.ui);
  out['--font-display'] = fontStack(theme.fonts.display);
  out['--font-mono'] = fontStack(theme.fonts.mono);
  if (theme.background.type === 'gradient' && theme.background.gradient?.length) {
    out['--theme-bg-gradient'] = `linear-gradient(160deg, ${theme.background.gradient.join(', ')})`;
  }
  return out;
}

export interface ThemeWindowChrome {
  titleBar: { height: number; background: string; symbolColor: string; border: string };
  roundedCorners: boolean;
}

export function themeWindowChrome(theme: Theme): ThemeWindowChrome {
  return {
    titleBar: { ...theme.window.titleBar },
    roundedCorners: theme.window.roundedCorners,
  };
}

export const DEFAULT_THEME_ID = 'default';
