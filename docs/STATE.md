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
- 待办：拿到 GC 游戏镜像后验证直读 + 封面裁剪

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
- 测试 15 条 + 类型检查 + 构建

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
