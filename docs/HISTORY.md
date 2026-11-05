# Nest 功能编年史

> 本文按**功能更新**组织，不按 commit 时间线组织。
>
> 每个功能后面的括号里是一组有代表性的短 commit（可能不止一个，用 `+` 连接）；它们只是
> “这个功能在仓库里怎么落地的”证据，不是提交清单本身。想看逐条提交请直接 `git log`。
>
> 另一类内容——**探索性任务**：我们确实做过、也留下了 commit，但用户拿不到可交付功能，
> 或者只是研究记录——统一放在文末「探索性工作」一节，并明确标注 **不是功能更新**。
>
> 用户可见变化另见 [CHANGELOG.md](nintendo/CHANGELOG.md)；当前状态见
> [nintendo/STATE.md](nintendo/STATE.md)，发布流程见 [nintendo/RELEASE-RUNBOOK.md](nintendo/RELEASE-RUNBOOK.md)。

## 版本速览

| 版本 | 日期 | 功能主线 | 发布物 |
|---|---|---|---|
| `v0.2.0-beta.1` | 2026-10-25 | 第一个可用 beta：Electron 外壳、扫描、GBA/FC/SFC、封面 | 便携包 |
| `v0.3.2` | 2026-10-30 | 九台任天堂引擎矩阵：N64/Dolphin/NDS/3DS、系统菜单、键位面板、自动扫描 | 便携包 |
| `v0.4.0-beta.1` | 2026-11-01 | 自写 libretro 宿主（Wii Menu 去 UIA）+ Cemu/Wii U 接入 | 便携包 268 MB |
| `v0.4.1-beta.1` | 2026-11-03 | NDS/DSi 整条线、菜单插卡、设置拆分、GBA 金手指、Cemu 键位 | 便携包 264 MB |
| `v0.4.2-beta.1` | 2026-11-06 | PlayStation 三机接入：PS1 / PS2 / PSP + PSP 固件导入 | 便携包 328.5 MB |

---

## v0.4.2-beta.1 · 2026-11-06

**功能主线：PlayStation 从“界面占位”变成“可直读的三台主机”，并把 PSP 固件接入做成绿色方案。**

### PS1 直读（SwanStation / libretro）

- 内置 SwanStation libretro core，扫描 `.cue/.bin/.chd/.pbp/.mds/.ccd`，启动、抓帧、封面全链路
  （`766b5ad`、`cabe7d9`）
- PS1 BIOS 可选导入（512 KB 校验，缺省 OpenBIOS），落 `data/libretro/sys`
  （`766b5ad`）
- 宿主支持非 Dolphin core 的真实帧尺寸（PS1 640×478）和可缩放窗口，不再“小画面套大窗口”
  （`cabe7d9`）
- PS1 键位芯片接入 Nest 键位面板
  （`cabe7d9`、`87e7fc6`）

### PS2 直读（PCSX2 2.8.2）

- 内置 PCSX2，自带 VC++ 运行库，`-datapath` 隔离用户数据
  （`f76ec31`）
- `.iso` 扫描（`PLAYSTATION` magic 判定）、4 MB BIOS 导入、`-bios` 启动 PS2 浏览器
  （`f76ec31`）
- `PCSX2.ini` 的 `[Pad1]` 键盘键位适配，接入面板
  （`f76ec31`）

### PSP 直读 + XMB（PPSSPP master）

- 内置 PPSSPP（含 1.21 的 `--vsh` 能力），扫描 `.iso/.cso/.elf`，直读和 16:9 封面
  （`cc3be87`）
- `--vsh` 启动 XMB；缺固件时明确报 `missing-psp-firmware`，不静默失败
  （`cc3be87`）
- PPSSPP `controls.ini` 键位适配，PSP 芯片进入面板
  （`cc3be87`）
- **PSP 固件导入**：设置 → PlayStation 可直接选已解密的 `flash0` 目录，Nest 用 junction 接入；
  旧 flash0 会备份为 `flash0.before-import-*`
  （`67ecee4`）
- **打开 PPSSPP** 子入口：官方 EBOOT.PBP 仍需 PPSSPP GUI 安装一次，Nest 提供入口并自动识别同一个 memstick
  （`67ecee4`）
- 修复 PSP 说明/按钮误挂在 `.settings-cols` 外造成的右侧大空白
  （`eca7472`）

### PS 主机墙与设置

- PlayStation 家族解锁，PS1/PS2/PSP/PS3 配图、年代标尺、信息卡
  （`1854d1f`）
- PlayStation 设置改成与 Nintendo 一致的双栏布局：左系统文件 / 右键位
  （`b5f39c1`、`397854e`）
- PS1/PS2/PSP 键位芯片直接放进键位面板
  （`87e7fc6`、`b5f39c1`）

### 固件“绿色化”与发布

- PSP `flash0`、Cemu MLC 等用户数据放 `nest-assets`，引擎侧用 junction；打包清理只解链，不删源数据
  （`67ecee4`、`a5a464e`）
- 发布 0.4.2-beta.1 便携包
  （`f6e0f73`、`37d36f4`）

---

## v0.4.1-beta.1 · 2026-11-03

**功能主线：NDS/DSi 从“能启动”变成“整条线可用”，同时把设置拆成家族结构。**

### NDS / DSi 整条线

- 单个 NDS 入口 + DS / DS Lite / DSi / DSi XL 机型选择，四张插图
  （`bab6f1d`）
- DSi host 条目、DSi BIOS/固件/NAND 导入、TOML 纯函数模块与单测
  （`dc19b79`）
- 内置 melonDS master 构建，`-b always` 直开 DS 菜单，不再依赖 UIA；默认 2 倍窗口
  （`1244c8b`）
- DSi Menu 修通：保留 NAND 尾部 nocash footer，`[DSi] ExternalBIOSEnable` 写布尔 `true`
  （`ee6a4d4`）

### 系统菜单与性能

- 进入 DS/DSi 菜单时自动插入最近玩的 NDS 游戏（`-b always <rom>`），设置可关
  （`da0c334`）
- NGC 系统模式 UIA 提速：去掉固定 3 秒等待，spawn 到菜单约 2.8 秒
  （`0936124`）

### 设置 / 键位 / 金手指

- 设置拆分为 Nest / Nintendo / Xbox / PlayStation 四页
  （`9d6f2a7`）
- GBA 金手指面板：编辑 mGBA `.cheats`，支持 GameShark / Action Replay / CodeBreaker / PARv3
  （`d745dd8`）
- Cemu（Wii U GamePad）键位接入 Nest 面板
  （`cf1dd02`）

### 发布

- 发布 0.4.1-beta.1 便携包
  （`bb40c0f`）

---

## v0.4.0-beta.1 · 2026-11-01

**功能主线：用自写 libretro 宿主替代 Dolphin Qt+UIA 启动 Wii 系统菜单，并接入 Cemu/Wii U。**

### 自写 libretro 宿主

- 新增 `nest-libretro.exe`（C# + SDL3 + OpenGL），直接加载 `wii-menu.wad` 进 Wii Menu，不再走 UIA
  （`dafc8d2`、`08a618a`）
- Wii 鼠标绝对指针（`dolphin_ir_mode=2`），左键 = A
  （`1e304af`）
- 只保留一个 Wiimote 端口、锁窗口尺寸
  （`8c5c6c4`）
- Wii 输出铺满窗口（EFB 倍率 = 窗口倍数，640×480 表面）
  （`63f8f6f`）
- Wii 默认 4:3 原生输出（widescreen disabled / aspect auto）
  （`8e11797`）
- Wiimote 光标反向映射按屏幕录像标定（X 1/1.31、Y 1/2.48）
  （`339d011`、`854f6ad`）

### Cemu / Wii U

- 内置 Cemu 2.6，Wii U 扫描/直读，keys.txt 与 MLC 导入，Wii U Menu 入口
  （`7080570`）
- Wii U Menu 标记「实验性」，设置里 MLC 行加提示
  （`1249603`）

### 发布

- 发布 0.4.0-beta.1 便携包
  （`4a7b667`）
- 发布脚本与“双击 Nest.exe 为首选入口”的文档调整
  （`0aaad33`、`0e56ea0`）

---

## v0.3.2 · 2026-10-30

**功能主线：把“九台任天堂主机”的引擎矩阵补全，并做成可发布免安装包。**

### 引擎矩阵

- N64 接入 ares，FC/SFC/N64 合并为一个引擎
  （`1a7b2d9`）
- 内置 Dolphin（NGC/Wii），独立 user 目录，GC 光盘扩展名
  （`53bd5f8`）
- NDS 直读（melonDS 1.1，上屏封面）
  （`9c2b81c`）
- 3DS/Azahar 接入、系统模式、手柄默认键位、固件导入器
  （`ca89d72`）
- NDS 固件菜单：melonDS File → Boot firmware，两级 UIA + BIOS 导入
  （`097f1aa`）

### 系统菜单

- NGC 系统菜单：Dolphin GUI 自动化 + `nest-input` 助手（UIA 路线）
  （`434279f`）
- Wii 系统菜单：WAD 直接启动
  （`479ef15`）

### 键位 / 扫描 / 便携发布

- 应用内键位改键 UI + 分引擎 controls 模块；ares 键盘编码确认并启用
  （`0369de4`、`10617d5`）
- 启动自动重扫、`.cia` 与磁盘头判定、扫描设置
  （`7c5cb4f`）
- 免安装 zip / NSIS 配置、引擎配置清理
  （`8bbd76a`）
- 0.3.1 便携包（扫描修复、键位 UI、四引擎自动键位）
  （`7b9b2c6`）
- 0.3.2 发布与 README 重写
  （`a16a2cb`、`ebdd968`）

---

## v0.2.0-beta.1 · 2026-10-25

**功能主线：从零到第一个可发布的 beta。**

### 外壳与库

- Electron 外壳、IPC 契约、引擎清单、进程监管、首页
  （`b10888e`）
- 游戏库扫描、书架覆盖层、ROM 感知启动、自检
  （`5ac8da3`）

### 游戏与封面

- 内置 mGBA、真实 ROM trylaunch
  （`627e1ab`）
- 独立抓屏工具、自动封面、右键移除、运行中高亮
  （`dfd8229`）
- FC（FCEUX）/ SFC（bsnes）支持、分引擎封面裁剪
  （`4af3f7a`）

### 发布

- beta 0.2 发布：许可证、第三方声明、公开 README；MIT 许可证；CI typecheck/test/build
  （`40d1f01`、`2d075a5`、`e990475`）

---

## 探索性工作（不是功能更新）

下面这些内容有 commit、有任务记录，但**用户拿不到对应功能**，不能写进“新功能”：

### 手工拼装 Wii U MLC（`b7990f1`）

- 我们曾从任天堂 CDN 的系统 title 手工拼出一个 358 MB 的 MLC，Wii U Menu 能跑到 60 FPS，
  但卡在 Cemu 2.6 未实现的 `nn_act.LoadConsoleAccount`。
- **不是功能更新**：仓库和便携包都**不包含**这个 MLC，也不会替用户拼装。
  用户需要自备自己主机的 MLC dump；Nest 只做路径/目录导入。

### NGC GameCube Menu 的源码补丁与 CI 构建（`08a618a`、`16d1895`、`c94bf04`、`9a900f8`、`fff6a1a` 等）

- 我们研究过给 Dolphin 打补丁、让 libretro core 无内容启动 GC Menu，并搭过 CI 构建。
- **不是功能更新**：目前用户能用的 NGC 系统菜单仍是 **Dolphin Qt + UIA**；
  libretro 无内容启动路线没有成为默认入口。

### SwanStation 的输入修复实验（`140c764`、`86800b8`、`2a9e4f5`、`8eb5f7e` 等）

- 为了让 PS1 BIOS 菜单接受键盘输入，我们试过预置手柄、强制 DigitalController、改 CI 构建。
- **不是功能更新**：PS1 系统菜单输入仍无响应，入口保留但明确标记「故障」；PS1 直读不受影响。

### 发布/仓库工程（`0aaad33`、`7fef5d6`、`a7c8cbf`、`86163aa` 等）

- 通用发布脚本、HISTORY 文档、工作区归档、发布 runbook。
- 这些是维护工程，不是面向用户的功能；放在这里避免和“新功能”混在一起。

---

## 发布物对照

| 版本 | 便携包 | 大小 | 解压 | 文件数 | SHA256 |
|---|---|---|---|---|---|
| `v0.4.2-beta.1` | `Nest-0.4.2-beta.1-portable.zip` | 328.5 MB | 807.1 MB | 3597 | `A447EE2EF2581A7492FD61FB51DE11D4B1E8915CF00167EC7F80261C1B2D6402` |
| `v0.4.1-beta.1` | `Nest-0.4.1-beta.1-portable.zip` | 264 MB | 633 MB | 3171 | `0C38660097C310BCC296A4B051D09096E1591111B88314A4A1E4C4BAEE246308` |
| `v0.4.0-beta.1` | `Nest-0.4.0-beta.1-portable.zip` | 268 MB | 640 MB | 3172 | `235753F404CCFF3494D6A4C25861265C23B624F99BE5DAC4CA0DAD504D99CA22` |
| `v0.3.2` | `Nest-0.3.2-portable.zip` | 234 MB | 598 MB | 2905 | `B5AE4AF8DDAC53CADACA1C8E493864FC3C23C65E0EBD0702594452422646AFA1` |
| `v0.2.0-beta.1` | `Nest-0.2.0-beta.1-portable.zip` | — | — | — | — |

发布页统一在 [GitHub Releases](https://github.com/Parmetty/NEST-Emulator-Station/releases)。

## 维护约定

1. **以功能为骨架**：新版本先列用户能感知的功能组，每组后跟一组代表 commit；不要把整个
   `git log` 搬进来。
2. **探索性工作单列**：做过但用户拿不到、或只是研究/实验的，写进「探索性工作」并标注
   **不是功能更新**；不要和交付功能混排。
3. **发布物写清楚**：版本、日期、zip 大小、解压体积、文件数、SHA256、Release 链接。
4. **用户可见变化**仍写 [CHANGELOG.md](nintendo/CHANGELOG.md)；本文只回答“项目功能走到哪了”。
5. **旧文档迁移**：`docs/nintendo/HISTORY.md` 已改为指向本文的指针，避免两份历史分叉。
