# 项目主日志（Nest 编年史）

> 这一份是**贯穿整个项目的里程碑日志**：每次发布、每个较大型的提交组都记一条。
>
> 分工：`CHANGELOG.md` 记「用户可见的变化」，本文件记「项目走到哪一步了」；
> 技术现状看 `STATE.md`，决策理由看 `DECISIONS.md`，逐日进展看 `PROGRESS.md`，发布流程看 `RELEASE-RUNBOOK.md`。

## 时间线速览

| 日期 | 版本 / tag | 阶段 | 一句话 |
|---|---|---|---|
| 2026-10-25 | `v0.2.0-beta.1`（`2d075a5`） | P0–P2 | 首个公开 beta：Electron 外壳、扫描器、GBA/FC/SFC、封面、便携包 |
| 2026-10-30 | `v0.3.2`（`a16a2cb`） | P3 | 引擎矩阵补全：N64/Dolphin/NDS/3DS、系统菜单、键位面板、自动扫描、便携 zip |
| 2026-11-01 | `v0.4.0-beta.1`（`4a7b667`） | P3.5–P4 | 自写 libretro 宿主（Wii 菜单去 UIA）+ Cemu/Wii U 接入（菜单实验性） |
| 2026-11-03 | `v0.4.1-beta.1` | P4.5 | NDS/DSi 整条线可用（机型、DSi Menu、菜单插卡）+ Cemu 键位 + GBA 金手指 + 设置拆分 |

阶段说明：P0 骨架 → P1 库/扫描 → P2 GBA/FC/SFC 闭环 → P3 Dolphin/NDS/3DS +
系统菜单 → P4 Wii U/Cemu → P5 打磨（封面、构建、安装包）。

---

## v0.4.1-beta.1 · 2026-11-03

**主题：NDS/DSi 整条线打通 + 设置重构成御三家结构。** 发布类型：Latest（无预发布标记；版本号仍为 beta，侧栏显示为最新版本）
发布页：https://github.com/Parmetty/NEST-Emulator-Station/releases/tag/v0.4.1-beta.1
便携包：`Nest-0.4.1-beta.1-portable.zip`

| 提交 | 内容 |
|---|---|
| `da0c334` | NDS/DSi 系统模式自动插入最近玩的 NDS 游戏（`-b always <rom>`），设置可关 |
| `9d6f2a7` | 设置拆分为 Nest / Nintendo / Xbox / PlayStation 四页 |
| `d745dd8` | GBA 金手指面板：编辑 mGBA `.cheats`，支持 GameShark/AR/CB/PARv3 |
| `cf1dd02` | Cemu（Wii U GamePad）键位接入 Nest 键位面板 |
| `ee6a4d4` | DSi Menu 修通：保留 NAND nocash footer、`[DSi] ExternalBIOSEnable` 写布尔 true |
| `0936124` | NGC 系统模式 UIA 提速：去掉 3 秒固定等待，spawn→菜单约 2.8 秒 |
| `1244c8b` | 内置 melonDS master 构建，CLI `-b always` 直开 DS 菜单，2 倍窗口 |
| `bab6f1d` | 单个 NDS 入口 + DS/DSL/DSi/DSiLL 机型选择与四张插图 |
| `dc19b79` | DSi host 条目、DSi 固件导入（BIOS/固件/NAND）、TOML 纯函数模块 |

## v0.4.0-beta.1 · 2026-11-01

**主题：自写 libretro 宿主 + Wii U（Cemu）接入。** 发布类型：prerelease
发布页：https://github.com/Parmetty/NEST-Emulator-Station/releases/tag/v0.4.0-beta.1
便携包：`Nest-0.4.0-beta.1-portable.zip` 268 MB（解压 640 MB / 3172 文件）
SHA256：`235753F404CCFF3494D6A4C25861265C23B624F99BE5DAC4CA0DAD504D99CA22`

| 提交 | 内容 |
|---|---|
| `dafc8d2` | 自写 libretro 宿主（C# + SDL3 + GL 4.5）替代 Dolphin Qt+UIA 启动 Wii 系统菜单 |
| `08a618a` | GC Menu 源码级核查 + 补丁规格 + MSVC 编译指南（待执行）；宿主无内容安全路径 |
| `7080570` | 内置 Cemu 2.6，Wii U 扫描/直读、keys.txt 与 MLC 导入、Wii U Menu 入口 |
| `b7990f1` | 用 CDN 系统 title 手工组装 358 MB MLC；Wii U Menu 跑到 60 FPS，卡在 `nn_act.LoadConsoleAccount` |
| `a5a464e` | Cemu `portable/`（keys/NAND/shader）整体 gitignore，打包前清理 |
| `1e304af` | Wii 鼠标：绝对 pointer + `dolphin_ir_mode=2`，左键 = A |
| `8c5c6c4` | 只启用一个 Wiimote 端口（去掉多余 2/3/4 号光标）；锁窗口尺寸 |
| `63f8f6f` | Wii 输出铺满窗口：EFB 倍率 = 窗口倍数，640×480 表面 |
| `8e11797` | Wii 默认 4:3 原生输出（widescreen disabled / aspect auto） |
| `339d011` + `854f6ad` | 按屏幕录像标定 Wiimote 光标反向映射（X 1/1.31、Y 1/2.48） |
| `1249603` | UI：Wii U Menu 标「实验性」；设置里 MLC 行加 ? 提示 |
| `4a7b667` | 发布提交：版本 0.4.0-beta.1、README/CHANGELOG/发布说明 |

后续未随包改动：`0aaad33`（通用 release 脚本 + 进度记录）、`0e56ea0`（文档：双击
Nest.exe 为首选入口，bat 改为便携数据备用入口）。

---

## v0.3.2 · 2026-10-30

**主题：把「九台任天堂主机」的引擎矩阵补全，并做出可发布的免安装包。**

| 提交 | 内容 |
|---|---|
| `1a7b2d9` | N64 接入 ares，FC/SFC/N64 合并为一个引擎 |
| `53bd5f8` | 内置 Dolphin（NGC/Wii），独立 user 目录，GC 光盘扩展名 |
| `434279f` | NGC 系统菜单：Dolphin GUI 自动化 + `nest-input` 助手 |
| `479ef15` | Wii 系统菜单：直接加载 WAD 启动 |
| `ca89d72` | 合入 10.28 分支：3DS/Azahar、系统模式、手柄默认键位、固件导入器 |
| `9c2b81c` | NDS 接入 melonDS（直读 + 上屏封面） |
| `097f1aa` | NDS 固件菜单（File → Boot firmware，两级 UIA + BIOS 导入） |
| `0369de4` | 应用内键位改键 UI + 分引擎 controls 模块 |
| `7c5cb4f` | 启动自动重扫、`.cia` 与磁盘头判定、扫描设置 |
| `8bbd76a` | 免安装 zip / NSIS 配置、引擎配置清理、去掉运行时 userData 改写 |
| `10617d5` | ares 键盘启用（十进制 index 编码确认） |
| `7b9b2c6` | 0.3.1 便携包（扫描修复、键位 UI、四引擎自动键位） |
| `ebdd968` | README 重写（下载、引擎矩阵、键位、便携模式、架构） |

---

## v0.2.0-beta.1 · 2026-10-25

**主题：从零到第一个可发布的 beta（P0–P2）。**

| 提交 | 内容 |
|---|---|
| `b10888e` | P0：Electron 外壳、IPC 契约、引擎清单、进程监管、首页 |
| `5ac8da3` | P1：游戏库扫描、书架覆盖层、ROM 感知启动、自检 |
| `627e1ab` | P1.1：内置 mGBA、系统模式开关、真实 ROM trylaunch |
| `dfd8229` | 独立抓屏工具、自动封面、右键移除、运行中高亮 |
| `4af3f7a` | FC（FCEUX）/ SFC（bsnes）支持、分引擎封面裁剪 |
| `1a7b2d9` 之前 | ares 统一 FC/SFC/N64 的铺垫 |
| `40d1f01` | beta 0.2 发布：许可证、第三方声明、公开 README |
| `2d075a5` | 许可证切换为 MIT |
| `e990475` | CI：push 时 typecheck / test / build |

---

## 维护约定

1. **每次 release**：在 `CHANGELOG.md` 写用户可见变化，同时在本文档追加一个版本小节
   （日期、tag、commit、主题、关键提交表、发布页链接、zip 大小/SHA256）。
2. **较大型的提交组**（跨多天、改变架构方向，如 libretro 宿主、Cemu 接入）即使没发版，
   也先在「未发布」区记一条，发版时并入对应版本小节。
3. 提交哈希用短哈希；tag 用 `vX.Y.Z`；prerelease 在标题里注明。
4. 发布流程的收尾步骤见 `RELEASE-RUNBOOK.md` §8，已包含「更新本文档」。
