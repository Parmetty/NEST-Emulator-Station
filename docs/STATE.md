# 当前状态

> 新会话开场只需读这一份，再读 `PLAN.md` 与 `DECISIONS.md`。
>
> **发布状态：beta 0.2**（tag `v0.2.0-beta.1`）—— Windows 桌面版，GBA / FC / SFC / N64 全链路可玩。

## 进度

| 阶段 | 状态 |
| --- | --- |
| P0 骨架 | ✅ 完成 |
| P1 扫描器 + GBA 全链路 | ✅ 完成 |
| P1.1 内置 mGBA + 启动设置 | ✅ 完成 |
| P1.2 封面 / 右键移除 / 运行中高亮 | ✅ 完成 |
| P2 FC + SFC + N64 闭环 | ✅ 完成（闭环）；固件校验 / 每游戏设置 / 存档备份待做 |
| P3 NGC + Wii | 未开始 |

## P2 已完成的部分

- **引擎合并**：FC / SFC / N64 统一走 **ares v148**（ISC 许可，`resources/engines/ares/`）
  - 原计划 FCEUX（FC）+ bsnes（SFC）已删除，三台主机一个引擎，引擎总数 3 → 2
  - 体积：ares 105.7 MB → **42.6 MB**（砍掉 `Shaders/` 63 MB 的 CRT 滤镜贴图）
  - 启动：`ares.exe "{rom}"`，实测《超级马里奥兄弟 3》《忍者神龟》《姆吉拉的假面》均满速
- **ares 配置就位**（随包 `settings.bml`）：`ShowStatusBar: false`、`Overscan: false`
  - 客户区因此就是纯画面，**不需要裁剪**，`captureAspect` 从 ares 清单里移除
  - 教训：按 4:3 硬裁会在窗口留黑边时切掉画面底部
- **ares 键位**：首次启动自动写入 FC / SFC / N64 键盘默认（WASD + J/K + U/I + Q/E + Enter/ShiftRight，N64 Z=Space），格式 `0x1/0/<VK hex>;;`，详见 `KEYS-ARES.md`
- **抓屏工具**：新增 `--anchor top|bottom`（当前只有 mGBA 用 `aspect 1.5` 且默认 bottom）
- **界面引擎名**：新增 `engineLabel()` 映射，显示 `mGBA` / `ares` 而不是原始 id
- 许可证：ares 是 ISC，源码 https://github.com/ares-emulator/ares

验证命令：

```powershell
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms-fc-sfc --trylaunch=fc --hold=10000
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms-fc-sfc --trylaunch=sfc --hold=10000
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms-fc-sfc --trylaunch=n64 --hold=12000
```

三条验证命令都走随包 ares（`resources/engines/ares/`）；GBA 走随包 mGBA，验证见 P1.1 / P1.2。

实测封面尺寸：FC 800×576、SFC 750×576、N64 768×576（均为游戏画面本身）。

## P3 · NGC / Wii（进行中）

- **Dolphin 2609a 已内置**（`resources/engines/dolphin/`，57 MB，去掉了 DolphinTool/Updater）
  - 随包携带 VC++ 14.51 的 4 个运行库 DLL：本机 System32 的 `msvcp140.dll` 是旧的 14.11，Dolphin 启动即 0xC0000005 崩溃
  - 用户目录隔离：`Dolphin.exe -u <userData>/dolphin`，存档/NAND 不落到用户文档目录
  - 直读参数：`-u <dir> -b -e "<game>"`；应用已按此拉起 Dolphin（用假 ISO 验证过 spawn 与参数）
- **扫描扩展名**：`gcm / iso / rvz → ngc`，`wbfs → wii`（`.iso` 有歧义，PS 系平台锁定时风险可控）
- **系统模式已打通**（NGC）：
  - Dolphin 只接受 GCM/ISO，IPL 没有命令行入口；唯一路径是 GUI 菜单「载入 GameCube 主菜单 → 区域」
  - 新增 `resources/tools/nest-input.exe`：等窗口出现 → 置前 → 发送按键序列；清单里用 `systemBoot` 描述
  - `dolphin.json`: `{"keys":"alt+t,g,u","title":"Dolphin","delay":9000,"step":800}`
  - 实测：`--trysystem=ngc` → 启动 Dolphin GUI → 自动按键 → **GC 系统引导动画/主菜单出现**
- **IPL 校验**：Dolphin 只认下列 CRC32，用 `zlib.crc32` 可自查
  - NTSC: `6DAC1F2A` / `D5E6FEEA` / `D235E3F9` / `86573808`；PAL: `4F319F43` / `AD1B7F16`；MPAL `667D0B64`；Triforce `D1883221`
  - 用户自备，放 `<userData>/dolphin/GC/USA/IPL.bin`（PAL 放 EUR），**绝不进仓库**
- **直读已用真实镜像验证**：`红侠乔伊_CN.火热乱斗.gcm`（1.4 GB）→ `-b -e` 启动成功，窗口标题进入 JIT64/D3D11 渲染态，封面已生成
- **Wii 系统模式（纯命令行，零打扰）**：Dolphin 支持直接把 System Menu WAD 当启动目标
  - `Dolphin.exe -u <dir> -b -e <wii-menu.wad>` → 窗口标题出现 `Wii 菜单 (0000000100000002)`，无需安装 WAD
  - 用户自备 WAD 放 `<userData>/dolphin/wii-menu.wad`（**不进仓库**）
  - 清单用 `systemArgsBySystem.wii` 按主机覆盖参数，GC 仍走 GUI 自动化
- **GC 系统模式（已搁置）**：UIA 助手虽有防护，但实测又慢又不可靠，且 Qt 菜单展开会抓输入；`systems.ts` 已撤掉 NGC 的 `systemMode` 入口，等 Dolphin 魔改出命令行入口再做（见 D19 后续变更）
- **Dolphin 配置托管**：`ensureDolphinConfig()` 在每次启动前确保 `[Core] SkipIPL = True`（直读不需要 IPL）并关掉统计上报
  - 踩过的坑：测试时改成 `SkipIPL=False`，日版游戏（`GVCJ08`）就会去找 `GC/JAP/IPL.bin` 并报「找不到 GC IPL」

## 下一步

1. DAT 匹配（No-Intro SHA-1）与标题修正
2. 每游戏覆盖设置、存档备份
3. P3：Dolphin + NAND
4. P5：打包发布（清单见 `RELEASE.md`）

## P1.2 交付

- **抓屏工具**：`resources/tools/nest-capture.exe`（7.6 KB，独立 exe，CLI 见 README）
  - 抓客户区 → 按主机比例从底部裁掉 Qt 菜单栏 → 每 5 秒落一帧（保留最近 60 帧）
  - 引擎退出时（`close` 事件）把最新帧提升为 `covers/<gameId>.png`
- **右键移除**：游戏卡片右键 → 从库中移除（不删文件），IPC `nest:remove-game`
- **运行中高亮**：事件驱动（starting +1 / exited·crashed -1），主机行呼吸点、信息卡「运行中 ×N」、卡片角标；切窗口不会丢失；支持多开
- `Last played` 从 ISO 字符串转相对时间（修显示溢出）

验证：

```powershell
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms --trylaunch --hold=7000
# -> [nest] capture tool started for pid=...
# -> [nest] cover saved for <id> from shot-....png
# 封面尺寸 480x320（GBA 3:2，无窗口边框/菜单栏）
```

## P1.1 交付

- mGBA 0.10.5 随包内置（`resources/engines/mgba/`，41.5 MB，MPL 2.0，LICENSE 原样保留）
- GBA 用真实 ROM 跑通：`--trylaunch` 会启动内置 mGBA 并确认进程起来了
- 系统模式校正：GBA 移除、NGC 增加（`SYSTEMS[].systemMode` 是唯一开关）
- 设置面板：启动时最小化主窗口（默认开）、全屏启动引擎
- 视觉修正：`Last played` 从 ISO 时间戳转成相对时间

验证：

```powershell
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms --trylaunch
# -> [nest] trylaunch ok: pokemon-firered-cn.gba started
```

## P1 交付

- `src/main/scanner.ts`：递归扫描、扩展名映射、sha1 流式计算、标题清洗
- `Store`：`games[]`、按哈希去重、`recordSession(systemId, at, gameId)`
- IPC：`nest:games`、`nest:scan`（可选目录对话框）、`launch` 带 `rom`
- 游戏库界面：卡片墙、键盘网格导航、空状态、扫描按钮
- 端到端自检：`--selftest`（扫描 → 启动 → 引擎退出 0 → 最近游玩写入）

验收命令：

```bash
npm run build
NEST_FAKE_ENGINE=1 node tools/run.mjs . --no-sandbox --user-data-dir=.profile \
  --scan=.testroms --selftest
# -> [nest] selftest ok: launched "Advance Wars", engine exited 0, lastPlayed recorded
```

## 已完成

- Electron 外壳：窗口、preload、IPC（zod 校验）、单实例数据目录
- 13 份引擎清单（内置 mGBA / ares + 10 份探测与预留 + fake）
- 进程监管：启动 / 运行 / 正常退出 / 崩溃 / 强杀，全部有事件
- JSON 库：原子写、收藏、最近游玩
- 首页：四区布局、时间线排序、平台切换标尺、确认框、键鼠双通道（接真实 IPC）
- 诊断开关：`--smoke`、`--shot`、`--dump`
- 视觉基准：`docs/mock-v1/`
- 测试 16 条 + 类型检查 + 构建

## 更远的路

1. DAT 匹配（No-Intro SHA-1）与标题修正
2. 每游戏覆盖设置、存档备份、手柄映射

## 环境坑（本机）

| 现象 | 处理 |
| --- | --- |
| 开窗口即 `0xC0000005` | 数据目录不能落 `%APPDATA%`，用 `--user-data-dir=.profile`（`npm run start:here`） |
| electron 当 node 跑 | 全局 `ELECTRON_RUN_AS_NODE=1`，`tools/run.mjs` 负责清掉 |
| 截图里动画没走完 | 用 `--shot`，先切 `.still` 静止帧再 `capturePage` |
| `npm install` 卡在 Electron 下载 | 设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |

## 验证命令

```bash
npm run typecheck
npm test
npm run build
npm run smoke        # 退 0 且打印 "smoke ok: renderer rendered"
npm run shot         # 产出 shots/app.png
```

## 未决问题

- 系统模式启动参数（Dolphin `-b`、Cemu 菜单）尚未在真引擎上验证，等有 NAND/MLC 的机器
- 封面抓取源（ScreenScraper / IGDB）未选型，P5 再定
- 打包与发布：清单已写好在 [RELEASE.md](RELEASE.md)，动手前先修两处 asar 路径问题

## P3 · 3DS（2026-10-29 合并）

- **引擎**：Azahar 2126.2 内置（`resources/engines/azahar/`，101.8 MB），`azahar.exe "<rom>"`，全屏 `-f`
- **配置隔离**：子进程 `USERPROFILE / APPDATA / LOCALAPPDATA` 指向 `<userData>/azahar`
- **封面**：清单 `captureCropTop/Bottom` 按窗口 DPI 裁掉 Qt 菜单栏与状态栏
- **系统模式**：**无**。Azahar 不支持 HOME Menu，`systems.ts` 不声明入口
- **键位**：首次启动写入 WASD + 空格/J/K/L + 方向键 + TGFH（同 Dolphin 布局），已自定义不覆盖
- **固件入口**：设置面板「系统文件（自备）」可选 IPL / WAD，导入后校验 CRC 并落到 Dolphin 用户目录

## P3 · 系统模式现状（合并分支后）

- **NGC**：`SkipIPL=False` + `nest-menu.exe`（UIA 精确路径 `top → menu → item`）+ `nest-window.exe --render-title`；缺 IPL 返回 `missing-ipl`
- **Wii**：优先 `-b -e wii-menu.wad`；WAD 缺失但 NAND 已装 System Menu 时回退 `-b -n 0000000100000002`
- **NDS / Wii U**：引擎未随包，已撤掉系统模式入口（不再给按了必失败的按钮）— NDS 已随 P3 补上，见下节
## P3 · NDS（2026-10-29）

- **引擎**：melonDS 1.1 内置（`resources/engines/melonds/`，41.5 MB），`melonDS.exe "<rom>"`，全屏 `-f`
- **BIOS**：直读不需要。melonDS 1.1 默认走内置 FreeBIOS（GTA 已验证）；真实固件只在系统模式必需
- **系统模式**：✅ **DS 固件菜单**。入口是 **File → Boot firmware**（不是 System 菜单，官方论坛 Arisotura 确认），要求真实 BIOS + 可引导 firmware。Nest 用 `nest-menu.exe --top File --menu "Boot firmware"` 触发（`--item` 已改为可选，支持二级菜单），`renderTitle "60/60"` 判活
- **前置条件**：`<userData>/melonds/bios/{bios7.bin,bios9.bin,firmware.bin}`；缺失时返回 `missing-nds-bios`。`ensureMelondsConfig()` 会在启动前把 `[Emu] ExternalBIOSEnable/DirectBoot` 与 `[DS]` 三条路径写进引擎目录 `melonDS.toml`
- **实测**：`--trysystem=nds` → DS 固件菜单（日历 / PictoChat / DS Download Play）正常出现
- **封面**：`captureCropTop 26` + `captureContentAspect 0.666667` + `captureTopOnly` → 只保留下屏之上的 **DS 上屏**（256×192 比例）
- **配置**：melonDS 便携写 `melonDS.toml` / `wfcsettings.bin` 到引擎目录，已 gitignore；打包前需清理（含 RecentROM 本地路径）
- **已知**：封面可能取到黑帧（GTA 过场），属 COV-2 问题

## 扫描（2026-10-30）

- 扩展名表见 `src/main/scanner.ts` 的 `EXT_TO_SYSTEM`；歧义镜像（`.iso/.rvz/.gcz/.ciso`）走 `systemForFile()` 读 0x18 magic 判定 GC / Wii
- 用户添加过的文件夹存 `settings.scanRoots`（绝对路径、去重、上限 32）；`autoScan !== false` 时启动后 800ms 后台重扫，完成后向渲染层发 `nest:library-changed`，设置面板可移除文件夹或手动重扫
- 调试参数 `--scan=` 走同一套 bookkeeping（不经过 IPC）

## 键位（2026-10-30）

- 模块：`src/main/controls/`（keymap + mgba/dolphin/azahar/melonds/ares 适配器 + util + facade），ares 仍是 `supported:false` 占位
- 数据：`settings.controls[engineId] = { mode?, keyboard?, updatedAt? }`；运行时与默认值合并后交给适配器
- 语义：`force=false` 只在配置仍是 stock 或自家 seed 时写入，用户自定义只留 marker；`force=true`（保存/恢复默认）无条件重写；`.before-nest` 仅首次备份
- 写入位置：mGBA `<exe>/config.ini`、Dolphin `<userData>/dolphin/Config/GCPadNew.ini`、Azahar `<userData>/azahar/…/qt-config.ini`、melonDS `<exe>/melonDS.toml`
- 界面：设置面板「键位」两栏布局，GBA/FC/SFC/N64/NDS/NGC/Wii/3DS chips；ares 组置灰提示不支持
- 注意：启动引擎会写引擎目录里的配置（开发仓库需要 `git checkout resources/engines/<engine>` 还原）
