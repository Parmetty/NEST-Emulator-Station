# 当前状态

> 新会话开场只需读这一份，再读 `PLAN.md` 与 `DECISIONS.md`。
>
> **发布状态：beta 0.2**（tag `v0.2.0-beta.1`）—— Windows 桌面版，GBA 全链路可玩。

## 进度

| 阶段 | 状态 |
| --- | --- |
| P0 骨架 | ✅ 完成 |
| P1 扫描器 + GBA 全链路 | ✅ 完成 |
| P1.1 内置 mGBA + 启动设置 | ✅ 完成 |
| P1.2 封面 / 右键移除 / 运行中高亮 | ✅ 完成 |
| P2 FC + SFC 闭环 | ✅ 完成（N64 未做） |
| P3 NGC + Wii | 未开始 |

## P2 已完成的部分

- **FC**：FCEUX 2.6.6 内置（`resources/engines/fceux/`，~7.5 MB），`fceux64.exe "{rom}"` 直接启动
- **SFC**：bsnes v115 内置（`resources/engines/bsnes/`，~4.4 MB），`bsnes.exe "{rom}"`，`--fullscreen` 已实测生效
- **封面裁剪改为按引擎配置**（`captureAspect` 写进清单）：
  - mGBA `1.5`（3:2，去掉窗口顶部 Qt 菜单）
  - bsnes `1.142857`（8:7，去掉顶部 24px 菜单）
  - FCEUX 不裁剪（它把画面拉伸铺满客户区，实测 320×256 无 chrome）
- **抓屏工具加前台 + 遮挡检查**：只有窗口在前台且抓取点确实属于它时才落帧，避免存下别的窗口
- 许可证：FCEUX 是 GPLv2、bsnes 是 GPLv3，许可证全文已随包，源码地址写在 THIRD-PARTY-NOTICES

验证方式（`NEST` 需要游戏窗口在前台，真实使用时 Nest 会最小化、游戏自然在前台）：

```powershell
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms-fc-sfc --trylaunch=fc --hold=6000
node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms-fc-sfc --trylaunch=sfc --hold=6000
```

实测封面：FC → 320×256（超级马里奥兄弟 3 标题），SFC → 512×448（忍者神龟标题）。

## 下一步（P2 剩余）

1. N64：ares 或 mupen64plus，需确认 CLI 与控制器配置
2. DAT 匹配（No-Intro SHA-1）与标题修正
3. 每游戏覆盖设置、存档备份

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
| P3–P5 | 未开始 |

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
- 15 份引擎清单（9 台任天堂 + 6 个预留平台）
- 进程监管：启动 / 运行 / 正常退出 / 崩溃 / 强杀，全部有事件
- JSON 库：原子写、收藏、最近游玩
- 首页：四区布局、时间线排序、平台切换标尺、确认框、键鼠双通道（接真实 IPC）
- 诊断开关：`--smoke`、`--shot`、`--dump`
- 视觉基准：`docs/mock-v1/`
- 测试 15 条 + 类型检查 + 构建

## 更远的路

1. N64：ares / mupen64plus，需确认 CLI 与控制器配置
2. DAT 匹配（No-Intro SHA-1）与标题修正
3. 每游戏覆盖设置、存档备份、手柄映射

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
