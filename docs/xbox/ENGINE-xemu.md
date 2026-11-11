# ENGINE · xemu（初代 Xbox）

> 状态：**已接入 Nest，直读可用**（0.6.0-beta.1）。xemu **只读光盘镜像**，不认解包文件夹；
> **没有键盘映射**（只认 SDL 手柄）；系统菜单依赖 HDD 镜像里自带的 Dashboard。

## 基本信息

| 项 | 值 |
|---|---|
| 项目 | https://xemu.app/ · https://github.com/xemu-project/xemu |
| 许可证 | GPLv2（衍生自 QEMU，GPLv2） |
| 内置版本 | xemu 0.8.139（Windows x64） |
| 引擎目录 | `resources/engines/xemu/` |
| 数据目录 | `data/xbox/`（MCPX、BIOS、`eeprom.bin`）、`data/xbox-iso/`（回退打包目录） |
| 启动方式 | `xemu.exe -bios <bios> -dvd_path <iso>` |
| 画面比例 | 4:3（`captureAspect: 1.333333`） |

## Nest 接入

清单 `resources/engines/xemu.json`：`launch.args = ["-dvd_path", "{rom}"]`，`systemMode: null`，`captureAspect: 1.333333`。

- 扫描：XISO（0 或 0x10000 处的 `MICROSOFT*XBOX*MEDIA` 魔数）、`.xbe`、含 `default.xbe` 的文件夹
- 固件：用户自备 MCPX + BIOS + HDD；仓库与发布包不含任何固件
- 键位：**无**（xemu 0.8.139 只接 SDL 手柄，键位面板不覆盖 Xbox）
- 系统模式：**无**；HDD 里有 Dashboard 也只是直读

## 启动参数

- 主参数由清单给出：`-dvd_path <iso>`
- Nest 再追加 **`-bios <flash dump>`**：xemu 0.8.139 **不会**把配置里的 `flashrom_path` 变成启动参数
  （只在 GUI 首次向导里生效），只写 toml 会报缺 BIOS
- cwd 固定为引擎目录；启动前先写 `xemu.toml`，再拉起进程

## 便携 xemu.toml（缺失会崩）

xemu 找不到 exe 旁的 `xemu.toml` 时会去问 SDL 要 `%APPDATA%`，随后在 `ui/xemu-settings.cc`
的设置初始化里 **assert 崩溃**（第 86 行）。Nest 每次启动前重写：

```toml
[general]
show_welcome = false

[sys.files]
bootrom_path = '<data>/xbox/firmware/mcpx_1.0.bin'
flashrom_path = '<data>/xbox/firmware/bios.bin'
hdd_path = '<你指定的 qcow2 路径>'
eeprom_path = '<data>/xbox/eeprom.bin'
```

- 路径一律写正斜杠；`eeprom.bin` 由 xemu 生成/更新，仍在 Nest 数据目录内
- 崩溃特征：进程起来就退出、GUI 一帧不出，日志停在设置初始化（`xemu-settings.cc` 断言）——
  先看 `xemu.toml` 是否被删/被手改
- 运行时状态文件：`clean-engines.mjs` 打包前剔除，不进仓库也不进 zip

## 空格路径会被 QEMU 截断

xemu 用 QEMU 的参数解析，路径里的空格会被重新切分，`-drive` 值直接坏掉（黑屏/找不到盘）。处理顺序：

1. 镜像路径无空格 → 直接用
2. 有空格 → 在 `data/xbox-roms/`（数据目录含空格时改用 `%TEMP%\nest-xbox-roms`）建**硬链接**，
   名 `<gameId>.iso`，xemu 只看到无空格路径；跨卷无法硬链接时退化为复制
3. 都失败 → `xbox-rom-link-failed`，不静默失败

## 文件夹 → XISO

- 手动：游戏卡右键「打包为 XISO…」弹保存对话框，**默认输出在游戏文件夹同级、同名 `.iso`**
- 自动：直接启动文件夹游戏时先打包再启动（不弹窗）
- 工具：内置 `resources/tools/extract-xiso.exe`，命令 `extract-xiso -c <文件夹> <输出.iso>`，超时 15 分钟
- 回退：游戏目录只读时打包失败，改写到私有目录 `data/xbox-iso/<gameId>.iso`
- 去重：打包后同目录同时存在文件夹与 ISO，只保留 ISO 一条记录（按 `gameId` / `sha1`）
- 缺工具报 `missing-tool`：`resources/tools/extract-xiso.exe` 被删，从发布包补回

## 固件三件套（设置 → Xbox）

| 文件 | 校验 | 说明 |
|---|---|---|
| MCPX | 512 B | `mcpx_1.0.bin`，复制进 `data/xbox/firmware/` |
| BIOS | 256 KB | 1 MB 四连体 dump 自动取第一段（并校验四段一致），存为 `bios.bin` |
| HDD | `QFI` 头，> 1 KB | qcow2，**只记路径绝不复制**（体积数 GB 且可写） |

缺任一，启动前直接返回 `missing-xbox-mcpx` / `missing-xbox-bios` / `missing-xbox-hdd`。

## 区域识别（XBE 证书）

由 `src/main/game-info.ts` 读文件头，不经 xemu：

- XBE：`XBEH` 魔数 → `base`（0x104）+ 证书 VA（0x118）→ 证书偏移；
  标题 = 证书 +0x0C 的 UTF-16 串（0x50 字节），区域 = 证书 +0xA0 的 flags
- flags：`0x1` NTSC-U、`0x2` NTSC-J、`0x4` PAL（可组合）；0 / `0xFFFFFFFF` / bit31 = **Region-Free**
- XISO：先找 XDVDFS 描述符，再走根目录表定位 `default.xbe`，读到 XBE 后同一套证书解析
- 结果只是默认值：用户右键改过的名字永远优先

## 已知限制

- **无键盘映射**：不要为 Xbox 伪造键位
- **系统菜单**：HDD 必须自带 Dashboard，否则进不了初代 Xbox 系统界面（直读不受影响）
- **只读镜像**：文件夹必须打包；大游戏首次启动要等打包时间
- 打包中断会留半截 ISO（`pack-failed` / `timeout`），重试会覆盖同名文件
- 直读兼容性取决于 xemu 版本与游戏本身，格式识别不等于可玩
