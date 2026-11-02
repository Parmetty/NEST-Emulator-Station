# P6.0 调研报告：PS 家族引擎与系统模式

> 调研日期：2026-11-03 · 状态：**已完成（代码级/文档级核实，未跑真实镜像）**
> 依据：各引擎官方 README / Wiki / 源码（CLI 参数与路径均引用源码或官方文档），下载资产大小来自 GitHub Releases API。
> 结论先行：PS1 / PS2 / PSP **都有可用的“系统模式”入口**，但机制不同；PS3 没有 XMB，只能直读。
> 另外 DuckStation 的许可证（CC BY-NC-ND 4.0）意味着**不适合随包内置**，建议改为探测本机安装。

## 一、四个引擎的来头

| 引擎 | 主机 | 作者/项目 | 许可证 | 最新版本（2026-11-03） | Windows 包大小 |
|---|---|---|---|---|---|
| **DuckStation** | PS1 | stenzek（PS1 高精度/高性能路线） | **CC BY-NC-ND 4.0** | rolling（2026-10-25） | 70.6 MB（zip） |
| **PPSSPP** | PSP | Henrik Rydgård（hrydgard），2012 起 | GPLv2+ | v1.20.4 稳定（XMB 要 1.21） | 19.4 MB（zip） |
| **PCSX2** | PS2 | PCSX2 团队（2001 年起的老牌项目） | GPLv3 | v2.8.2 | 24.5 MB（7z） |
| **RPCS3** | PS3 | RPCS3 团队，2011 起 | GPLv2 | v0.0.43 Alpha | 以官网 nightly 为准（Releases API 无 Windows 资产） |

来源：
- DuckStation README / LICENSE：https://github.com/stenzek/duckstation
- PPSSPP：https://github.com/hrydgard/ppsspp · https://www.ppsspp.org/docs/
- PCSX2：https://github.com/PCSX2/pcsx2
- RPCS3：https://github.com/RPCS3/rpcs3

**对 Nest 最关键的许可证差异**：DuckStation 是 **CC BY-NC-ND 4.0**（非商业、禁止改作）。
便携包若内置它，最多只能“原样打包 + 署名”，且整个 Nest 便携包会被视为非商业分发；为了不踩线，
**PS1 改为探测本机安装 / 用户自备，官方下载链接引导**，不随包分发。其余三个是 GPL，可以随包，但要注意体积。

## 二、系统模式怎么实现（重点）

| 主机 | 有没有系统菜单 | 入口/机制 | 核实依据 | 能不能从菜单启动库里的游戏 |
|---|---|---|---|---|
| PS1 | ✅ BIOS shell（记忆卡管理 / CD 播放器） | `duckstation-qt.exe -bios`（官方 CLI：*Boot into the BIOS shell*） | DuckStation Wiki Command-Line-Arguments | ❌ BIOS shell 不提供游戏启动；直读仍走 Nest |
| PS2 | ✅ PS2 浏览器（版本/记忆卡/浏览器） | `pcsx2-qt.exe -bios`（源码：`-bios` → `CDVD_SourceType::NoDisc`，无盘启动 BIOS） | PCSX2 `pcsx2-qt/QtHost.cpp` 2279 行 | 🟡 浏览器可管理记忆卡；能否插盘启动待实测 |
| PSP | ✅ XMB（VSH，1.21 起） | PPSSPP 菜单 **File → Load XMB (VSH)**；开发版支持 `--vsh`；需先安装 PSP 固件（游戏光盘自带更新，或官方 6.61 更新） | PPSSPP 官方文档 *How to run the XMB (VSH)*、`docs/VSHBootInvestigation.md` | ✅ XMB 里可用 **Insert UMD** 或 Game 菜单启动游戏/自制程序；存档状态在 XMB 下不可用 |
| PS3 | ❌ 没有 | RPCS3 不模拟 XMB；固件只用于运行游戏 | RPCS3 源码无 XMB 启动入口（CLI 只有 no-gui/config/installfw 等）；社区共识 | — |

**实现方式建议（Nest 侧）**：

1. **PS1**：系统模式 = `duckstation -bios`；设置页提供 PS1 BIOS 导入（DuckStation README 明确 BIOS 必需）；
   菜单里不能启动 Nest 库游戏，所以 UI 文案要写“BIOS 设置/记忆卡”，不要写成游戏启动器。
2. **PS2**：系统模式 = `pcsx2 -bios`；启动前校验 BIOS，设置页导入；待实测浏览器里能否插入 Nest 库中的镜像。
3. **PSP**：系统模式 = **XMB**，但依赖 PPSSPP **1.21+**（当前稳定版 1.20.4 不支持）。方案：
   - 先接 1.20.4 的**直读**，系统模式标“实验性/需 1.21”
   - 等 1.21 稳定（或内置 dev build）后再用 `File → Load XMB` 或 `--vsh`；固件可由游戏光盘自动安装
   - 若做自动化，可研究 PPSSPP 内置 **WebSocket API**
4. **PS3**：**不做系统模式**；只做直读 + 固件 PUP 安装。文档写明“无 XMB”。

## 三、便携模式与数据隔离

| 引擎 | 机制 | Nest 落地 |
|---|---|---|
| DuckStation | 程序目录放空文件 `portable.txt` → 用户目录=程序目录 | 引擎目录内放 `portable.txt`，BIOS/记忆卡/存档/设置都在自己目录 |
| PCSX2 | 程序目录放 `portable.ini` 或 `portable.txt`（源码 `EmuFolders::ShouldUsePortableMode`） | 同上；另有 `-portable` 启动参数 |
| PPSSPP | `--memstick=DIR`、`--root=DIR`；程序目录存在 `memstick\` 时自动用它 | 用 `--memstick` 指向 `data/playstation/ppsspp/memstick` |
| RPCS3 | 没有 portable 开关，默认 `%APPDATA%\rpcs3` | 启动子进程时重定向 `APPDATA`/`LOCALAPPDATA`（同 Azahar 的做法） |

## 四、命令行与集成参数（已核实）

- **DuckStation**（Wiki）：`-batch` / `-fastboot` / `-slowboot` / `-bios` / `-fullscreen` / `-nogui` / `-bigpicture` / `-state` / `-statefile` / `-resume` / `-exe`
- **PPSSPP**（官方 CLI 文档）：`--fullscreen`、`--windowed`、`--memstick=DIR`、`--root=DIR`、`--state=FILE`、`--pause-menu-exit`、`--escape-exit`、`--log=FILE`；1.21 起统一参数解析
- **PCSX2**（QtHost.cpp）：`-batch`、`-nogui`、`-fastboot`、`-slowboot`、`-bios`、`-fullscreen`、`-nofullscreen`、`-state`、`-elf`、`-disc`、`-gameargs`
- **RPCS3**（rpcs3.cpp）：`no-gui`、`fullscreen`、`config`、`input-config`、`installfw`、`installpkg`、`savestate`、`headless` 等

## 五、镜像格式与扫描

| 主机 | 扩展名 | 备注 |
|---|---|---|
| PS1 | `.cue` `.bin` `.chd` `.pbp` `.iso` `.mds/.mdf` `.ccd` `.ecm` | `.bin` 必须配 `.cue`；PBP 是单文件 |
| PSP | `.iso` `.cso` `.pbp` | `.cso` 是压缩 ISO |
| PS2 | `.iso` `.chd` `.bin`+`.cue` | 与 GC/Wii/PSP 的 `.iso` 冲突，需要按系统扫描根或文件头判定 |
| PS3 | 游戏目录 / `.iso` | 需要固件；目录型内容不能靠扩展名 |

## 六、对原计划的修正

| 原计划假设 | 调研结果 |
|---|---|
| PS1 BIOS 可选 | ❌ DuckStation README：**BIOS 必需**（不提供 BIOS 无法启动） |
| PS1/PS3 可能有系统菜单 | PS1 有 BIOS shell（`-bios`）；PS3 **没有 XMB** |
| PSP 无系统菜单 | ❌ 有 XMB，但 **PPSSPP 1.21+** 才支持，当前稳定版还没有 |
| DuckStation 可随包 | ⚠️ CC BY-NC-ND 4.0：不建议随包，改为探测/引导用户安装 |
| PS 引擎都很大 | 实际：PPSSPP 19.4 MB、PCSX2 24.5 MB，比预想小；DuckStation 70.6 MB 偏大 |

## 七、下一步（P6.1 准备）

1. 代码：`systems.ts` 解锁 PS1 → `resources/engines/duckstation.json`（探测路径 + `-bios`/直读参数）
2. 设置页 PlayStation → PS1 BIOS 导入（校验 + 路径写入 DuckStation `settings.ini` 或用户目录 `bios/`）
3. 便携隔离：`portable.txt` + 启动参数 `-batch`/`-fullscreen` 实测
4. 验证资源：用户自备 PS1 BIOS + 真实镜像；没资源前只到“代码就绪”
5. 文档：`ENGINE-duckstation.md` 已产出；P6.2–P6.4 按同样格式补

## 八、参考链接

- DuckStation CLI Wiki：https://github.com/stenzek/duckstation/wiki/Command-Line-Arguments
- DuckStation README（BIOS 必需、portable.txt、用户目录）：https://github.com/stenzek/duckstation#readme
- PPSSPP CLI：https://www.ppsspp.org/docs/reference/command-line/
- PPSSPP XMB：https://www.ppsspp.org/docs/getting-started/how-to-run-the-vsh/
- PPSSPP WebSocket API：https://www.ppsspp.org/docs/reference/websocket-api/
- PCSX2 CLI/portable 源码：https://github.com/PCSX2/pcsx2 （`pcsx2-qt/QtHost.cpp`、`pcsx2/Pcsx2Config.cpp`）
- RPCS3 CLI：https://github.com/RPCS3/rpcs3 （`rpcs3/rpcs3.cpp`）
