# Nest 0.3.2 · ares 键盘启用

免安装携带版：下载 zip 解压，双击 **`启动 Nest.bat`** 即可（不用安装、不写注册表）。

## 这个版本有什么

- **ares（FC / SFC / N64）键盘绑定正式启用**——首次启动自动写入默认键位（WASD + J/K + U/I + Q/E + Enter/右 Shift，N64 的 Z=Space），不再需要手柄或进 ares 手动绑
- 编码依据 ares 148 源码确认：`0x1/0/<十进制下标>;;`（详见仓库 `docs/KEYS-ARES-FORMAT.md`）
- 键位面板：GBA / FC / SFC / N64 / NDS / NGC / Wii / 3DS 全部可改键，保存后立即生效；不覆盖用户已有的自定义布局
- 扫描修复（0.3.1 起）：`.cia`、ISO 头判定 GC/Wii、**启动时自动重扫已添加的文件夹**
- 固件中心：GameCube IPL（CRC32 校验）/ Wii 系统菜单 WAD / NDS BIOS+固件，设置里一键导入
- 系统菜单：NGC GameCube Menu、Wii Menu、NDS DS 固件菜单（需自备固件）
- 五个内置引擎：mGBA、ares、Dolphin、Azahar、melonDS（284 MB）

## 下载信息

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.3.2-portable.zip` |
| 大小 | 234 MB（解压 598 MB / 2905 文件） |
| SHA256 | `B5AE4AF8DDAC53CADACA1C8E493864FC3C23C65E0EBD0702594452422646AFA1` |

## 首次使用

1. 解压到任意目录
2. 双击 `启动 Nest.bat`
3. 点「扫描文件夹」指向你的 ROM 目录（之后每次启动会自动重扫）
4. 固件在 设置 →「系统文件（自备）」导入

## 已知限制

- 无数字签名：首次运行 Windows 可能提示 SmartScreen，选「更多信息 → 仍要运行」
- 3DS 无系统菜单（Azahar 不支持 HOME Menu）
- 封面偶尔会截到过场黑帧
- 必须用启动脚本（个别环境 Electron 沙箱不可用）

完整改动见仓库 `docs/CHANGELOG.md` 的 0.3.2 节。
