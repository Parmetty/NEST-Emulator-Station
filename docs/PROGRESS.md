# Nest 开发进度与待办

> 生成于 2026-10-28（Asia/Shanghai）｜基线 `main @ 479ef15`，工作区干净（`git status` 无输出）｜版本仍为 `0.2.0`，最新 tag `v0.2.0-beta.1`（指向 `2d075a5`）。
> 依据：`git log/show`、`docs/STATE.md`、`docs/PLAN.md`、`docs/DECISIONS.md`、`docs/RELEASE.md`、`README.md`、`resources/engines/*.json`、`src/shared/systems.ts`、`src/shared/contract.ts`、`src/main/ipc.ts`、`resources/tools/*`。

## 1. 一句话现状

一个 Electron“主机启动站”：扫描 ROM → 卡片墙 → 内置引擎以子进程启动 → 退出回 Nest 并自动生成封面。GBA / FC / SFC / N64 全链路已验证可玩；NGC 直读已验证、Wii 直读代码就绪，两者的系统模式都已跑通但需用户自备 IPL / WAD；NDS / 3DS / Wii U 与 Xbox / PS 系列仍只有引擎清单。

## 2. 能力矩阵

图例：**已验证** = 有真实 ROM/ISO 或真实系统文件的运行记录；**代码就绪** = 参数与路径已接但无真实内容验证；**未实现** = 只有清单或路线图。
依据：`docs/STATE.md`、`resources/engines/*.json`、`src/shared/systems.ts`、`src/main/scanner.ts`。

| 主机（年） | 直读 | 系统模式 | 引擎 / 体积 | 结论 |
| --- | --- | --- | --- | --- |
| FC 1983 | ✅ 已验证（真实 ROM） | — | ares v148 / 42.6 MB，随包 | 可玩（STATE:23,34） |
| SFC 1990 | ✅ 已验证（真实 ROM） | — | ares v148 / 42.6 MB，随包 | 可玩（STATE:23,35） |
| N64 1996 | ✅ 已验证（真实 ROM） | ✖ 未实现（PLAN:30 的“64DD IPL”仅是设想：`systems.ts:33` 无 `systemMode`，`ares.json` `capabilities.systemMode=null`） | ares v148 / 42.6 MB，随包 | 直读可玩 |
| GBA 2001 | ✅ 已验证（真实 ROM） | —（BIOS 开机动画随游戏走，不算系统） | mGBA 0.10.5 / 41.5 MB，随包 | 可玩（STATE:92-102） |
| NGC 2001 | ✅ 已验证（真实 1.4 GB `.gcm`，STATE:58） | ⚠️ 已验证一次、实验性：Dolphin GUI 自动化（UIA `systemBoot`），需自备 IPL（STATE:50-56） | Dolphin 2609a / 57.0 MB，随包 | 直读可玩；IPL 入口标注实验 |
| Wii 2006 | 🟡 代码就绪、未验证（`scanner.ts:23` `wbfs→wii`，无真实镜像运行记录） | ✅ 已验证：`-b -e <wii-menu.wad>` 直启（STATE:59-62），需自备 WAD | Dolphin 2609a / 57.0 MB，随包 | 系统菜单可用；直读待验证 |
| NDS 2004 | ✖ 未接（引擎未随包） | ✖ 未实现（`melonds.json` `systemMode=null`） | melonDS，仅探测清单 | 未验证 |
| 3DS 2011 | ✖ 未接 | ✖ 未实现（`citra.json` `systemMode=null`） | Citra，仅探测清单 | 未验证 |
| Wii U 2012 | ✖ 未接 | ✖ 未实现（`cemu.json` 仅有 `-b` 参数占位，未验证） | Cemu，仅探测清单 | 未验证 |
| Xbox / 360、PS1/2/PSP/PS3 | ✖ 锁定/预留 | — | xemu/xenia/duckstation/pcsx2/ppsspp/rpcs3，仅清单 | 未验证（`systems.ts:41-47`） |

- 内置引擎合计 **141.2 MB**（实测 `resources/engines` 目录求和：mGBA 41.5 + ares 42.6 + Dolphin 57.0）；另有 9 份仅探测清单 + 1 份 `fake` 测试引擎，共 13 份（`resources/engines/*.json`）。
- 9 台任天堂主机全部在 `SYSTEMS` 中（`systems.ts:31-39`），6 台 Xbox/PS 预留平台标记 `locked`（`systems.ts:41-47`）。

## 3. 本期完成（自 `v0.2.0-beta.1` 之后，按时间倒序）

| 提交 | 日期 | 一句话 |
| --- | --- | --- |
| `479ef15` | 10-28 | Wii Menu 改走 WAD 命令行直启（零打扰）；UIA 菜单助手加防护；清单支持 `systemArgsBySystem` |
| `434279f` | 10-27 | NGC 系统模式用 Dolphin GUI 自动化打通（新增 `nest-input` 助手与 `systemBoot` 清单字段） |
| `0f0f1dd` | 10-27 | `.gitattributes` 保证引擎载荷进 git 后字节不变（不被换行改写） |
| `53bd5f8` | 10-27 | 内置 Dolphin 2609a（57 MB，去掉工具/更新器）；`-u` 隔离 Dolphin 用户目录；GC 光盘扩展名映射 |
| `ee8f6b8` | 10-27 | 修 `DEV_RUN` 单实例锁绕过判断；文档重新同步引擎状态 |
| `a7719d2` | 10-27 | RELEASE 增补“引擎配置里会泄漏本地路径”的打包检查项 |
| `bc9e800` | 10-27 | 清掉 ares `settings.bml` 里的本地路径 |
| `abfd7ef` | 10-27 | 单实例锁 + 窗口立即显示（评审采纳，D17/D18） |
| `1a7b2d9` | 10-27 | N64 接入；FC/SFC/N64 合并到 ares（引擎 3→2）；界面显示引擎名 |
| `1fe11eb` | 10-25 | 修启动事件设置的 toast 永不消失 |
| `4af3f7a` | 10-25 | FC（FCEUX）/ SFC（bsnes）首版与按引擎裁封面（已被 `1a7b2d9` 的 ares 方案取代） |
| `eeb1d71`、`7180f08` | 10-25 | 发布打包清单；修许可链接 |

## 4. 技术要点

1. **引擎即数据**：`resources/engines/<id>.json` + zod 校验（`contract.ts:51-117`）；`{rom}` / `{userData}` / `{engines}` 占位符与 `cwd`、`detect`、能力全在清单里（`ipc.ts:195-217`），加主机不写 TypeScript（D1）。
2. **进程外运行**：模拟器永远是子进程，事件 `starting / running / exited / crashed / refused`；封面只在退出时生成（`index.ts:240-256`，D15）。
3. **封面用独立抓屏工具**：`resources/tools/nest-capture.exe` 周期抓引擎窗口客户区，按清单 `captureAspect` / `captureAnchor` 裁掉前端 chrome，退出时把最新帧提升为 `covers/<gameId>.png`（D15；`tools/capture/NestCapture.cs` 支持 `--aspect/--anchor/--allow-background`）。
4. **系统模式两条实现路径**：能命令行就命令行——Wii 用 `-b -e wii-menu.wad`（`dolphin.json:16-18`）；只能走 GUI 就把动作数据化——NGC 用 `systemBoot` 描述菜单，清单可选 UIA（`menu`+`item` → `nest-menu.exe`，不依赖前台键盘注入）或按键序列（`keys` → `nest-input.exe`）；当前 `dolphin.json` 用 UIA（D19；`ipc.ts:245-290`）。
5. **会话结束判定**：Dolphin 的启动器进程关游戏后仍常驻，所以 system 模式用 `nest-window.exe` 监视“渲染窗口出现→消失”，窗口关掉再由主进程结束会话（`ipc.ts:279-288`；`tools/window/NestWindow.cs`）。
6. **数据隔离与便携模式**：Dolphin 一律 `-u {userData}/dolphin`（存档/NAND 不落文档目录）；mGBA 是便携模式，配置写在 exe 旁的 `config.ini`/`qt.ini`（`RELEASE.md:149-162`）。

## 5. 待办

### P2 收尾

- **DAT 匹配（No-Intro SHA-1）与标题修正**。验收：已知样本 ROM 标题与 DAT 一致；未命中时保留文件名清洗结果并在 UI 标记“未匹配”。
- **每游戏覆盖设置**。验收：可按 `gameId` 覆盖分辨率/键位等，未配置时回退全局（当前 `Settings` 只有 `minimizeOnLaunch`/`fullscreen`，`contract.ts:189-192`）。
- **存档备份 / 统一存档**。验收：游戏退出后 `.sav` 自动备份进 userData 且可按 `gameId` 还原（mGBA 默认存 ROM 旁，`RELEASE.md:160-162`）。
- **固件校验提示**。验收：缺 BIOS/固件时给分步指引，而不是启动失败后静默。

### P3（NGC / Wii）

- **Wii 直读端到端验证**。验收：`--trylaunch=wii` 用真实 `.wbfs`/`.iso` 启动成功并生成封面（README:104/113 目前仍写“待验证”）。
- **IPL / WAD 导入引导**。验收：UI 检测 `<userData>/dolphin/GC/USA/IPL.bin` 与 `<userData>/dolphin/wii-menu.wad`，缺失时给出路径与分步指引（现在只有 README:114-115 说明）。
- **NAND 导入向导与体检、记忆卡管理**。验收：`PLAN.md:64`——导入 NAND 后能从应用内开机进 Wii Menu 并返回，NAND 缺失有分步指引。
- **收敛 UIA 实验入口**。验收：NGC 入口在 UI 明确标注“实验”，或找到命令行替代后移除 `systemBoot`（D19 结论：不应变成框架级依赖）。

### P4（Wii U）

- **Cemu 适配**：MLC / keys 导入、Wii U Menu、更新与 DLC 路径识别。验收：`PLAN.md:70`；当前 `cemu.json` 只有探测路径与未验证的 `-b`，需真机有 MLC 时再验。

### P5（打包与交付）

- **修 asar 下的抓屏路径**：`captureToolPath()` 在打包后要用 `process.resourcesPath`（`RELEASE.md:15-26`）。验收：`dist:dir` 版本运行出现 `[nest] capture tool started for pid=...`。
- **electron-builder 配置**：`extraResources` 拷贝 `engines/`、`tools/`（`RELEASE.md:60-114`）。验收：解包目录含 `engines/{mgba,ares,dolphin}` 与 4 个助手 exe，引擎探测全部通过。
- **打包前清本地路径**：ares `settings.bml` 的 `Path:/Recent`、mGBA `qt.ini` 的窗口位置/MRU。验收：发行包里 grep 不到 `E:\workstop`（`RELEASE.md:237-240`）。
- **引擎目录可写性方案**：mGBA 便携配置写安装目录，装到 Program Files 会保存失败。验收：采用 per-user 安装，或首次运行把引擎复制到 `%APPDATA%\Nest\engines\`（`RELEASE.md:149-158`）。
- **未签名说明 + SmartScreen 文案**：验收：README/Release notes 明示“未签名、点更多信息→仍要运行”（`RELEASE.md:219-222`）。
- **NSIS 安装包 + 干净机冒烟**：按 `RELEASE.md:224-240` 的清单逐条过（安装、扫描、启动、封面、右键移除、卸载、残留检查）。
- **同步文档漂移**：见 §6「文档漂移（需要修）」清单。

## 6. 已知限制与风险

- **NGC 系统模式是 UIA 实验**：Qt 菜单展开的瞬间会抓鼠标/键盘，用户此时操作会感到被抢；助手已改为“单次尝试、异常不外泄、失败必收起菜单”，但根本上仍是 GUI 自动化（`DECISIONS.md:168-170`、`tools/menu/NestMenu.cs`、`STATE.md:63`）。
- **版权物需用户自备**：GC IPL（`<userData>/dolphin/GC/USA/IPL.bin`，只认 CRC32 白名单）与 Wii Menu WAD（`<userData>/dolphin/wii-menu.wad`）都不进仓库（D7；`STATE.md:55-61`）。缺文件时目前没有 UI 引导。
- **Dolphin 依赖随包 VC++ 运行库**：必须带 `msvcp140.dll`、`vcruntime140.dll`、`vcruntime140_1.dll`、`concrt140.dll`（本机 System32 的 14.11 会让 Dolphin 启动即 `0xC0000005`）；微软允许再分发，但发布要保留说明（`STATE.md:46`、`THIRD-PARTY-NOTICES.md`）。
- **Dolphin 是 GPLv2+ 且随包分发**：必须保留 `COPYING`、`Licenses/` 并注明来源与许可；与项目 MIT 并存需要清楚表述（`THIRD-PARTY-NOTICES.md`、`resources/engines/dolphin/COPYING`）。
- **未签名**：首次运行触发 SmartScreen；代码签名暂不做（`RELEASE.md:219-222`）。
- **抓屏依赖窗口可见**：最小化/后台不抓，短于 5 秒的会话可能没有封面（D15 代价；`RELEASE.md:251`）。
- **存档跟 ROM 走**：mGBA 的 `.sav` 写在 ROM 旁边，移动/删除 ROM 会丢档，尚无备份机制（`RELEASE.md:160-162`）。
- **引擎目录可写性**：mGBA 便携配置与 Dolphin 的 `-u` 目录都受安装位置影响（`RELEASE.md:149-158`）。
- **体积**：三个引擎 141.2 MB + Electron ~90 MB，安装包预估 190–220 MB（`RELEASE.md:176-187`）；引擎载荷已全部进 git，`RELEASE.md:260` 建议后续用 LFS 或首次下载。
- **文档漂移（需要修）**：
  - `README.md:104` 仍写“NGC 直读待镜像验证、Wii Menu 待 NAND”；`README.md:113` 仍写“NGC/Wii 还没有游戏镜像做端到端验证”——与 `STATE.md:58`（真实 1.4 GB `.gcm` 已验证）矛盾。
  - `STATE.md:159` 未决问题仍写“系统模式尚未在真引擎上验证”——与 `STATE.md:50-62` 矛盾。
  - `STATE.md:131` 写“测试 15 条”，实际 `npm test` 为 **16** 条（`tests/*.test.ts` 共 16 个 `it()`，含 `engines.test.ts:45` 新增的占位符用例）。
  - `README.md:63-64,77` 只列了 `nest-capture`，漏了 `nest-input` / `nest-window` / `nest-menu` 三个助手（`tools/build-capture.ps1` 构建 4 个 exe）；抓屏 CLI 也漏了 `--anchor` / `--allow-background`。
  - `PLAN.md:30` 的 N64“64DD IPL（实验）”尚未实现（见 §2）；`src/main/scanner.ts:6` 注释仍写 `iso/gcm/wbfs` 留到 P2，实际映射已生效；`contract.ts:79-83` 的 `captureAspect` 注释仍以已删除的 FCEUX 举例。

## 7. 下一步建议

**先做 P5 打包的最小闭环**：按 `RELEASE.md` §1.1/§1.2 修 asar 抓屏路径 + 配 `extraResources`，跑通 `dist:dir` 与 §10 冒烟清单（含清本地路径、引擎可写性方案）。理由是：现在所有“已验证”都发生在开发机源码运行，而三个引擎 141 MB 的随包路径、许可、VC++ DLL 与引擎写盘问题只有在打包后才暴露；打通它才能把 P3 的 Wii 真实镜像验证与 IPL/WAD 引导放到真实安装形态下做。
