# Nest 0.4.0 Beta · 自写 libretro 宿主 + Wii U 接入

> Windows 免安装携带版。下载 `Nest-0.4.0-beta.1-portable.zip`，解压双击 **`启动 Nest.bat`** 即可。

## 这个版本有什么

### 自写 libretro 宿主（Wii 系统菜单去 UIA）

- 新增 `nest-libretro.exe`（自写 C# 宿主，托管官方 `dolphin_libretro.dll`，不依赖 RetroArch/RetroArch 前端）
- **Wii Menu 不再走 Dolphin Qt 的 GUI 自动化**：直接加载 `wii-menu.wad` 进菜单
- 键鼠映射：鼠标 = Wiimote 光标（绝对定位，按屏幕录像标定），左键 = A
- 同一套宿主也用于封面取帧（跳过黑帧）

### Wii U（Cemu 2.6）

- 内置 Cemu 2.6（MPL 2.0）
- 支持 `.wua / .wud / .wux` 扫描与直读
- 设置 →「系统文件（自备）」新增：Cemu keys.txt 导入、Wii U NAND（MLC）目录
- **Wii U Menu 标记为实验性**：Cemu 2.6 尚未实现 `nn_act.LoadConsoleAccount`，即使 MLC 正确菜单目前也只停在背景；直读不受影响

### 键位

- mGBA / ares / Dolphin / Azahar / melonDS 五引擎键盘绑定（分引擎写配置，不覆盖自定义）
- ares 采用源码确认的十进制 index 编码
- Wii 系统菜单通过宿主内置默认 + Nest `--keys` 传递

### 其它

- 启动自动扫描、`.cia` 支持、磁盘头 magic 判断 GC/Wii
- 固件中心、封面、运行中高亮、进入前确认
- 便携模式：库/封面/日志/引擎配置都在解压目录 `data\`

## 下载信息

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.4.0-beta.1-portable.zip` |
| 大小 | 268 MB（解压 640 MB / 3172 文件） |
| SHA256 | `235753F404CCFF3494D6A4C25861265C23B624F99BE5DAC4CA0DAD504D99CA22` |

## 首次使用

1. 解压到任意目录
2. 双击 `启动 Nest.bat`
3. 点「扫描文件夹」指向 ROM 目录（之后每次启动自动重扫）
4. 固件/密钥：设置 →「系统文件（自备）」

## 已知限制

- Wii U Menu 实验性（Cemu 2.6 账号 API 未实现）
- Wii 直读尚无真实镜像验证
- NGC 系统菜单仍是 Qt+UIA（libretro 核心无法无内容启动）
- 无数字签名：首次运行 SmartScreen 提示，选「更多信息 → 仍要运行」
- Cemu 键位尚未接入 Nest 键位面板（可在 Cemu 自身 GUI 配置）

完整改动见 `docs/nintendo/CHANGELOG.md` 的 0.4.0-beta.1 节。
