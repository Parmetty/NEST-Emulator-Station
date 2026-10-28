# GBA（mGBA）使用说明

mGBA 以**便携模式**随包（`resources/engines/mgba/portable.ini`），配置就写在 exe 旁边的 `config.ini`。
Nest 在启动前检查这份配置，必要时写入一套默认键位。

## 1. 默认键位

首次启动时检测 `[gba.input.QT_K]` 是否还是 mGBA 原版（`keyA=88` / `keyB=90`，即 A=X、B=Z、L=A、R=S）：

- 还是原版：备份为 `config.ini.before-nest`，写入下表，并打标记 `.nest-controls-v1`。
- 已经自定义：不覆盖，只写标记。

| GBA 功能 | 按键 |
| --- | --- |
| A | `空格` |
| B | `J` |
| L / R | `Q` / `E` |
| Start | `Enter` |
| Select | `Backspace` |
| 十字键 | 方向键 |

这样和 Dolphin（NGC/Wii）、Azahar（3DS）的 A/B 位置一致：**空格 = 主按键，J = 副按键**。

## 2. 自定义与恢复

- 自定义：在 mGBA 里改「工具 → 设置 → 控制」，Nest 不会覆盖。
- 恢复默认：关闭 mGBA，把 `config.ini.before-nest` 改名回 `config.ini`，删掉 `.nest-controls-v1`，下次启动会重新写入。
- 彻底重置：删掉 `resources/engines/mgba/config.ini`，mGBA 会用内置默认值。

## 3. 注意

- mGBA 的配置在**引擎目录**里。把 Nest 装到 `C:\Program Files` 这类只读目录时写不进去，
  键位改动会在退出时丢失——这是已知问题（见 `docs/RELEASE.md` 的引擎目录可写性）。
- 存档（`.sav`）默认写在 ROM 旁边，不在 Nest 数据目录。
- 抓屏走 `-C screenshotPath=<userData>/shots`，封面由 `nest-capture.exe` 生成。

## 4. 手柄

mGBA 默认只把**左摇杆**和**十字键**绑到手柄，A/B/L/R/Start/Select 是空的（源码 `mSDLInitBindingsGBA()` 里
没有按钮绑定）。所以插上手柄能移动，但按不了键。

Nest 现在会在启动时自动补上按钮绑定：A=0、B=1、L=9、R=10、Start=6、Select=4（SDL 标准按钮号），
**键盘那套保留**，键盘和手柄可以同时用。

- 支持 SDL 能识别的手柄（Xbox、DS4/DS5、Switch Pro、8BitDo 等），换手柄不用重配。
- 若你已经在 mGBA 里改过手柄绑定，Nest 不会覆盖（有 `.nest-controls-v1` 标记）。
- 想回到纯默认：删掉 `resources/engines/mgba/.nest-controls-v1` 和 `config.ini.before-nest` 后重开。
