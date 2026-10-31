# Dolphin libretro 核心能力核查：GC 主菜单 / Wii 菜单 / 无内容启动

> 对象：官方 `dolphin_libretro.dll` 2609.0.157，commit `c386bd3b95b610ee4e7538891fc57112090498f7`。
> 方法：只读 GitHub API 取该 commit 源码，`git hash-object` 与 API blob SHA 全部一致（`Boot.cpp`=`3a3b8735…`、`Main.cpp`=`ad03bb00…`、`Core/Boot/Boot.cpp`=`0cad29ee…`）；本地 `.cache/Boot-c386.cpp` 与上游同 blob。未运行模拟器、未改项目代码。

## 0. 结论表

| 目标 | 结论 | 依据 |
|---|---|---|
| 无内容启动（NULL/空 path） | **不可行**（NULL 崩溃；空串返回 false） | §1：`Boot.cpp:691` 无空指针检查；`BootManager.cpp:54` 对空 boot 参数返回 false |
| GC 主菜单（当前核心，原样） | **不可行**：没有任何入口把内容/回调变成「无盘 IPL」 | §3、§4；`DolphinLibretro` 从不构造 `BootParameters::IPL` |
| GC 主菜单（改核心后） | **有条件可行**：打 ~6 行补丁 + 提供 IPL dump | §7 |
| 带 GC 盘 + `dolphin_skip_gc_bios=disabled` 停在 GC 菜单 | **不可行**：会转成 `IPL{region, disc}` 并把盘插回驱动，真 IPL 自动引导光盘 | `BootManager.cpp:236-247`、`Boot.cpp:677-690` |
| Wii 菜单 | **有条件可行**：①WAD 内容；②盘内容 + 隐藏选项 + NAND 已装 SYSTEM_MENU | §5 |
| Wii 菜单/任意 title-id（类似 CLI `-n`） | **不可行**：libretro 无 title-id 入口，唯一 NANDTitle 硬编码 SYSTEM_MENU | `Boot.cpp:764` |

## 1. `retro_load_game` 对 NULL / 空内容的真实行为

- 函数定义在 `Source/Core/DolphinLibretro/Boot.cpp:183`（不是 `Main.cpp`）。函数体内**没有任何** `if (!game)` / `if (!game->path)` 检查；首次读内容字段在 691 行。GBPlayer 分支的 228 行只在 subsystem 激活时命中，而 `retro_load_game_special` 已保证传入非空盘路径（`Boot.cpp:800-808`）。
- `game == NULL` 或 `game->path == NULL`：`Boot.cpp:691` `Libretro::VFile::NormalizePath(game->path)` 把 `const char*` 隐式转 `std::string`（即 `strlen(NULL)`）→ **0xC0000005，崩在 `retro_load_game` 内**。
- `game->path == ""`（非 NULL 空串）**不崩**：`GenerateFromFile` 在 `Core/Boot/Boot.cpp:222-225` 判 `File::Exists("")` 失败、`PanicAlertFmtT` 被 libretro 注册的 handler 吞掉（`Boot.cpp:303-313`），返回 `nullptr`；`BootManager::BootCore` 在 `BootManager.cpp:54-55` `if (!boot) return false;` → `retro_load_game` 返回 false。
- 核心从未调用 `RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME`（`Main.cpp:90-123` 只设 subsystem 和 core options）；而 libretro 契约规定声明无内容支持时 `retro_load_game` 会收到 NULL（`libretro.h:9220-9231`、`1041-1056`）。即核心**既没声明，也不容忍**无内容。
- 「无内容 → 主菜单/系统菜单」的显式分支：**不存在**。唯一的「无盘→系统菜单」是 Wii 的 `dolphin_disc_based_games_boot_to_wii_menu`，但它要求内容本身是盘（`Boot.cpp:741-766`），对 GC 无关。

## 2. 内容类型 → boot 入口

| 内容 | 扩展名 | 生成的 BootParameters | boot 路径 |
|---|---|---|---|
| GC/Wii 盘镜像 | .gcm .iso .tgc .wbfs .ciso .gcz .wia .rvz（`GenerateFromFile` 另收 .bin/.nfs） | `Disc`（`Boot.cpp:272-279`） | `CBoot::EmulatedBS2`→GC:`EmulatedBS2_GC`（`Boot_BS2Emu.cpp:288`）/Wii:`EmulatedBS2_Wii`（:541）。GC 盘 + skip BIOS 关闭时先转 `IPL{region, disc}`（`BootManager.cpp:236-247`）→ `Load_BS2`（`Boot.cpp:662-690`） |
| DOL/ELF | .dol .elf | `Executable`（`Boot.cpp:281-293`） | `BootUp` 访问者 `operator()(Executable)`（`Boot.cpp:570-636`） |
| WAD（含 Wii Menu WAD） | .wad | variant `DiscIO::VolumeWAD`（`Boot.cpp:302-307`） | `CBoot::Boot_WiiWAD`→临时安装→`BootNANDTitle`（`Boot_WiiWAD.cpp:34-44`） |
| DFF / 游戏描述 | .dff / .json | `DFF` / 递归 base_file（`Boot.cpp:299-332`） | FifoPlayer / 递归同上 |
| 多盘 | .m3u/.m3u8 | libretro 侧展开（`Boot.cpp:713-721`），首项决定 | 同首项 |

核心广告：`need_fullpath=true`、`block_extract=true`、`valid_extensions="elf|dol|gcm|iso|tgc|wbfs|ciso|gcz|wad|wia|rvz|m3u"`（`Main.cpp:172-176`）；subsystem「GameCube Disc」= `rvz|gcm|iso|ciso|wbfs|gcz|tgc|m3u`（`Main.cpp:105`）。

## 3. GC 主菜单到底怎么 boot

- 上游**没有** `CBoot::BootGameCubeIPL` 这个符号：对该 commit 做代码搜索，`BootGameCubeIPL` 只出现在 Qt（`MenuBar.h/.cpp`、`MainWindow.h/.cpp`），Core 与 DolphinLibretro 里都没有。
- 独立版入口：`DolphinQt/MenuBar.cpp:313-323`「Load &GameCube Main Menu」NTSC-J/U/PAL/Triforce 四项 → `DolphinQt/MainWindow.cpp:1859-1861` `StartGame(std::make_unique<BootParameters>(BootParameters::IPL{region}))`；菜单项仅在对应 `IPL.bin` 存在时可点（`MenuBar.cpp:1116-1119`）。
- `BootParameters::IPL` 构造即取路径：`Boot.cpp:338-342` `path = Config::GetBootROMPath(Config::GetDirectoryForRegion(region))`。`BootUp` 的 IPL 访问者（`Boot.cpp:662-690`）：`File::Exists` → `Load_BS2`（`Boot.cpp:391-507`，加载并跳到 `0x81200150`）→ 若有 `ipl.disc` 则 `SetDisc` 插盘。
- 前置条件：① IPL dump 放在 `<sys>/GC/<JAP|USA|EUR|DEV>/IPL.bin` 或 `<user>/GC/…/IPL.bin`（`MainSettings.cpp:761-768`、`CommonPaths.h:139/158`；`GetDirectoryForRegion` 见 `MainSettings.cpp:731-759`，NTSC-J 用 "JAP"）；② 直接构造 `IPL` 参数**不受** `MAIN_SKIP_IPL` 限制——该开关只在「盘→IPL」转换时判断（`BootManager.cpp:236-237`）；③ `bBootToPause` 被核心主动置 true（`Boot.cpp:649`），这是 libretro 手动帧驱动的前提（`Main.cpp:524-532` 用 `DoFrameStep`/`RunSingleFrame`；`Core.cpp:337-343`、`1128-1150`），不是障碍。
- 核心侧唯一走的 IPL 路径是「GC 盘 + skip_gc_bios=disabled」转换（`BootManager.cpp:236-247`）。该转换用带盘构造（`Boot.cpp:344-347`），访问者把盘 `SetDisc` 回去（`Boot.cpp:677-684`），真 IPL 于是自动引导光盘、不会停菜单——与我们的实测日志一致。

## 4. 是否存在隐藏/未文档化入口

**没有。** 证据：
- 把 IPL 当内容传不行：`.ipl` 不在 `disc_image_extensions`（`Boot.cpp:269-271`），落到 `Boot.cpp:334-335`「Could not recognize file」；`.bin` 被当盘镜像 → `CreateDisc` 失败 → `Boot.cpp:295-296` 返回 null。
- `DolphinLibretro` 里没有任何 `BootParameters::IPL` 构造，没有 `NANDTitle` 之外的系统菜单入口；skip BIOS 的选项描述「animation/menu」有误导，实际带盘时只会显示开机动画后进游戏。
- `retro_load_game_special` 只是 GBPlayer，仍强制要求 GC 盘（`Boot.cpp:800-808`）；`Options.h:162-180` 里也没有 "boot to menu" 类键。

## 5. Wii 菜单

- **WAD 内容**：`.wad` → `Boot_WiiWAD` → 临时安装 → `BootNANDTitle`（`Boot_WiiWAD.cpp:34-44`）；Wii Menu 的 WAD 即可（已实测）。
- **NAND/title 方式（隐藏选项）**：`dolphin_disc_based_games_boot_to_wii_menu=enabled`（`Options.cpp:280-294`、`Options.h:174`）。条件：内容必须是盘（GC/Wii，`Boot.cpp:749-751`）、`<save>/NAND` 里已有 SYSTEM_MENU 的 TMD（`Boot.cpp:756-759`）、区域匹配。满足后 `BootParameters::NANDTitle{Titles::SYSTEM_MENU}`（`Boot.cpp:764`；`SYSTEM_MENU=0x0000000100000002`，`CommonTitles.h:12`）→ `ConfigManager.cpp:428-443` 校验已装 TMD → `BootNANDTitle`（`Boot_WiiWAD.cpp:18-32`）。
- 没有通用 title-id 入口：独立版 CLI `-n/--nand_title <16 hex>`（`UICommon/CommandLineParse.cpp:92` → `DolphinQt/Main.cpp:228-234`）在 libretro 没有等价 API，NAND 标题被硬编码为 SYSTEM_MENU（`Boot.cpp:764`）。所以 libretro 下 Wii 菜单只有「WAD 内容」或「盘内容+该选项」两条路。

## 6. 本项目宿主崩溃的精确归因

- 宿主无内容时传的是零初始化结构：`tools/libretro/Program.cs:329` `new RetroGameInfo()`，只有 `_romPath` 非空才在 342 行分配 `path`；因此 `path == NULL` → `Boot.cpp:691` 崩溃，与实测 0xC0000005 吻合。
- 传非 NULL 空串则按 §1 返回 false、不崩。「空内容原生崩溃」的结论方向正确，但根因是 **NULL 解引用**，而非核心显式拒绝空内容。

## 7. 若要支持 GC 主菜单：最小改法（需改核心）

核心不具备入口，**宿主怎么传都没用，必须改核心源码/打补丁**（约 6 行，示意）：

```cpp
// Source/Core/DolphinLibretro/Boot.cpp
// ~690 行前：先把 NULL 保护起来（否则 691 行仍崩）
const bool no_content = !game || !game->path || !*game->path;
if (!no_content) { /* 原 690-724 行路径/m3u/disk_paths 处理 */ }
// 原 742 行：
std::unique_ptr<BootParameters> boot_params =
    no_content ? std::make_unique<BootParameters>(BootParameters::IPL{
                     Config::ToGameCubeRegion(Config::Get(Config::MAIN_FALLBACK_REGION))})
               : BootParameters::GenerateFromFile(normalized_game_paths);
```

- 还需把 `Boot.cpp:691/724/770` 等处对 `game->path` 的直接使用一并放进 `no_content` 判断，否则先崩在 691。
- 若要让 RetroArch 也能无内容启动：在 `Main.cpp` 的 `retro_set_environment` 加 `bool no_game=true; environ_cb(RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME,&no_game);`（契约见 `libretro.h:1041-1056`）。本项目自写宿主不需要。
- IPL 放置：`<system_dir>/dolphin-emu/Sys/GC/USA/IPL.bin`（或 JAP/EUR/DEV），也可放 `<save_dir>/User/GC/USA/IPL.bin`；区域建议加一个 core option 覆盖，默认 `MAIN_FALLBACK_REGION`。
- 宿主侧不用改：保持"无内容即 `retro_game_info{path=NULL}`"，补丁后即进入 GC 主菜单；帧推进由现有 `retro_run`(`DoFrameStep`) 完成，手柄输入照常。
- 备选（不改核心）：沿用 Dolphin Qt 的方案。另有一个仅代码上成立的宿主侧 hack：带盘 + `skip_gc_bios=disabled` 启动后、第一帧前调用 `retro_set_eject_state(true)` 弹盘（`Boot.cpp:871-892`），让真 IPL 探测不到盘而进菜单——时序敏感、**未验证**，不建议依赖。

## 8. 引用清单（Dolphin 源码，commit `c386bd3`）

| 位置 | 关键代码片段 |
|---|---|
| `Source/Core/DolphinLibretro/Boot.cpp:183` | `bool retro_load_game(const struct retro_game_info* game)`（函数内无空指针检查） |
| `Source/Core/DolphinLibretro/Boot.cpp:691` | `normalized_game_paths.push_back(Libretro::VFile::NormalizePath(game->path));`（NULL 崩点） |
| `Source/Core/DolphinLibretro/Boot.cpp:649` | `SConfig::GetInstance().bBootToPause = true;` |
| `Source/Core/DolphinLibretro/Boot.cpp:741-766` | `if (disc_based_games_boot_to_wii_menu) { … boot_params = std::make_unique<BootParameters>(BootParameters::NANDTitle{Titles::SYSTEM_MENU}); }` |
| `Source/Core/DolphinLibretro/Main.cpp:172-176` | `info->need_fullpath = true; info->valid_extensions = "elf\|dol\|gcm\|iso\|tgc\|wbfs\|ciso\|gcz\|wad\|wia\|rvz\|m3u"; info->block_extract = true;` |
| `Source/Core/DolphinLibretro/Main.cpp:524-532` | `Core::DoFrameStep(system); system.GetFifo().RunGpuLoop(); … system.GetCPU().RunSingleFrame();` |
| `Source/Core/DolphinLibretro/Common/Options.h:173-174` | `SKIP_GC_BIOS = "dolphin_skip_gc_bios"; DISC_BASED_GAMES_BOOT_TO_WII_MENU = "dolphin_disc_based_games_boot_to_wii_menu";` |
| `Source/Core/DolphinLibretro/Common/Options.cpp:267-294` | 两个相关选项定义（`Skip GameCube BIOS` 默认 enabled；`Disc Based Games Boot to Wii Menu` 默认 disabled） |
| `Source/Core/Core/BootManager.cpp:54-55` | `if (!boot) return false;` |
| `Source/Core/Core/BootManager.cpp:191-234` | libretro 专用 IPL 存在性检查；缺失时 `Config::SetCurrent(Config::MAIN_SKIP_IPL, true);` |
| `Source/Core/Core/BootManager.cpp:236-247` | `const bool load_ipl = !system.IsWii() && !Config::Get(Config::MAIN_SKIP_IPL) && std::holds_alternative<BootParameters::Disc>(boot->parameters); … BootParameters::IPL{StartUp.m_region, std::move(...Disc...)}` |
| `Source/Core/Core/Boot/Boot.cpp:222-225` | `if (!File::Exists(paths.front())) { PanicAlertFmtT("The specified file ... does not exist", ...); return {}; }` |
| `Source/Core/Core/Boot/Boot.cpp:269-297` | `disc_image_extensions = {".gcm", ".bin", ".iso", …}; if (disc_image_extensions.contains(extension)) { … Disc{…} / Executable{…} }` |
| `Source/Core/Core/Boot/Boot.cpp:302-307` | `if (extension == ".wad") { auto wad = DiscIO::CreateWAD(path); … }` |
| `Source/Core/Core/Boot/Boot.cpp:338-347` | `BootParameters::IPL::IPL(DiscIO::Region region_) : region(region_) { path = Config::GetBootROMPath(directory); }` |
| `Source/Core/Core/Boot/Boot.cpp:662-690` | `bool operator()(const BootParameters::IPL& ipl) const { NOTICE_LOG_FMT(BOOT, "Booting GC IPL: {}", ipl.path); if (!File::Exists(ipl.path)) … Load_BS2(…); }` |
| `Source/Core/Core/Boot/Boot.cpp:391-507` | `bool CBoot::Load_BS2(Core::System& system, const std::string& boot_rom_filename)`（descramble + `ppc_state.pc = 0x81200150`） |
| `Source/Core/Core/Boot/Boot_BS2Emu.cpp:288,541,628` | `CBoot::EmulatedBS2_GC(…)` / `CBoot::EmulatedBS2_Wii(…)` / `CBoot::EmulatedBS2(…)` 分派 |
| `Source/Core/Core/Boot/Boot_WiiWAD.cpp:18-44` | `BootNANDTitle`（`es->LaunchTitle(title_id)`）/ `Boot_WiiWAD`（临时安装后调用前者） |
| `Source/Core/Core/ConfigManager.cpp:428-452` | NANDTitle 需 `FindInstalledTMD(nand_title.id)` 有效且 `IsChannel`；IPL 直接 `*region = ipl.region; system.SetIsWii(false);` |
| `Source/Core/Core/Config/MainSettings.cpp:761-768` | `GetBootROMPath`：优先 `User/GC/<region>/IPL.bin`，否则 `Sys/GC/<region>/IPL.bin`；`731-759` 为 region→目录（JAP/USA/EUR/DEV） |
| `Source/Core/Common/CommonPaths.h:139,158` | `#define GC_IPL "IPL.bin"`、`#define GC_SYS_DIR "GC"` |
| `Source/Core/Core/CommonTitles.h:12` | `constexpr u64 SYSTEM_MENU = 0x0000000100000002;` |
| `Source/Core/Core/Core.cpp:337-343` | `CPUSetInitialExecutionState`：`const bool paused = SConfig::GetInstance().bBootToPause || force_paused; SetState(system, paused ? State::Paused : State::Running, …)` |
| `Source/Core/Core/Core.cpp:1128-1150` | `DoFrameStep`：Paused 时 `SetState(system, State::Running, false)` 只走一帧 |
| `Source/Core/DolphinQt/MainWindow.cpp:1859-1861` | `void MainWindow::OnBootGameCubeIPL(DiscIO::Region region) { StartGame(std::make_unique<BootParameters>(BootParameters::IPL{region})); }` |
| `Source/Core/DolphinQt/MenuBar.cpp:313-323` | `QMenu* gc_ipl = tools_menu->addMenu(tr("Load &GameCube Main Menu"));`（NTSC-J/U/PAL/Triforce）；`1116-1119` 依 `File::Exists(Config::GetBootROMPath(…))` 启用 |
| `Source/Core/DolphinQt/MainWindow.cpp:1605-1607` | `void MainWindow::BootWiiSystemMenu() { StartGame(std::make_unique<BootParameters>(BootParameters::NANDTitle{Titles::SYSTEM_MENU})); }` |
| `Source/Core/DolphinQt/Main.cpp:228-234` | `else if (options.is_set("nand_title")) { … boot = std::make_unique<BootParameters>(BootParameters::NANDTitle{title_id}); }`；选项定义 `-n/--nand_title`（`UICommon/CommandLineParse.cpp:92`） |
| `Externals/libretro-common/include/libretro.h:9220-9231` | `@param game … May be NULL if the core is loaded without content.` |
| `Externals/libretro-common/include/libretro.h:1041-1056` | `RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME 18`：声明后 `retro_load_game receives an argument of NULL` |
| 本项目宿主 `tools/libretro/Program.cs:329-364` | 无内容时 `RetroGameInfo` 保持零初始化（`path = NULL`），有内容才 `gameInfo.path = Native.AllocUtf8(_romPath)` |
