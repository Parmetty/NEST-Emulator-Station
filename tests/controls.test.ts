import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  applyEngineControls,
  isControlsSupported,
} from '../src/main/controls';
import { applyAzaharControls, readAzaharControls } from '../src/main/controls/azahar';
import { applyDolphinControls, readDolphinControls } from '../src/main/controls/dolphin';
import {
  codeToDolphinName,
  codeToQtKey,
  aresAssignmentToCode,
  codeToAresAssignment,
  DEFAULT_KEYBOARD,
  defaultBindings,
  dolphinNameToCode,
  qtToCode,
} from '../src/main/controls/keymap';
import { applyAresControls, readAresControls } from '../src/main/controls/ares';
import { applyMelondsControls, readMelondsControls } from '../src/main/controls/melonds';
import { applyMgbaControls, readMgbaControls } from '../src/main/controls/mgba';

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('keymap', () => {
  it('maps KeyboardEvent.code to Qt key integers', () => {
    expect(codeToQtKey('KeyA')).toBe(65);
    expect(codeToQtKey('KeyW')).toBe(87);
    expect(codeToQtKey('Digit1')).toBe(49);
    expect(codeToQtKey('Space')).toBe(32);
    expect(codeToQtKey('Enter')).toBe(16777220);
    expect(codeToQtKey('ShiftRight')).toBe(16777248);
    expect(codeToQtKey('ArrowUp')).toBe(16777235);
    expect(codeToQtKey('ArrowDown')).toBe(16777237);
    expect(codeToQtKey('ArrowLeft')).toBe(16777234);
    expect(codeToQtKey('ArrowRight')).toBe(16777236);
    expect(codeToQtKey('Backspace')).toBe(16777219);
    expect(codeToQtKey('F1')).toBe(16777264);
    expect(codeToQtKey('F12')).toBe(16777275);
    expect(codeToQtKey('Numpad1')).toBeNull();
  });

  it('maps Qt key integers back to KeyboardEvent.code', () => {
    expect(qtToCode(32)).toBe('Space');
    expect(qtToCode(65)).toBe('KeyA');
    expect(qtToCode(16777220)).toBe('Enter');
    expect(qtToCode(16777248)).toBe('ShiftRight');
    expect(qtToCode(16777235)).toBe('ArrowUp');
    expect(qtToCode(16777264)).toBe('F1');
    expect(qtToCode(999)).toBeNull();
  });

  it('maps Dolphin / DirectInput names', () => {
    expect(codeToDolphinName('KeyW')).toBe('W');
    expect(codeToDolphinName('Digit1')).toBe('1');
    expect(codeToDolphinName('Space')).toBe('SPACE');
    expect(codeToDolphinName('Enter')).toBe('RETURN');
    expect(codeToDolphinName('ShiftRight')).toBe('SHIFT');
    expect(codeToDolphinName('ArrowUp')).toBe('UP');
    expect(codeToDolphinName('Backspace')).toBe('BACK');
    expect(codeToDolphinName('Unknown')).toBeNull();
    expect(dolphinNameToCode('UP')).toBe('ArrowUp');
    expect(dolphinNameToCode('Space')).toBe('Space');
    expect(dolphinNameToCode('NOPE')).toBeNull();
  });

  it('exposes console-style defaults per engine', () => {
    expect(defaultBindings('mgba')).toMatchObject({ a: 'Space', b: 'KeyJ', start: 'Enter' });
    expect(defaultBindings('dolphin')).toMatchObject({ a: 'Space', up: 'KeyW', l: 'KeyQ' });
    expect(defaultBindings('azahar')).toMatchObject({ a: 'Space', select: 'Backspace', up: 'ArrowUp' });
    expect(defaultBindings('melonds')).toMatchObject({ x: 'KeyK', y: 'KeyL', up: 'ArrowUp' });
    expect(defaultBindings('ares')).toMatchObject({
      up: 'KeyW',
      down: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      a: 'KeyJ',
      b: 'KeyK',
      x: 'KeyU',
      y: 'KeyI',
      l: 'KeyQ',
      r: 'KeyE',
      start: 'Enter',
      select: 'ShiftRight',
    });
    expect(defaultBindings('nope')).toEqual({});
  });

  it('encodes ares assignments (device 0x1, Windows virtual-key codes)', () => {
    expect(codeToAresAssignment('KeyW')).toBe('0x1/0/57;;');
    expect(codeToAresAssignment('KeyJ')).toBe('0x1/0/44;;');
    expect(codeToAresAssignment('Enter')).toBe('0x1/0/91;;');
    expect(codeToAresAssignment('ShiftRight')).toBe('0x1/0/94;;');
    expect(codeToAresAssignment('Space')).toBe('0x1/0/92;;');
    expect(codeToAresAssignment('ArrowUp')).toBe('0x1/0/86;;');
    expect(codeToAresAssignment('Unknown')).toBeNull();
    expect(aresAssignmentToCode('0x1/0/57;;')).toBe('KeyW');
    expect(aresAssignmentToCode('0x1/0/94;;')).toBe('ShiftRight');
    expect(aresAssignmentToCode('0x1/0/35;;')).toBe('KeyA');
    expect(aresAssignmentToCode('0x1/0/91;;')).toBe('Enter');
    expect(aresAssignmentToCode(';;')).toBeNull();
    expect(aresAssignmentToCode('garbage')).toBeNull();
  });

  it('marks every adapter engine as supported', () => {
    for (const engineId of ['mgba', 'ares', 'dolphin', 'azahar', 'melonds']) {
      expect(isControlsSupported(engineId)).toBe(true);
    }
    expect(isControlsSupported('nope')).toBe(false);
  });
});

describe('mGBA adapter', () => {
  const STOCK = [
    '[gba.input.SDLB]',
    'keyA=-1',
    'keyB=-1',
    'keyUp=-1',
    '',
    '[gba.input.QT_K]',
    'keyA=88',
    'keyB=90',
    'keyL=65',
    'keyR=83',
    'keyStart=16777220',
    'keySelect=16777219',
    'keyUp=16777235',
    'keyDown=16777237',
    'keyLeft=16777234',
    'keyRight=16777236',
    '',
    '[ports.qt]',
    'fullscreen=0',
    '',
  ].join('\n');

  it('seeds our layout over the stock config and backs it up', async () => {
    const dir = await tempDir('nest-mgba-');
    try {
      await writeFile(path.join(dir, 'config.ini'), STOCK);
      const result = applyMgbaControls(dir, { ...DEFAULT_KEYBOARD.mgba }, false);
      expect(result.applied).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(existsSync(path.join(dir, 'config.ini.before-nest'))).toBe(true);
      expect(existsSync(path.join(dir, '.nest-controls-v1'))).toBe(true);

      const text = await readFile(path.join(dir, 'config.ini'), 'utf8');
      expect(text).toContain('keyA=32');
      expect(text).toContain('keyB=74');
      expect(text).toContain('keySelect=16777219');
      expect(text).toContain('keyUp=16777235');
      // The empty SDL pad block is filled in too.
      expect(text).toContain('keyA=0');
      expect(text).toContain('keyStart=6');
      // Unrelated sections survive.
      expect(text).toContain('[ports.qt]');

      expect(readMgbaControls(dir)).toMatchObject({
        a: 'Space',
        b: 'KeyJ',
        l: 'KeyQ',
        r: 'KeyE',
        start: 'Enter',
        select: 'Backspace',
        up: 'ArrowUp',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('never overwrites a layout the player customised', async () => {
    const dir = await tempDir('nest-mgba-custom-');
    try {
      const custom = STOCK.replace('keyA=88', 'keyA=99');
      await writeFile(path.join(dir, 'config.ini'), custom);
      const result = applyMgbaControls(dir, { ...DEFAULT_KEYBOARD.mgba }, false);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('custom');
      expect(await readFile(path.join(dir, 'config.ini'), 'utf8')).toBe(custom);
      expect(existsSync(path.join(dir, 'config.ini.before-nest'))).toBe(false);
      expect(await readFile(path.join(dir, '.nest-controls-v1'), 'utf8')).toContain('kept-user-config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('force rewrites the layout but keeps the first backup', async () => {
    const dir = await tempDir('nest-mgba-force-');
    try {
      await writeFile(path.join(dir, 'config.ini'), STOCK);
      applyMgbaControls(dir, { ...DEFAULT_KEYBOARD.mgba }, false);
      const backup = await readFile(path.join(dir, 'config.ini.before-nest'), 'utf8');

      const forced = applyMgbaControls(dir, { ...DEFAULT_KEYBOARD.mgba, a: 'KeyZ' }, true);
      expect(forced.applied).toBe(true);
      expect(await readFile(path.join(dir, 'config.ini'), 'utf8')).toContain('keyA=90');
      expect(await readFile(path.join(dir, 'config.ini.before-nest'), 'utf8')).toBe(backup);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('melonDS adapter', () => {
  function stockToml(): string {
    return [
      'PauseLostFocus = false',
      '',
      '[Instance0]',
      'EnableCheats = false',
      '',
      '[Instance0.Keyboard]',
      'A = -1',
      'B = -1',
      'X = -1',
      'Y = -1',
      'L = -1',
      'R = -1',
      'Start = -1',
      'Select = -1',
      'Up = -1',
      'Down = -1',
      'Left = -1',
      'Right = -1',
      'HK_Pause = -1',
      '',
      '[Screen]',
      'UseGL = false',
      '',
    ].join('\n');
  }

  it('writes the handheld layout into [Instance0.Keyboard]', async () => {
    const dir = await tempDir('nest-melonds-');
    try {
      await writeFile(path.join(dir, 'melonDS.toml'), stockToml());
      const result = applyMelondsControls(dir, { ...DEFAULT_KEYBOARD.melonds }, false);
      expect(result.applied).toBe(true);
      expect(existsSync(path.join(dir, 'melonDS.toml.before-nest'))).toBe(true);

      const text = await readFile(path.join(dir, 'melonDS.toml'), 'utf8');
      expect(text).toContain('A = 32');
      expect(text).toContain('B = 74');
      expect(text).toContain('X = 75');
      expect(text).toContain('Y = 76');
      expect(text).toContain('Select = 16777219');
      expect(text).toContain('Up = 16777235');
      // Existing keys and other sections stay where they were.
      expect(text).toContain('HK_Pause = -1');
      expect(text).toContain('[Screen]');

      expect(readMelondsControls(dir)).toMatchObject({
        a: 'Space',
        x: 'KeyK',
        start: 'Enter',
        select: 'Backspace',
        up: 'ArrowUp',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps a custom melonDS layout when force is false', async () => {
    const dir = await tempDir('nest-melonds-custom-');
    try {
      const custom = stockToml().replace('A = -1', 'A = 88');
      await writeFile(path.join(dir, 'melonDS.toml'), custom);
      const result = applyMelondsControls(dir, { ...DEFAULT_KEYBOARD.melonds }, false);
      expect(result.applied).toBe(false);
      expect(await readFile(path.join(dir, 'melonDS.toml'), 'utf8')).toBe(custom);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Dolphin adapter', () => {
  it('writes GCPadNew.ini with Dolphin backtick names', async () => {
    const dir = await tempDir('nest-dolphin-');
    try {
      const result = applyDolphinControls(dir, { ...DEFAULT_KEYBOARD.dolphin }, true);
      expect(result.applied).toBe(true);
      const text = await readFile(path.join(dir, 'GCPadNew.ini'), 'utf8');
      expect(text).toContain('Buttons/A = `SPACE`');
      expect(text).toContain('Buttons/B = `J`');
      expect(text).toContain('Main Stick/Up = `W`');
      expect(text).toContain('Main Stick/Left = `A`');
      expect(text).toContain('Triggers/L = `Q`');
      expect(text).toContain('Buttons/Start = `RETURN`');
      // Fixed GC-only bindings survive the rewrite.
      expect(text).toContain('Buttons/Z = `U`');
      expect(text).toContain('C-Stick/Up = `T`');
      expect(existsSync(path.join(dir, '.nest-controls-v1'))).toBe(true);

      expect(readDolphinControls(dir)).toMatchObject({
        a: 'Space',
        b: 'KeyJ',
        x: 'KeyK',
        y: 'KeyL',
        l: 'KeyQ',
        r: 'KeyE',
        start: 'Enter',
        up: 'KeyW',
        down: 'KeyS',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('Azahar adapter', () => {
  it('writes qt-config.ini keyboard codes', async () => {
    const root = await tempDir('nest-azahar-');
    try {
      const result = applyAzaharControls(root, { ...DEFAULT_KEYBOARD.azahar }, 0, true);
      expect(result.applied).toBe(true);
      const file = path.join(root, 'AppData', 'Roaming', 'Azahar', 'config', 'qt-config.ini');
      const text = await readFile(file, 'utf8');
      expect(text).toContain('profiles\\1\\button_a="code:32,engine:keyboard"');
      expect(text).toContain('profiles\\1\\button_x="code:75,engine:keyboard"');
      expect(text).toContain('profiles\\1\\button_select="code:16777219,engine:keyboard"');
      expect(text).toContain('profiles\\1\\button_up="code:16777235,engine:keyboard"');
      // Analog sticks stay on their existing WASD/TGFH defaults.
      expect(text).toContain('profiles\\1\\circle_pad=');
      expect(text).toContain('profiles\\1\\button_zl="code:49,engine:keyboard"');

      expect(readAzaharControls(root)).toMatchObject({
        a: 'Space',
        x: 'KeyK',
        select: 'Backspace',
        up: 'ArrowUp',
        right: 'ArrowRight',
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('ares adapter', () => {
  function fixture(): string {
    return [
      'Video',
      '  WindowWidth: 800',
      '',
      'Nintendo64',
      '  ExpansionPak: true',
      '  Input',
      '    Controller.Port.1',
      '      Gamepad',
      '        Up: ;;',
      '        Down: ;;',
      '        Left: ;;',
      '        Right: ;;',
      '        B: ;;',
      '        A: ;;',
      '        L: ;;',
      '        R: ;;',
      '        Z: ;;',
      '        Start: ;;',
      '      Mouse',
      '        X: ;;',
      'Path',
      'Famicom',
      '  Input',
      '    Controller.Port.1',
      '      Gamepad',
      '        Up: ;;',
      '        Down: ;;',
      '        Left: ;;',
      '        Right: ;;',
      '        B: ;;',
      '        A: ;;',
      '        Select: ;;',
      '        Start: ;;',
      '        Microphone: ;;',
      '      Zapper',
      '        X: ;;',
      'Path',
      'SuperFamicom',
      '  Input',
      '    Controller.Port.1',
      '      Gamepad',
      '        Up: ;;',
      '        Down: ;;',
      '        Left: ;;',
      '        Right: ;;',
      '        B: ;;',
      '        A: ;;',
      '        Y: ;;',
      '        X: ;;',
      '        L: ;;',
      '        R: ;;',
      '        Select: ;;',
      '        Start: ;;',
      'Path',
      'FamicomDiskSystem',
      '  Input',
      '    Controller.Port.1',
      '      Gamepad',
      '        Up: ;;',
      '        Down: ;;',
      '        Left: ;;',
      '        Right: ;;',
      '        B: ;;',
      '        A: ;;',
      '        Select: ;;',
      '        Start: ;;',
      'Path',
      '',
    ].join('\n');
  }

  it('writes ares BML assignments for FC / SFC / N64', async () => {
    const dir = await tempDir('nest-ares-');
    try {
      await writeFile(path.join(dir, 'settings.bml'), fixture());
      const result = applyAresControls(dir, { ...DEFAULT_KEYBOARD.ares }, false);
      expect(result.applied).toBe(true);
      expect(existsSync(path.join(dir, 'settings.bml.before-nest'))).toBe(true);
      expect(await readFile(path.join(dir, '.nest-controls-v1'), 'utf8')).toContain('applied-v1');

      const text = await readFile(path.join(dir, 'settings.bml'), 'utf8');
      // Famicom / FDS (same key set)
      expect(text).toContain('Up: 0x1/0/57;;');
      expect(text).toContain('Down: 0x1/0/53;;');
      expect(text).toContain('Left: 0x1/0/35;;');
      expect(text).toContain('Right: 0x1/0/38;;');
      expect(text).toContain('A: 0x1/0/44;;');
      expect(text).toContain('B: 0x1/0/45;;');
      expect(text).toContain('Start: 0x1/0/91;;');
      expect(text).toContain('Select: 0x1/0/94;;');
      // SFC-only buttons
      expect(text).toContain('Y: 0x1/0/43;;');
      expect(text).toContain('X: 0x1/0/55;;');
      expect(text).toContain('L: 0x1/0/51;;');
      expect(text).toContain('R: 0x1/0/39;;');
      // N64 fixed Z
      expect(text).toContain('Z: 0x1/0/92;;');
      // Untouched nodes survive
      expect(text).toContain('WindowWidth: 800');
      expect(text).toContain('Microphone: ;;');
      expect(text).toContain('        X: ;;');

      expect(readAresControls(dir)).toMatchObject({
        up: 'KeyW',
        down: 'KeyS',
        left: 'KeyA',
        right: 'KeyD',
        a: 'KeyJ',
        b: 'KeyK',
        x: 'KeyU',
        y: 'KeyI',
        l: 'KeyQ',
        r: 'KeyE',
        start: 'Enter',
        select: 'ShiftRight',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps a hand-made ares binding when force is false', async () => {
    const dir = await tempDir('nest-ares-custom-');
    try {
      const custom = fixture().replace(
        '        Up: ;;',
        '        Up: 0x1/0/51;;',
      );
      await writeFile(path.join(dir, 'settings.bml'), custom);
      const result = applyAresControls(dir, { ...DEFAULT_KEYBOARD.ares }, false);
      expect(result.applied).toBe(false);
      expect(result.reason).toBe('custom');
      expect(await readFile(path.join(dir, 'settings.bml'), 'utf8')).toBe(custom);
      expect(await readFile(path.join(dir, '.nest-controls-v1'), 'utf8')).toContain('kept-user-config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('force rewrites custom ares bindings', async () => {
    const dir = await tempDir('nest-ares-force-');
    try {
      await writeFile(
        path.join(dir, 'settings.bml'),
        fixture().replace('        Up: ;;', '        Up: 0x1/0/51;;'),
      );
      const result = applyAresControls(
        dir,
        { ...DEFAULT_KEYBOARD.ares, up: 'ArrowUp' },
        true,
      );
      expect(result.applied).toBe(true);
      expect(await readFile(path.join(dir, 'settings.bml'), 'utf8')).toContain('Up: 0x1/0/86;;');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('edits the real bundled settings.bml in place without touching other nodes', async () => {
    const real = await readFile(
      path.join(__dirname, '..', 'resources', 'engines', 'ares', 'settings.bml'),
      'utf8',
    );
    const dir = await tempDir('nest-ares-real-');
    try {
      await writeFile(path.join(dir, 'settings.bml'), real);
      const result = applyAresControls(dir, { ...DEFAULT_KEYBOARD.ares }, true);
      expect(result.applied).toBe(true);

      const text = await readFile(path.join(dir, 'settings.bml'), 'utf8');
      // In-place edit: no lines added or removed.
      expect(text.split('\n').length).toBe(real.split('\n').length);
      expect(text).toContain('Up: 0x1/0/57;;');
      expect(text).toContain('ShowStatusBar: false');
      expect(text).not.toContain('Microphone: 0x1');
      // Untouched neighbouring systems keep their empty bindings.
      expect(text).toContain('Dendy');
      expect(text).toContain('ZXSpectrum');
      // Read-back merges FC + SFC into one action map.
      expect(readAresControls(dir)).toMatchObject({ a: 'KeyJ', x: 'KeyU', select: 'ShiftRight' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('controls facade', () => {
  it('treats a missing ares settings.bml as write-nothing', async () => {
    const root = await tempDir('nest-controls-');
    try {
      const result = applyEngineControls('ares', { enginesDir: root, userData: root }, {}, false);
      expect(result.supported).toBe(true);
      expect(result.applied).toBe(false);
      expect(existsSync(path.join(root, 'ares', 'settings.bml'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('routes mgba to <enginesDir>/mgba/config.ini', async () => {
    const root = await tempDir('nest-controls-route-');
    try {
      const engineDir = path.join(root, 'mgba');
      await mkdir(engineDir, { recursive: true });
      await writeFile(
        path.join(engineDir, 'config.ini'),
        ['[gba.input.QT_K]', 'keyA=88', 'keyB=90', ''].join('\n'),
      );
      const result = applyEngineControls(
        'mgba',
        { enginesDir: root, userData: root },
        { ...DEFAULT_KEYBOARD.mgba },
        false,
      );
      expect(result.supported).toBe(true);
      expect(result.applied).toBe(true);
      expect(await readFile(path.join(engineDir, 'config.ini'), 'utf8')).toContain('keyA=32');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
