# Nest 0.4.2 Beta · PlayStation 三机接入 + PSP 固件导入

> Windows 免安装携带版。下载 `Nest-0.4.2-beta.1-portable.zip`，解压后双击 **`Nest.exe`** 即可；
> 想让数据留在程序目录就双击 **`启动 Nest.bat`**。

## 这个版本有什么

### PlayStation 三机接入

- **PS1（SwanStation / libretro）**
  - 直读 `.cue/.bin/.chd/.pbp/.mds/.ccd`
  - PS1 BIOS 可选导入（512 KB 校验；缺省用 OpenBIOS）
  - 键位面板新增 PS1 芯片
  - BIOS 系统菜单入口保留，但已标记 **「故障」**：BIOS 界面输入无响应，直读不受影响
- **PS2（PCSX2 2.8.2）**
  - 内置 PCSX2，附带 VC++ 运行库，避免旧系统运行库弹窗
  - `.iso` 扫描（按 `PLAYSTATION` 标记识别）
  - 4 MB PS2 BIOS 导入；`-bios` 启动 PS2 浏览器
  - `PCSX2.ini` 的 `[Pad1]` 键盘键位适配
- **PSP（PPSSPP master）**
  - 内置 PPSSPP，支持 `.iso/.cso/.elf`
  - `--vsh` 启动 PSP XMB（PPSSPP 1.21+ 能力）
  - **PSP 固件导入**：设置 → PlayStation 可直接选择已解密的 `flash0` 目录；也可点「打开 PPSSPP」用官方 EBOOT.PBP 安装
  - 缺固件时明确提示，不静默失败
  - 16:9 封面抓取 + PPSSPP `controls.ini` 键位适配

### 界面与设置

- PlayStation 设置页改为双栏：左系统文件（PS1 BIOS / PS2 BIOS / PSP flash0）/ 右键位
- PS1 / PS2 / PSP 键位芯片直接放进键位面板
- 修复 PSP 说明和「打开 PPSSPP」按钮误挂在 grid 外导致的右侧大空白
- 主机墙 PlayStation 家族完整显示，PS1/PS2/PSP 显示引擎就绪

### 固件绿色化

- PSP `flash0`、Cemu MLC 等用户数据放在 `nest-assets`，引擎侧使用 junction
- 打包清理（`clean-engines`）只解链，不递归删用户固件
- 便携包 **不包含** 任何 BIOS / 固件 / 游戏数据 / 密钥

## 下载信息

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.4.2-beta.1-portable.zip` |
| 大小 | 328.5 MB |
| 解压 | 807.1 MB / 3597 文件 |
| SHA256 | `A447EE2EF2581A7492FD61FB51DE11D4B1E8915CF00167EC7F80261C1B2D6402` |

## 首次使用

1. 解压到任意目录
2. 双击 `Nest.exe`；想完全便携就双击 `启动 Nest.bat`
3. 扫描你的 ROM / ISO / 游戏目录
4. 固件：设置 → PlayStation / Nintendo →「系统文件（自备）」
   - PS1/PS2：导入自己的 BIOS
   - PSP：导入已解密 `flash0`，或点「打开 PPSSPP」安装官方 6.61 EBOOT.PBP

## 已知限制

- **PS1 系统模式故障**：SwanStation BIOS 界面输入无响应，入口保留但标记「故障」；PS1 直读正常
- **PSP XMB 需要固件**：没有 flash0 时系统模式会给明确提示；PPSSPP 的 `--no-gui` 不能安装固件，所以安装仍需 GUI 点一次（Nest 提供入口）
- **PS3 后置**：RPCS3 引擎未打包；其 XMB 支持仍在未合并 PR #19444（part 1/3），当前只计划直读、不做系统菜单
- **NGC 系统菜单**仍走 Dolphin Qt + UIA；Wii Menu 走 libretro 宿主，无 UIA
- Wii U Menu 仍为实验性（Cemu 2.6 限制）
- 无数字签名：首次运行 SmartScreen 选「更多信息 → 仍要运行」

完整改动见仓库 `docs/nintendo/CHANGELOG.md` 的 `0.4.2-beta.1` 节。
