# Third-party notices

Nest itself is licensed under **MIT** (see `LICENSE`). It redistributes or uses the
following components, each under its own terms — those terms are not overridden by
Nest's license.

## Bundled binaries

### mGBA 0.10.5 — `resources/engines/mgba/`

- Project: https://mgba.io/
- License: **MPL 2.0** (source: https://github.com/mgba-emu/mgba)
- The full license text ships with the bundle: `resources/engines/mgba/LICENSE.txt`,
  plus the licenses of its dependencies under `resources/engines/mgba/licenses/`.
- Redistributed unmodified. If you ship a modified build, MPL 2.0 requires publishing
  the source of the modified files.

### ares v148 — `resources/engines/ares/`

- Project: https://ares-emu.net/ · Source: https://github.com/ares-emulator/ares
- License: **ISC** — full text at `resources/engines/ares/LICENSE.txt`
- One executable covers FC (NES), SFC (SNES) and N64.
- Redistributed unmodified, except two deliberate changes:
  - the bundled `settings.bml` disables the status bar and overscan, so the window
    is exactly the emulated screen (no chrome in cover captures);
  - the unused `Shaders/` directory was removed to cut 63 MB of CRT filter assets.

## Runtime dependencies (installed via npm, not vendored here)

| Package | License |
| --- | --- |
| Electron | MIT |
| React / React DOM | MIT |
| Zod | MIT |
| Vite / electron-vite | MIT |
| Vitest | MIT |

## Artwork

The console photos in `docs/mock-v1/` and `src/renderer/public/consoles/` are
derived from photographs on Wikimedia Commons by **Evan-Amos**, released into the
**public domain**:

| System | Source file |
| --- | --- |
| GBA | `Nintendo-Game-Boy-Advance-Purple-FL.png` |
| FC | `NES-Console-Set.jpg` |
| SFC | `SNES-Model-2-Set.jpg` |
| N64 | `N64-Console-Set.png` |
| NGC | `GameCube-Silver-Optional-Set.jpg` |
| NDS | `Nintendo-DS-Fat-Blue.jpg` |
| Wii | `Wii-Console.png` |
| 3DS | `Nintendo-3DS-AquaOpen.jpg` |
| Wii U | `Nintendo-Wii-U-Console-FL.jpg` |

They are processed (cut out, desaturated, blurred) by `mock/process.py` and are
placeholders: the app lets users replace them with their own photos.

Nintendo, Game Boy, Famicom, GameCube, Wii, Wii U and the respective console designs
are trademarks of Nintendo. Nest is not affiliated with, endorsed by, or sponsored by
Nintendo, Microsoft, or Sony.

## Fonts

Nunito (SIL Open Font License 1.1), embedded in the mock as a base64 data URI and
shipped as `src/renderer/src/assets/nunito.woff2`.

## Nothing here includes game data

This repository contains **no ROMs, BIOS files, NAND dumps, or keys**. Nest only
launches emulators you provide and scans files you already own.
