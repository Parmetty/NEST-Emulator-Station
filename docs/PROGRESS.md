# Nest 开发进度与待办

> 更新于 2026-10-28（Asia/Shanghai）｜基线 `main @ 0d04026`｜版本 `0.2.0`，最新 tag `v0.2.0-beta.1`（`2d075a5`）
> 依据：`git log/show`、`docs/STATE.md`、`docs/PLAN.md`、`docs/DECISIONS.md`、`docs/RELEASE.md`、`README.md`、`resources/engines/*.json`、`src/shared/systems.ts`、`src/main/{ipc,index,scanner}.ts`、`resources/tools/*`

## 1. 一句话现状

一个 Electron「主机启动站」：扫描 ROM → 卡片墙 → 内置引擎子进程启动 → 退出回 Nest 并自动生成封面。
**GBA / FC / SFC / N64 全链路已验证可玩；NGC 直读已验证（真实 1.4 GB 镜像）；Wii 系统菜单可用（命令行直启 WAD）；NGC 系统菜单因缺命令行入口暂时搁置。**

## 2. 能力矩阵

图例：**已验证** = 有真实 ROM/镜像/系统文件的运行记录；**代码就绪** = 参数与路径已接但无真实内容验证；**未实现** = 只有清单。

| 主机（年） | 直读 | 系统模式 | 引擎 / 体积 | 结论 |
| --- | --- | --- | --- | --- |
| FC 1983 | ✅ 已验证 | — | ares v148 / 42.6 MB | 可玩 |
| SFC 1990 | ✅ 已验证 | — | ares v148 / 42.6 MB | 可玩 |
| N64 1996 | ✅ 已验证 | ✖ 未实现（64DD IPL 只是设想） | ares v148 / 42.6 MB | 可玩 |
| GBA 2001 | ✅ 已验证 | —（BIOS 动画随游戏走） | mGBA 0.10.5 / 41.5 MB | 可玩 |
| NGC 2001 | ✅ 已验证（`GVCJ08` 日版 1.4 GB `.gcm`） | ⏸ 搁置（UIA 方案已撤） | Dolphin 2609a / 57.0 MB | 直读可玩 |
| Wii 2006 | 🟡 代码就绪、未验证（无真实镜像） | ✅ 已验证：`-b -e wii-menu.wad` | Dolphin 2609a / 57.0 MB | 系统菜单可用 |
| NDS 2004 | ✖ 未接（melonDS 未随包） | ✖ 未实现 | 仅清单 | 未验证 |
| 3DS 2011 | ✖ 未接（Citra 未随包） | ✖ 未实现 | 仅清单 | 未验证 |
| Wii U 2012 | ✖ 未接（Cemu 未随包） | ✖ 未实现（`-b` 未验证） | 仅清单 | 未验证 |
| Xbox / 360、PS1/2/PSP/PS3 | ✖ 锁定预留 | — | 仅清单 | 未验证 |

- 内置引擎合计 **141.2 MB**（mGBA 41.5 + ares 42.6 + Dolphin 57.0）；另有 9 份仅探测清单 + `fake` 测试引擎，共 13 份。
- 9 台任天堂主机全部在 `SYSTEMS` 中，6 台 Xbox/PS 预留平台标记 `locked`。

## 3. 本期完成（自 `v0.2.0-beta.1`）

| 提交 | 一句话 |
| --- | --- |
| `0d04026` | 托管 Dolphin `SkipIPL`，直读不再依赖 IPL（修复日版游戏报「找不到 GC IPL」）；撤下 NGC 的 UIA 入口 |
| `c8eb45d` | 新增本文件；修 5 处文档漂移 |
| `479ef15` | Wii Menu 走 WAD 命令行直启（零打扰）；UIA 助手加防护；清单支持 `systemArgsBySystem` |
| `434279f` | NGC 系统模式用 GUI 自动化打通（`nest-input` + `systemBoot`）——后已搁置 |
| `0f0f1dd` | `.gitattributes`：引擎载荷进 git 后字节不变 |
| `53bd5f8` | 内置 Dolphin 2609a（57 MB）；`-u` 隔离用户目录；GC 光盘扩展名映射 |
| `ee8f6b8` | 修 `DEV_RUN` 单实例锁绕过判断 |
| `a7719d2` | RELEASE 增补“引擎配置会泄漏本地路径”检查项 |
| `bc9e800` | 清掉 ares `settings.bml` 里的本地路径 |
| `abfd7ef` | 单实例锁 + 窗口立即显示（评审采纳，D17/D18） |
| `1a7b2d9` | N64 接入；FC/SFC/N64 合并到 ares；界面显示引擎名 |
| `1fe11eb` | 修启动事件设置的 toast 永不消失 |

## 4. 技术要点

1. **引擎即数据**：`resources/engines/<id>.json` + zod 校验；`{rom}` / `{userData}` / `{engines}` 占位符、`cwd`、`detect`、能力全在清单里（D1）。
2. **进程外运行**：模拟器永远是子进程，事件 `starting / running / exited / crashed`；封面在退出时生成（D15）。
3. **封面用独立抓屏工具**：`nest-capture.exe` 周期抓客户区，按清单 `captureAspect` / `captureAnchor` 裁 chrome，退出时把最新帧提升为封面。
4. **系统模式能命令行就命令行**：Wii 用 `-b -e wii-menu.wad`；只有 GUI 入口的才做自动化，且不进入默认路径。
5. **会话结束判定**：Dolphin 启动器进程关游戏后常驻，system 模式用 `nest-window.exe` 监视“渲染窗口出现→消失”。
6. **数据隔离**：Dolphin 一律 `-u {userData}/dolphin`；mGBA/ares 是便携模式，配置写在引擎目录。

## 5. 待办（按阶段）

### P2 收尾
- **DAT 匹配（No-Intro SHA-1）与标题修正**。验收：已知样本与 DAT 一致；未命中保留文件名清洗结果并标“未匹配”。
- **每游戏覆盖设置**。验收：可按 `gameId` 覆盖分辨率/键位，未配置回退全局。
- **存档备份 / 统一存档**。验收：退出后 `.sav` 自动备份到 userData 且可按 `gameId` 还原。
- **固件校验提示**。验收：缺 BIOS/固件时分步指引，而非静默失败。

### P3（NGC / Wii）
- **Wii 直读端到端验证**。验收：真实 `.wbfs`/`.iso` 启动成功并生成封面。
- **IPL / WAD 导入引导**。验收：UI 检测 `<userData>/dolphin/wii-menu.wad`（及可选 IPL），缺失时给路径与分步指引。
- **NAND 导入向导与体检**。验收：导入 NAND 后能开机进 Wii Menu 并返回。
- **NGC 系统菜单（可选）**：需 Dolphin 命令行入口，见 §6-UIA-1。

### P4（Wii U）
- **Cemu 适配**：MLC / keys 导入、Wii U Menu、更新与 DLC 路径识别。

### P5（打包与交付）
- 修 asar 下的抓屏路径（`process.resourcesPath`）。
- `electron-builder` + `extraResources`（`engines/`、`tools/`）。
- 打包前清本地路径；引擎目录可写性方案；未签名说明；NSIS 安装包 + 干净机冒烟。

---

## 6. 不足与问题清单（附预解决方案）

> 严重度：**S1 阻断发版 / S2 影响体验或正确性 / S3 技术债 / S4 长期**

### 引擎与系统模式

**UIA-1｜NGC 系统菜单不可用**（S2）
现象：Dolphin 没有 GC 主菜单的命令行入口；UIA 走 GUI 菜单，实测**又慢又不可靠**，且菜单展开会抢鼠标键盘。现已撤下入口。
预方案（择一）：
- **A（推荐，若坚持要）**：fork Dolphin 加 `--gc-main-menu=<region>`，用 GitHub Actions 出 Windows 包（改动约 30 行，需公开补丁以合 GPL）。
- B：等上游接受 PR。
- C：不做，只保留直读（当前状态）。
成本：A 约半天到一天（CI 首次构建较慢）。

**ENG-2｜Dolphin 依赖随包 VC++ 运行库**（S1，发版相关）
现象：本机 `System32\msvcp140.dll` 是 14.11（被其他软件覆盖），Dolphin 启动即 `0xC0000005`。
现状：已把 14.51 的 4 个 DLL 随包放在 `Dolphin.exe` 旁。
预方案：保留随包 DLL + `THIRD-PARTY-NOTICES` 说明；安装包校验 DLL 存在；不修改系统。

**ENG-3｜Dolphin 配置篡改风险**（S2）
现象：`ensureDolphinConfig()` 每次启动强制 `SkipIPL=True`，会覆盖用户在 Dolphin 界面里打开的 IPL 选项。
预方案：把“播放 IPL 开机动画”做成 Nest 设置项，由设置决定写入值；仅在值变化时写文件，并记录 nest.log。

**ENG-4｜mGBA / ares 便携配置写引擎目录**（S2，发版相关）
现象：装到 `Program Files` 时配置/存档写不进去（mGBA 的 `config.ini`、ares 的 `settings.bml`）。
预方案：首次运行把内置引擎复制到 `%APPDATA%\Nest\engines\`，一律从用户目录启动；安装目录只读也可用。

**ENG-5｜引擎数量与体积**（S3）
现状：3 个引擎 141.2 MB，仓库 88.6 MiB。
预方案：短期接受；中期把 `resources/engines` 转 Git LFS 或改为首次运行下载（牺牲开箱即用）；长期看是否能用一个多系统引擎再省一台。

**ENG-6｜License 合规**（S1）
现状：Dolphin（GPLv2+）随包 + Qt LGPLv3 DLL；mGBA（MPL2）、ares（ISC）。
预方案：`THIRD-PARTY-NOTICES` 完整保留来源、许可、改动说明；发布页附源码链接；若魔改 Dolphin 必须公开补丁。

### 封面

**COV-1｜抓屏依赖窗口可见**（S2）
现象：最小化/被遮挡/切走时不抓帧，短于一个周期的会话没有封面。
预方案：优先接引擎原生截图（mGBA `F12`→文件、Dolphin 截图热键）；退而求其次用 DWM 缩略图抓取（不要求前台）。

**COV-2｜封面可能取到黑屏/过场**（S2）
现象：取“退出前最后一帧”，遇到黑屏过场或菜单就是一张黑图。
预方案：在会话内保留若干帧并做**非内容启发式**的选择（例如取“最后一次画面显著变化的帧”），或让用户手动“重新截取封面”。

**COV-3｜裁剪参数靠人工实测**（S3）
现象：`captureAspect` / `captureAnchor` 每个引擎手工量。
预方案：加一个 `nest-probe` 工具输出窗口尺寸/客户区/建议裁剪值，并在清单注释里记录测量日期。

### 扫描与元数据

**SCN-1｜只按扩展名识别**（S2）
现象：`.iso` 歧义（GC/PS2），`.rvz`/`.wbfs` 可能 GC/Wii 混用。
预方案：读镜像头部（disc magic + game id 第 4 位区域）做二次判定；解析失败再回退扩展名。

**SCN-2｜无 DAT 匹配、标题只清洗文件名**（S2）
现象：`pokemon-firered-cn` 这类文件名直接当标题；同游戏多版本无法归组。
预方案：引入 No-Intro DAT（按 SHA-1），未命中时保留清洗结果并标注。

**SCN-3｜重复检测仅 sha1**（S3）
现象：同内容不同文件名的多份拷贝会各占一条（upsert 按 sha1 去重，实际已缓解）；但不同 region 被视为不同游戏。
预方案：以 `gameId`（GC 镜像头）或 DAT 条目归组，UI 显示“多版本”。

### 输入与交互

**INP-1｜键位映射缺失**（S2，用户明确提过）
现象：只能用引擎默认键位；WASD 之类改动要手动改配置文件。
预方案：Nest 内键位面板 → 每引擎适配器写入（mGBA `[gba.input.QT_K]` / ares BML / Dolphin `GCPadNew.ini`）。难点：三套键码体系、引擎快捷键抢键、只读安装目录（依赖 ENG-4）。建议分期：mGBA → ares → Dolphin。

**INP-2｜无手柄支持与纯键盘导航**（S3，P5）
预方案：SDL/Web Gamepad API + 焦点框架；先支持原生手柄（mGBA/ares/Dolphin 自带），再做 Nest 导航。

**INP-3｜`nest-input.exe` 键盘路径实际不可用**（S3）
现象：Windows 前台锁导致后台置前失败，按键可能落到别的窗口。
预方案：删除该助手，或仅保留“用户已把引擎窗口点在前台”的场景；不再作为系统模式默认方案。

### 稳定性与诊断

**OPS-1｜错误提示不友好**（S2）
现象：引擎缺失/文件缺失只有一行 toast，无分步指引。
预方案：引擎页展示检测状态（路径/版本/首页链接）+ “如何安装”折叠指引；启动失败给具体原因与下一步。

**OPS-2｜崩溃信息收集不足**（S3）
现象：引擎崩溃只拿到退出码；Dolphin 的 `dolphin.log` 不会自动附上。
预方案：崩溃时打包 `nest.log` + 引擎日志 + 版本信息到一个“诊断”文件夹，提供“复制诊断信息”按钮。

**OPS-3｜测试覆盖偏单元**（S2）
现状：16 条 vitest（扫描/清单/参数/进程生命周期），无 IPC 与 UI 自动化。
预方案：补 `ipc` 层测试（fake engine 已具备）；可选 Playwright for Electron 做冒烟。

**OPS-4｜日志会无限增长**（S3）
预方案：启动时按大小轮转（如 >2 MB 归档一份）。

### 打包与发布

**PKG-1｜asar 路径**（S1）：`captureToolPath()` 打包后指向 `app.asar` 内部，无法执行。→ 改 `process.resourcesPath`。
**PKG-2｜extraResources 未配置**（S1）：`engines/`、`tools/` 必须走 `extraResources`。
**PKG-3｜本地路径泄漏**（S1）：ares `settings.bml` 的 `Path:/Recent`、mGBA `qt.ini` 的窗口位置/MRU（已踩过三次）。→ 打包前脚本清理 + CI 检查。
**PKG-4｜未签名**（S2）：SmartScreen 拦截。→ 文档说明，或购买 OV/EV 证书。
**PKG-5｜无自动更新**（S4）：→ `electron-updater` + GitHub Releases（需签名才干净）。
**PKG-6｜无安装包与干净机冒烟**（S1）：按 `RELEASE.md` §10 清单执行。

### 文档与流程

**DOC-1｜文档漂移反复出现**（S2）
现象：README/STATE/PLAN 多次与代码不一致（引擎名、验证状态、测试数）。
预方案：本文件作为单一事实源；每次改代码同步 §2/§5；可选加一个脚本检查“README 声明的引擎/数量”与 `resources/engines` 是否一致。

**DOC-2｜版本号与 tag 落后**（S3）
现状：`package.json` 还是 `0.2.0`，tag 停在 `v0.2.0-beta.1`，但已合入 P2/P3 大量功能。
预方案：出第一个安装包时 bump 到 `0.3.0` 并打 tag（发布流程见 RELEASE §8）。

## 7. 已知限制（合规与事实）

- **版权物一律用户自备**：GC IPL（需 CRC32 在白名单）、Wii System Menu WAD；均不进仓库、不随包。
- **未签名**：首次运行会被 SmartScreen 拦一次。
- **存档跟 ROM 走**：mGBA 的 `.sav` 写在 ROM 旁，移动/删除 ROM 会丢档。
- **封面依赖窗口可见**：最小化/后台不抓。
- **NGC 系统菜单不可用**：见 UIA-1。

## 8. 下一步建议（按投入产出排序）

1. **P5 打包最小闭环**（PKG-1/2/3 + `dist:dir` + 冒烟）——目前所有“已验证”都发生在源码态，141 MB 引擎的随包路径、许可、VC++ DLL、引擎写盘只有打包后才暴露。
2. **ENG-4 引擎目录可写性**（复制到 `%APPDATA%`）——打包前必须定，否则装到 Program Files 会写不进去。
3. **COV-1 封面改引擎原生截图**——比现在的“后台救火”更稳，且顺带解决 alt-tab 丢封面。
4. **INP-1 键位面板（先 mGBA）**——用户明确提过，且是“不像套皮”的关键差异点。
5. **SCN-2 DAT 匹配**——让标题和封面看起来像正经游戏库。

---

## 附录 · 2026-10-29 合并 10.28 分支后的变化

| 主机 | 直读 | 系统模式 | 引擎 |
| --- | --- | --- | --- |
| NGC | ✅ | ✅ **GameCube Menu**（UIA 精确路径，需自备 IPL） | Dolphin 2609a |
| Wii | 🟡 未验证 | ✅ Wii Menu（-b -e wii-menu.wad，缺 WAD 回退 -n） | Dolphin 2609a |
| 3DS | ✅ 自制 .3dsx 已验证（商业镜像未测） | ✖ 无（Azahar 不支持 HOME Menu） | Azahar 2126.2（101.8 MB） |

- 内置引擎 **4 个 / 242.9 MB**；N 台主机里 GBA / FC / SFC / N64 / NGC / 3DS 已验证可玩。
- **固件导入入口**：设置 →「系统文件（自备）」，选择 IPL / WAD，导入时校验 CRC32（GC IPL 白名单）并落到 %APPDATA%\Nest\dolphin；界面显示「已就绪 / 校验未通过 / 未导入」。
- **键位**：mGBA / Dolphin / Azahar 首次启动写入统一布局（WASD + 空格/J/K/L + 方向键 + TGFH），已自定义不覆盖；手柄由 
est-pads.exe（SDL3）检测后切 SDL 绑定。
- **NDS / Wii U** 系统模式入口已撤（引擎未随包）。

### 仍未解决

1. **ares 键盘绑定**：settings.bml 键盘设备 ID 未知 → FC/SFC/N64 仍只能用/手柄或手动绑定（需一次 GUI 绑键 + diff 实验）。
2. **Azahar GPLv3 合规**：只随包 LICENSE，发布需附源码链接或书面要约。
3. **3DS 商业镜像 / DSP 固件 / 手柄按键** 未验证。
4. **打包链路**（asar 路径、extraResources、本地路径清理）仍未做。
5. **3DS 封面**：窗口画幅比游戏宽，封面两侧带黑边（卡片用裁切填满，暂可接受）。