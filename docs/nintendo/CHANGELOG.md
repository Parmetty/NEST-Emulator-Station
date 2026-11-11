# 更新日志

本文件记录每次发布的可见变化。技术细节在 `docs/nintendo/STATE.md`，决策理由在 `docs/nintendo/DECISIONS.md`，待办在 `docs/nintendo/PROGRESS.md`。

## 0.6.0-beta.1 — 2026-11-12 · Xbox 初代接入 + 库增强

便携包：Nest-0.6.0-beta.1-portable.zip 624.5 MB（654,846,078 字节）（解压 1362.4 MB / 4726 个文件，SHA256 `02101ADA5411EF63F497B8C06D9D5D7ABF03489E9BF4B00153BF8844997FF8B8`）

本版补齐 Xbox 家族最后一台主机：**初代 Xbox（xemu 0.8.139）直读**，文件夹游戏可一键打包成 XISO；
同时把游戏库从「文件名」升级到「官方标题 + 区域」自动识别，新增自定义封面，PS3 渲染器可选。

### 新增

- **Xbox 初代接入（xemu 0.8.139）**：内置 `resources/engines/xemu/`（GPLv2），主机墙 Xbox 状态 ready
- 扫描：XISO（XDVDFS 魔数 `MICROSOFT*XBOX*MEDIA`）、`.xbe`、含 `default.xbe` 的文件夹
- 设置 → Xbox 导入三件套：MCPX（512 B）、BIOS（256 KB；1 MB 四连体 dump 自动取第一段）、
  HDD（qcow2，`QFI` 头校验，只记路径不复制）
- 启动：自动写便携 `xemu.toml`，并显式补 `-bios`（xemu 0.8.139 不自己读 `flashrom_path`）
- **文件夹游戏 → XISO**：右键「打包为 XISO…」弹保存对话框（默认输出在游戏文件夹同级、同名 `.iso`），
  内置 `extract-xiso`；直接启动文件夹游戏也会自动打包；启动前硬链接到无空格路径
  （xemu 的 QEMU 参数会把带空格路径截断）
- 扫描器去重：打包后不会同时出现「文件夹 + ISO」两条记录
- PS3 渲染器可选 **Vulkan / OpenGL**（默认 OpenGL，Crysis 3 兜底）：启动写入 `[Video] Renderer`；
  切换渲染器只改配置，不删另一渲染器的预编译缓存
- 设置 → PlayStation 新增「打开 PS3 预编译缓存位置」
- **游戏库标题 + 区域自动识别**：NDS / GBA / N64 / NGC / Wii / PS3（`PARAM.SFO`）/
  Xbox（XBE 证书，XISO 内也能读）/ Xbox 360（STFS 显示名）；卡片显示区域标签；手动重命名不被覆盖
- **自定义封面**：右键「自定义封面…」/「恢复自动封面」；设置后自动截图不再覆盖
- 固件区域标签：PS1（`scph55xx`）、PS2（`SCPH-xxxxx`）、Wii WAD 按 dump 名标注
- 设置窗口左下角新增 **「关于 Nest」**：LOGO + 版本 + 产品定位 + GitHub 地址 + 全部引擎鸣谢
- 文档：新增 `docs/xbox/ENGINE-xemu.md` 与 `docs/nintendo/RELEASE-0.6.0-beta.1.md`；
  README / ROADMAP / HISTORY / Xbox 下载清单同步

### 修复

- **键位面板切换菜单不刷新**：xemu 之前没被算作 Xbox 家族，进 Xbox 菜单后键位面板仍显示上一台主机的键位
- **Xbox 360 占位标题**：`4D530AA4` 这类 GOD 目录名不再冒充游戏名，优先读 STFS 显示名
- **便携包清理**：新增剔除 xemu 运行时（`xemu.toml` / 日志 / `eeprom.bin` / shaders），zip 不带本机路径

### 已知问题

- **xemu 无键盘映射**：xemu 0.8.139 只认 SDL 手柄，键位面板暂不覆盖 Xbox，需插手柄
- **系统菜单需要 Dashboard**：HDD 镜像里没有 Dashboard 就进不了初代 Xbox 系统菜单（直读不受影响）
- **xemu 只能读镜像**：不认解包文件夹，必须打包成 XISO（Nest 已内置手动打包与自动打包）
- 沿用 0.5.0 的限制：PS3 / Crysis 3 随机超时断言、PS3 无 XMB、Xbox 360 无 Dashboard、Wii U Menu 实验性
- 测试基线：**147 条单测全绿**（0.5.0 为 118 条；新增 Xbox 固件/打包、游戏标题区域、自定义封面等用例）
- 实机验证：Halo 2（美版中文）经 xemu 进入标题画面并通过 Nest 启动；Steins;Gate 0 在 RPCS3 正常运行
## 0.5.0-beta.1 — 2026-11-09 · Xbox 360 + PS3 接入

便携包：Nest-0.5.0-beta.1-portable.zip 613.1 MB（解压 1334.7 MB / 4723 文件，SHA256 `BCE9A9B264EAC8BE351CB4EEFF4790DEBA9F5CAD09AA4F4EA53E80FF917B6BD2`）

本版补上两条新家族主线：**Xbox 360（Xenia Canary）直读**与 **PS3（RPCS3 0.0.43）直读**，
并修掉键位面板「设了但游戏里没反应」的老问题；游戏库支持右键重命名，Xbox 家族主机墙一并解锁。

### 新增

- **Xbox 360 接入（Xenia Canary）**：内置 `resources/engines/xenia/`，直读 GOD / ISO / XEX；
  GOD / STFS 目录扫描（`00007000/<hash>.data` + LIVE 头）
- 启动时的免责声明由 `nest-dialog.exe`（UIA）自动点「否」（绝不点「是」）；
  封面抓取裁掉任务栏（`captureFitWorkArea`）；退出监视走 `nest-window.exe --render-title Xenia-canary`
- **PS3 接入（RPCS3 0.0.43）**：内置引擎核心 + seed 配置（固件 / 用户数据不进仓库与发布包）；
  扫描 `PARAM.SFO + USRDIR`（兼容 `PS3_GAME/...`）；直读 `rpcs3.exe --no-gui <游戏目录>`；
  默认窗口化，seed 配置固定 `Renderer: OpenGL`
- 键位面板新增 **Xbox 360** 与 **PS3** 芯片（Xenia 写 `xenia-canary.config.toml` 的 `[HID.Key]`；
  PS3 写 `config/input_configs/global/Default.yml`）
- **游戏库右键重命名**：只改 Nest 库里的显示名，不动磁盘文件；GOD 的 `4D530AA4` 这类占位标题可手动改
- **Xbox 家族主机墙解锁**（Xbox / Xbox 360）
- Xbox 360 首次需要档案：游戏弹 `No Profiles` 时点 `SIGN IN` → `Create Profile` → 输入 Gamertag（用户一次性设置）
- 文档：新增 `docs/BUILD-PORTABLE.md`；更新 RPCS3 与 Xbox 文档；重建 `docs/README.md` 索引

### 修复

- **Xbox 360「面板里设了、游戏里没反应」**：Xenia 默认 `[HID] keyboard_mode = 0`（键盘禁用），
  `[HID.Key]` 全部能解析但送不进游戏；适配器写键位时强制 `keyboard_mode = 1`（并保持 `keyboard_user_index = 0`）
- **Xbox 360 方向键不能转向**：方向键同时写 D-Pad 与左摇杆（`keybind_left_thumb_*`），赛车 / 射击类能用
- **PS3 方向键不能转向**：同样双写 D-Pad 与 `Left Stick Up/Down/Left/Right`
- **PS3 渲染器**：seed 固定 `Renderer: OpenGL`——Vulkan 下 Crysis 3 每轮约 70 秒必崩
- **PS3 seed 配置**：删掉 RPCS3 0.0.43 拒绝的 `Input/Output: Keyboard` 行，删掉 `Emulated Midi devices` 乱码行
- **文档编码损坏**：2026-11-08 用 PowerShell 5.1 批量改 docs 导致 6 份 Markdown 编码损坏且不可恢复，已删除；
  重建 `docs/README.md` 索引，记录见 `docs/archive/README.md`

### 已知问题

- **PS3 / Crysis 3 随机超时断言**：游戏自身的 RenderThread 等待超时后 `abort()`（`0x0144517c`，预算约 0.8 秒），
  随机触发、调参不可根治；RPCS3 只是照执行，不是固件或兼容性列表问题。细节见 `docs/playstation/ENGINE-rpcs3.md`
- **Xbox 360 无 Dashboard / 系统菜单**：Xenia 不支持，只做直读
- **PS3 无 XMB / 系统模式**：RPCS3 不模拟 XMB，只做直读；固件（`dev_flash`）需自备
- **初代 Xbox（xemu）未接入**：主机墙已就位，引擎待 P7.1
- 测试基线：**118 条单测全绿**

## 0.4.2-beta.1 — 2026-11-06 · PlayStation 三机接入 + PSP 固件导入

便携包：Nest-0.4.2-beta.1-portable.zip 328.5 MB（解压 807.1 MB / 3597 文件）
SHA256 A447EE2EF2581A7492FD61FB51DE11D4B1E8915CF00167EC7F80261C1B2D6402

本版把 PlayStation 从「界面就绪」推进到 **PS1 / PS2 / PSP 三机可直读**：PS1 走 SwanStation（libretro），
PS2 走 PCSX2，PSP 走 PPSSPP；PS 键位面板、BIOS/固件导入和 PSP XMB 入口一并落地。PS3 继续后置。

- 文档重构：任天堂系全部文档移入 `docs/nintendo/`（含 evidence / mock-v1 / patches），
  新增 `docs/playstation/PLAN-PLAYSTATION.md` 与总路线 `docs/ROADMAP.md`
- 原 `PLAN.md` 标注为历史计划并回填实际完成情况；路线图改为「任天堂收尾 + PlayStation 主线 + Xbox 预留」
- P6.0 调研完成：PPSSPP / PCSX2 / RPCS3 / SwanStation 的许可、便携模式、CLI、镜像格式与系统模式入口
  （PS1 用 SwanStation 替代 DuckStation、PS2 BIOS 浏览器、PSP XMB 需 1.21+、PS3 无 XMB）写入 `docs/playstation/RESEARCH-P6.0.md` 与 ENGINE 文档
- PS1 主选改为 **SwanStation**（GPLv3、DuckStation hard fork、libretro core、OpenBIOS 兜底、可随包）；DuckStation 因 CC BY-NC-ND 降级为用户自装可选
- PS3 系统模式结论：无 XMB 也无替代，只做直读；如需展示用 Nest 原生游戏库视图（不冒充系统界面）
- **PlayStation 主机墙界面就绪**：解锁 PlayStation 家族，PS1/PS2/PSP/PS3 四台主机配图（PS1/PS2/PS3 为 Evan-Amos 公有领域照片，PSP 为 CC BY-SA 3.0）、年份与年代标尺；引擎未接入显示「需要配置」并给出计划说明
- README 修正 0.4.1 便携包的 SHA256/解压体积（旧值停留在 0.4.0）
- **3DS HOME Menu 入口恢复**：之前从 Citra 换 Azahar 时因“Azahar 不支持 HOME Menu”被删；现在按源码核实（`Boot Home Menu` → `BootGame(ncch)`）恢复为实验性入口
- 3DS 系统模式启动前扫描 Azahar `nand/<SYSTEM_ID>/title/00040030/<region>/content/*.app`，缺失时明确提示用 Artic Setup Tool 安装系统文件
- 新增 `docs/playstation/DOWNLOADS-PS1-PS2.md`：PS1/PS2 需要的 BIOS、镜像格式与坑
- **PS1 直读接入（SwanStation / libretro）**：内置 `swanstation_libretro.dll`，复用自写宿主；扫描 `.cue/.chd/.pbp/.mds/.ccd`
- 宿主适配：非 Dolphin core 自动把窗口匹配到核心输出的真实帧尺寸（PS1 640×478），不再出现“大窗口里左下角小画面”
- 设置 → PlayStation：PS1 BIOS 导入（512 KB 校验，落到 `data/libretro/sys`，可选，缺省 OpenBIOS）
- 实测：FIFA Soccer 2005 (USA) `.cue` 经 Nest 扫描 → 启动 → 封面抓取全链路通过（59 fps）
- 宿主渲染：非 Dolphin core 改为**可缩放窗口**（默认 1024×768，按核心宽高比 letterbox 缩放），不再出现固定小窗口/大黑边
- PS1 键位接入 Nest 键位面板：新增 SwanStation 引擎 + PS1 芯片，默认方向键 / J/K/U/I / Q/E / Enter / Backspace，启动时用 `--keys` 传给宿主
- 主机墙：PlayStation 排到 Xbox 前面；所有家族默认折叠
- PSP 设置新增「PSP 固件（flash0）」导入：可直接选已解密的 flash0 目录，Nest 用 junction 接入；并提供「打开 PPSSPP」子入口供官方 EBOOT.PBP 安装
- **PSP 接入（PPSSPP master）**：内置 PPSSPP（含 1.21 XMB 功能）、`.iso/.cso/.chd/.pbp/.elf` 扫描、`--vsh` 系统模式、PPSSPP 键位适配（`controls.ini`），缺 PSP 固件时明确提示
- **PS2 接入（PCSX2 2.8.2）**：内置 PCSX2（含 VC++ 运行库，避免旧运行库弹窗）；`-datapath` 隔离数据；PS2 BIOS 导入（4 MB 校验）；`-bios` 系统模式 = PS2 浏览器；扫描 `.iso`（PLAYSTATION 标记）
- PS2 键位接入 Nest 面板（`PCSX2.ini` 的 `[Pad1]`，`Keyboard/` 绑定写入）
- PS1 系统模式：SwanStation 无游戏启动会进入 BIOS 开机菜单（实测约 20 秒到达 MAIN MENU；需自备 BIOS，OpenBIOS 可兜底）
- 键位面板补全：PlayStation 设置页改成和 Nintendo 一致的双栏布局（左系统文件 / 右键位），PS1/PS2 芯片直接作为子主机键位入口；删掉重复的「子主机键位」区块，BIOS 标签去掉冗余说明
- 无游戏时用带 PLAYSTATION 标记的假 ISO 验证了「扫描 → 启动 → 进程」链路

## 0.4.1-beta.1 — 2026-11-03 · NDS/DSi 整条线 + 设置拆分 + GBA 金手指

便携包：Nest-0.4.1-beta.1-portable.zip 264 MB（解压 633 MB / 3171 文件）
SHA256 0C38660097C310BCC296A4B051D09096E1591111B88314A4A1E4C4BAEE246308

### NDS / DSi 系统模式插卡

- 进入 NDS/DSi 系统菜单时自动把**最近玩过的 NDS 游戏**插入 Slot-1（`melonDS -b always <rom>`），菜单能识别游戏卡并直接启动
- 设置 → Nintendo 新增开关「NDS / DSi 系统菜单插入最近游戏」，关掉则保持空卡槽
- 选择逻辑抽成 `src/main/nds-cart.ts`，单测覆盖显式 ROM / 开关 / 最近游戏 / 空库

### 设置拆分（Nest / Nintendo / Xbox / PlayStation）

- 设置窗口左侧新增分类导航：**Nest**（启动与画面、游戏文件夹）、**Nintendo**（系统文件、键位）、
  **Xbox** / **PlayStation**（预留页，列出待接入机型）
- 任天堂相关的系统文件与键位集中到 Nintendo 子页，后续 PS/Xbox 引擎接入时各自独立

### GBA 金手指

- GBA 游戏卡右键菜单新增「金手指…」：直接编辑 mGBA 的 `.cheats` 内容
- 默认写入 ROM 旁的 `<游戏名>.cheats`（mGBA 启动自动加载）；ROM 文件夹只读时回退到 Nest 数据目录并用 `-c` 传入
- 支持 GameShark / Action Replay / CodeBreaker / PARv3 纯文本格式
- 文档 `docs/nintendo/CHEATS-GBA.md`；单测覆盖路径、规范化、只读回退与启动参数
- 键位面板新增 Cemu（Wii U GamePad）键盘绑定

### Cemu（Wii U）键位接入面板

- 设置 →「键位」新增 **Wii U**，可改 Cemu 的 Wii U GamePad 键盘绑定
- 写入 `portable/controllerProfiles/controller0.xml`（Cemu 的键盘 API + Windows VK 码），
  并确保 `settings.xml` 的 `ControllerProfiles` 为 true
- 已有手配 profile 不会被启动覆盖；键位面板保存时才重写并保留 `.before-nest` 备份
- 映射表见 `docs/nintendo/KEYS-CEMU.md`（按钮 ID 来自 Cemu 源码 `VPADController.h`）
- 单测新增 6 条（渲染/解析/自定义保留/强制覆盖/settings 开关），总计 **89**

### NDS / DSi 机型（DS / DSL / DSi / DSiLL）

- 主机墙保持一个 **NDS** 入口；右下信息卡拆成两组机型：**DS / DSL** 与 **DSi / DSiLL**，
  切换机型会同时切换插图（NDS、NDS Lite、DSi、DSi XL 四张）与年份
- **NDS 系统模式改为命令行 `melonDS.exe -b always`**，不再依赖 UIA 菜单自动化
  （melonDS 1.1 的 `preloadROMs` 缺少 `&& !boot`，无 ROM 时直接 return，只能停在欢迎页；
  该问题在 master 已修复，因此内置引擎换成 master CI 构建 `1e65444`，2026-10-27）
- **DSi / DSiLL 系统模式可用**：melonDS 支持引导 DSi Menu，前提是
  ① NAND 保留末尾 64 字节 nocash footer（`DSi eMMC CID/CPU`），② `[DSi] ExternalBIOSEnable` 写成布尔 `true`
  （写成整数 1 会被当成 false，回落到 FreeBIOS 后黑屏）
- DSi 模式除 `[DSi]` 四条路径外，还需同时写入 `[DS]` 三条路径（melonDS 启动时仍会加载 DS boot ROM）
- melonDS 默认窗口从 256×384 调到 **512×768（2 倍等比例，整数缩放）**
- **NGC 系统模式的 UIA 提速**：去掉启动前固定的 3 秒等待，改为窗口/菜单栏就绪后立即操作，
  轮询间隔 500ms→120ms；实测从 spawn 到点中菜单约 2.8 秒（原先 5 秒以上），不再有「卡住」感
- 机型选择存进设置（`settings.ndsModel`）；启动 NDS 游戏 / 系统菜单时按机型写
  melonDS `ConsoleType`（DS/DSL=0，DSi/DSiLL=1）
- 设置 →「系统文件（自备）」新增 **DSi BIOS + 固件 + NAND** 导入：选目录，校验
  bios7/bios9 64 KB、firmware 128 KB、nand 0xF000000；导入时保留真实 dump 尾部
  64 字节 eMMC CID 元数据（nocash footer），不再裁剪
- melonDS TOML 管理抽成纯函数 `src/main/melonds-config.ts`，新增 12 条单测（总计 80）
- 新插图：DS Lite（公有领域）、DSi / DSi XL（CC BY-SA 3.0，Evan-Amos，见 THIRD-PARTY-NOTICES）

## 0.4.0-beta.1 — 2026-11-01 · 自写 libretro 宿主 + Wii U（Cemu）接入

便携包：Nest-0.4.0-beta.1-portable.zip 268 MB（解压 640 MB / 3172 文件）
SHA256 235753F404CCFF3494D6A4C25861265C23B624F99BE5DAC4CA0DAD504D99CA22

### 自写 libretro 宿主

- 新增 `tools/libretro/`（C# / .NET Framework 4，`csc` 编译）+ `tools/build-libretro.ps1`，产物 `resources/tools/nest-libretro.exe`
- 不依赖 RetroArch：SDL3（隐藏窗口 + OpenGL 4.5 Core）托管 `dolphin_libretro.dll`，负责 environment 回调、视频、音频、输入、主循环
- 实测：GC 直读 600 帧、Wii Menu 900 帧均 exit 0、约 59.6 fps；截图经 glReadPixels 正常

### Wii 系统菜单去 UIA

- `resources/engines/dolphin-lr.json` + `src/main/libretro.ts`：Wii Menu 改为宿主 `--rom wii-menu.wad` 启动
- 删除 Dolphin Qt 的 Wii 系统菜单分支（`dolphin.json` 的 `systemArgsBySystem.wii`、WAD/NAND 前置检查、`-b -n` 参数重写）
- WAD 缺失/宿主缺失时不再回退 UIA，直接给出明确错误（`missing-wii-menu` / `libretro-host-missing`）
- NGC 主菜单仍走 Qt+UIA：libretro 核心要求内容且无内容启动会崩溃（源码 `Boot.cpp` 无条件读 `game->path`），已在系统备注中注明限制

### 输入与封面

- 宿主输入由核心 descriptors 驱动：GC A/B/X/Y/L/R/Z/Start、左右摇杆（±32767）、C 摇杆；Wii A/B/1/2/+/−/Home/Shake/Tilt；键盘默认表 + 手柄轴；Wii 鼠标→右摇杆指针
- `--keys` 覆盖：Nest 把 `settings.controls` 的自定义键位映射成宿主 action 传给引擎
- 封面：libretro 会话跳过 `nest-capture`，宿主 `--shot-dir/--shot-every` 周期存帧并跳过黑帧，退出后取最新非黑帧


### 发布前修复（11-01）

- Wii 画面：默认 4:3 原生输出（dolphin_widescreen=disabled + spect_ratio 自动），EFB 倍率跟随窗口缩放，画面铺满窗口
- Wii 鼠标：改为绝对 pointer + dolphin_ir_mode=2，按屏幕录像标定反向映射（X 0.765/0.132、Y 0.537/0.086），左键 = Wiimote A
- 只启用端口 0 的 Wii Remote，去掉多余的 2/3/4 号光标
- Wii U Menu 标记为**实验性**；设置里 MLC 行加 ? 提示（真机 dump / CDN 拼装两条路，及 Cemu 2.6 缺陷说明）

### 工程

- VC++ 14.51 运行时（`msvcp140/vcruntime140/vcruntime140_1/concrt140`）随包放在 `resources/tools/`
- `docs/nintendo/PLAN-LIBRETRO.md` 记录 CLI 契约与踩坑（VC++ 运行时、`retro_hw_render_callback` 偏移、异步 retro_run、Null 后端不可用）
- 测试：56 条（新增 libretro 10 + 接线 6）

### Wii U（Cemu 2.6）

- 内置 Cemu 2.6（50 MB，MPL 2.0），引擎清单重写：`-g {rom}` 直读、`-t 0005001010040000` 进 Wii U Menu、
  `-f` 全屏、16:9 封面裁切
- 扫描器：`.wua / .wud / .wux` → Wii U
- 系统文件（自备）新增两类导入：
  - **Cemu keys.txt** → `resources/engines/cemu/portable/keys.txt`（校验 32 位十六进制行数，首次覆盖前备份 `keys.txt.before-nest`）
  - **Wii U NAND（MLC）** → 只记路径（`settings.cemuMlc`），校验 `sys/title/00050010/10040000` 或 `usr/`
- 启动参数：有 MLC 时插 `-m <mlc>`；系统菜单无 MLC 返回 `missing-wiiu-mlc`，缺 keys 返回 `missing-cemu-keys`
- 便携模式：`resources/engines/cemu/portable/` 为运行时目录（keys/NAND/settings），
  `tools/clean-engines.mjs` 打包前强制清空，`.gitignore` 忽略

## 0.3.1 — 2026-10-30 · 免安装携带版

### 扫描（修朋友反馈的“3DS 游戏扫不到”）

- 扩展名补齐：`.cia`（3DS 安装包，之前完全扫不到）、`.dsi/.ids/.srl`（NDS）、`.wia`（Wii）、`.gcz/.ciso/.dol`（NGC）、`.unif`（FC）、`.bs`（SFC）
- `.iso/.rvz/.gcz/.ciso` 不再一律归 NGC：读偏移 0x18 的磁盘头 magic 区分 GameCube（`C2339F3F`）与 Wii（`5D1C9EA3`），Unknow 时回退扩展名
- 扫描深度 6 → 8 层、单次上限 20k → 50k 文件
- **启动自动扫描**：界面里添加过的文件夹会存进设置（`scanRoots`），每次启动 800ms 后后台重扫，新放进去的 ROM 自动出现；设置面板可查看/移除文件夹、手动「立即扫描」，并可关闭自动扫描（`autoScan`）
- `--scan=` 调试参数同样会记住文件夹，方便测试脚本复用

### 键位（B 路线）

- **键位编辑界面**：设置面板新增「键位」区块，8 台主机 chip 切换（同一引擎多主机注明共用），12 个动作（上/下/左/右/A/B/X/Y/L/R/Start/Select）显示当前绑定并可改键
- 捕获态：点「改」后按任意键（读 `KeyboardEvent.code`），Esc 取消；同引擎内重复键拒绝并提示冲突；改动暂存，点「保存」才写入
- 「恢复默认」清掉用户覆盖并重写引擎默认值；保存/恢复后立即生效（下次启动也保留）
- **键位核心模块** `src/main/controls/`：mGBA / Dolphin / Azahar / melonDS 四个适配器 + 统一 keymap（canonical code ↔ Qt key int / Dolphin 键名），aris 暂标记 unsupported
- 首次启动仍自动写默认键位（不覆盖用户自定义，写前 `.before-nest` 备份）；用户覆盖值来自 `settings.controls[engineId]`
- 修正 Azahar 键盘方向键的 Qt 码错位（旧值实际是 Right/Down/PageUp，改为 16777234–16777237）
- 新增 `tests/controls.test.ts`（14 条）：keymap 转换、mGBA ini / melonDS TOML 写读、自定义保留、force 重写、备份不被覆盖、facade 路由、ares unsupported

### ares 键位（FC / SFC / N64）

- ares 的 `settings.bml` 绑定格式最终确认：`0x1/0/<十进制下标>;;`。`0x1` = 键盘设备 id（`(pathID<<32)|(vendorID<<16)|productID`，跨机器稳定）、`0` = group、第三段是 ruby Windows 键盘表的下标（**十进制，不是 VK 也不是 scancode**）、`;;` 是 3 个 mapping 槽拼接后 trim 的产物
- 新增 `src/main/controls/ares.ts`：启动前写入 Famicom / FamicomDiskSystem / SuperFamicom / Nintendo64 的 `Port 1 → Gamepad`（WASD、J/K、U/I、Q/E、Enter、RShift；SFC 加 Y/X/L/R；N64 加 L/R/Z）
- 校验方式：源码逐字确认（`desktop-ui/input/input.cpp` + `ruby/input/keyboard/rawinput.cpp` + `nall/atoi.hpp` 的十进制 `natural()`），并与 ares 亲手写出的 `settings.bml` 逐字节比对（A=35、D=38、J=44、K=45、Return=91、RightShift=94）
- 已启用（`WRITABLE_ENGINE_IDS` 包含 ares）；`docs/nintendo/KEYS-ARES-FORMAT.md` 记录完整源码依据与 102 项 Windows 键盘表，另附 Linux/macOS 差异警告

### 打包

- `Nest-0.3.1-portable.zip`：**234 MB**（解压 598 MB / 2905 文件），5 引擎内置，解压后双击 `启动 Nest.bat`
- SHA256：`46828963023521CB0B72AF4F844592E4C7CB385BE77AA2C0BBE2835BA78C7778`
- 打包前 `tools/clean-engines.mjs` 清空引擎运行时状态（mGBA MRU / melonDS toml / `.nest-controls-*` / `*.before-nest`），并在组装后复查 zip 内容
- 已验证：全新解压 → `--smoke` 通过 → `--scan` + mGBA 启动 + 封面生成

---

## 0.3.0 — 2026-10-29 · 免安装携带版

> 从「GBA / FC / SFC / N64 / NGC 能玩」到「九台任天堂主机全部接上、五个内置引擎、三个系统菜单可用、并产出免安装携带版」。

### 新主机

- **NDS（melonDS 1.1）**：直读 `.nds`；melonDS 自带 FreeBIOS，不需要额外 BIOS 就能跑游戏
- **NDS 系统模式**：`File → Boot firmware` → **DS 固件菜单**（日历 / PictoChat / DS Download Play），需自备真实 BIOS + firmware
- **3DS（Azahar 2126.2）**：直读 `.3dsx` / `.3ds`；使用独立环境变量隔离配置；无系统菜单（Azahar 不支持 HOME Menu）
- 引擎从 3 个增加到 **5 个 / 284 MB**：mGBA、ares、Dolphin、Azahar、melonDS

### 系统模式

| 主机 | 系统菜单 | 实现方式 | 前置条件 |
|---|---|---|---|
| NGC | ✅ GameCube Menu | UIA 菜单 `工具 → GameCube → 区域` | 自备 IPL（校验 CRC32） |
| Wii | ✅ Wii Menu | 命令行 `-b -e wii-menu.wad`（缺 WAD 回退 NAND title） | 自备 4.3u.wad |
| NDS | ✅ DS 固件菜单 | UIA 菜单 `File → Boot firmware`（两级菜单） | 自备 bios7/bios9/firmware |
| 3DS | ❌ 不支持 | — | 引擎限制 |
| NDS/Wii U | — | 已撤掉入口 | 引擎未随包 |

### 新功能

- **固件导入中心**：设置 →「系统文件（自备）」，三项都可选择文件/目录导入，显示「已就绪 / 校验未通过 / 未导入」
  - GameCube IPL：导入时计算 CRC32，白名单外拒绝，按区域落到对应目录
  - Wii System Menu WAD：复制到数据目录
  - NDS BIOS + 固件：选目录一次导入三个文件
- **键位默认值**：mGBA / Dolphin / Azahar 首次启动自动写入统一布局（WASD + 空格/JKL + 方向键 + TGFH），已自定义不覆盖，并留 `.before-nest` 备份
- **手柄检测**：`nest-pads.exe`（SDL3）在启动前统计手柄数量，决定引擎写键盘还是 SDL 手柄绑定
- **封面裁剪增强**：`captureContentAspect`（按真实画面比例居中裁掉黑边）+ `captureTopOnly`（只截上屏，NDS/3DS 用）
- **便携数据模式**：`启动 Nest.bat` 用 `--user-data-dir=data` 启动，库/封面/日志/引擎配置全部留在解压目录内，删 `data` 即恢复出厂

### 修复

- **扫描相对路径**：一律 `path.resolve`，修掉「提示启动成功但游戏没加载」
- **library.json 的 BOM**：读取时剥离 UTF-8 BOM，修掉别人机器上库文件打不开
- **封面被拉伸**：卡片改用裁切填满，不再拉伸画面
- **引擎配置本地路径泄漏**：新增 `tools/clean-engines.mjs`，打包前清掉 mGBA 的 MRU、melonDS 的 RecentROM、运行时生成的 toml/wfcsettings
- **3DS 封面两侧黑边**：改内容比例 + 只截上屏，输出 395×237 干净上屏
- **系统模式前置检查**：缺 IPL / WAD / NDS BIOS 时直接返回 `missing-ipl` / `missing-wii-menu` / `missing-nds-bios`，不再起一个只会弹错的窗口
- **引擎退出后主窗口还原**：全屏/最小化启动后恢复

### 打包与发布

- **免安装携带版**：`Nest-0.3.0-portable.zip`
  - 234 MB（解压 570 MB / 2908 个文件）
  - 5 个引擎 + 5 个助手工具全部内置，解压双击 `启动 Nest.bat` 即用
  - SHA256：`FC6ABF482BA0E4AD01AF916AEF779800E10B273BAA2748C4258CA7C60E0571B6`
- **不做安装版**：当前体量与更新方式不需要 NSIS 安装包，携带版更方便（决策见 DECISIONS D20）
- 打包链路：`npm run pack`（构建 → 清理引擎配置 → electron-builder）
- 三个已知事项：无数字签名（首次运行 SmartScreen 提示）、必须用启动脚本（本机沙箱环境需要 `--no-sandbox`）、便携数据与 `%APPDATA%\Nest` 是两套数据

### 已知限制

1. ~~ares 键盘绑定~~：已按源码确认的十进制下标表实现（2026-10-30），见 `docs/nintendo/KEYS-ARES.md`
2. **3DS 无系统菜单**：Azahar 不支持 HOME Menu，短期无解
3. **Wii 直读**：代码就绪但没有真实镜像验证
4. **封面黑帧**：过场全黑时可能截到黑图，需要「挑非黑帧」或手动重拍
5. **NDS DSi 模式**：`ConsoleType=1` + DSi NAND 可开，但未启用

### 提交记录

```
8bbd76a build: portable zip + NSIS config, engine config scrub, drop runtime userData rewrite
097f1aa feat: NDS firmware menu via melonDS File > Boot firmware (2-level UIA, BIOS import)
9c2b81c feat: NDS support via melonDS 1.1 (direct boot, top-screen covers, FreeBIOS)
214a4fd chore: ignore engine-side key backups and test backup artifacts
bba657b feat: 3DS covers capture the top screen only (content aspect + top-only capture)
7ead6a4 docs: restore PROGRESS.md and append 10.28 merge summary
874a4f0 docs: record 10.28 merge (3DS, system modes, firmware importer); keep card covers cropping
c66b313 chore: drop accidental mojibake copy of PROGRESS.md
ca89d72 feat: merge 10.28 branch - 3DS/Azahar, NGC+Wii system modes, keypad defaults, firmware importer
```

---

## 0.6.0-beta.1 便携包信息

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.6.0-beta.1-portable.zip` |
| 大小 | 624.5 MB（654,846,078 字节） |
| 解压 | 1362.4 MB / 4726 个文件 |
| SHA256 | `02101ADA5411EF63F497B8C06D9D5D7ABF03489E9BF4B00153BF8844997FF8B8` |
| Release | <https://github.com/Parmetty/NEST-Emulator-Station/releases/tag/v0.6.0-beta.1> |
