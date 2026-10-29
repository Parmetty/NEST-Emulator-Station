# 更新日志

本文件记录每次发布的可见变化。技术细节在 `docs/STATE.md`，决策理由在 `docs/DECISIONS.md`，待办在 `docs/PROGRESS.md`。

## 0.3.1 — 开发中

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

- ares 的 `settings.bml` 绑定格式破译：`0x<deviceID>/<groupID>/<inputID hex>;;`，键盘设备 `0x1`、group `0`、inputID 为 VK 码（W=0x57、Enter=0x0d）
- 新增 `src/main/controls/ares.ts`：启动前写入 Famicom / FamicomDiskSystem / SuperFamicom / Nintendo64 的 `Port 1 → Gamepad`（WASD、J/K、U/I、Q/E、Enter、RShift；SFC 加 Y/X/L/R；N64 加 L/R/Z）
- 校验方式：注入 `Up: 0x1/0/57;;` 后 ares 设置界面显示「键盘 + W」，证明格式与设备解析正确
- ⚠️ 待真机确认：VK 码为小写十六进制、设备号 `0x1` 在本机可复现；游戏内按键响应还需要你试一次（`E:\workstop\ares-probe`）

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

1. **ares 键盘绑定**：格式已从源码破译（`identifier/groupID/inputID` 三段，非 0x 开头需四段），候选方案实测未生效，FC/SFC/N64 目前靠手柄或进 ares 手动绑
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
