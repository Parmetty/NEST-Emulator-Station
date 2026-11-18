import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { listThemes, loadTheme } from '../src/main/themes';
import { themeToCssVars, themeSchema, themeWindowChrome } from '../src/shared/theme';

const roots = {
  builtin: path.join(process.cwd(), 'resources', 'themes'),
  user: path.join(os.tmpdir(), 'nest-themes-empty'),
};

describe('theme packs', () => {
  it('loads and validates the default pack', () => {
    const themes = listThemes(roots);
    expect(themes.some((theme) => theme.id === 'default')).toBe(true);
    const theme = loadTheme(roots, 'default');
    expect(theme).not.toBeNull();
    expect(themeSchema.safeParse(theme).success).toBe(true);
    expect(theme!.colors.bg).toBe('#08080a');
  });

  it('maps tokens to CSS variables and window chrome', () => {
    const theme = loadTheme(roots, 'default')!;
    const vars = themeToCssVars(theme);
    expect(vars['--bg']).toBe('#08080a');
    expect(vars['--font-ui']).toContain('Nunito');
    expect(vars['--surface-panel-bg']).toBe(theme.surfaces.panel.background);
    const chrome = themeWindowChrome(theme);
    expect(chrome.titleBar.height).toBe(38);
    expect(chrome.titleBar.background).toBe('#08080a');
  });

  it('falls back to default for an unknown id', () => {
    const theme = loadTheme(roots, 'does-not-exist');
    expect(theme).toBeNull();
  });
});
