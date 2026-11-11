# Nest 0.6.0 Beta · Xbox 初代接入 + 库增强

> Windows 免安装携带版，**GitHub 最新版（Latest）**。下载 `Nest-0.6.0-beta.1-portable.zip`，解压后双击 **`Nest.exe`** 即可；
> 想让数据留在程序目录就双击 **`启动 Nest.bat`**。

## 这个版本有什么

### Xbox 初代接入（xemu 0.8.139）

- 内置 xemu（GPLv2，`resources/engines/xemu/`），主机墙 **Xbox** 状态变为 ready，Xbox 家族两台主机全部直读
- 扫描三种形态：XISO 镜像（XDVDFS 魔数）、裸 `.xbe`、含 `default.xbe` 的游戏文件夹
- 设置 → Xbox 导入三件套：**MCPX**（512 B）、**BIOS**（256 KB；1 MB 的四连体 dump 会自动取第一段）、
  **HDD**（qcow2，只记路径不复制）
- 启动时自动写便携 `xemu.toml`，并显式补 `-bios`——xemu 0.8.139 不自己读配置里的 `flashrom_path`
- **文件夹游戏 → XISO**：右键「打包为 XISO…」弹保存对话框，默认输出在游戏文件夹同级、同名 `.iso`，
  内置 `extract-xiso`；直接启动文件夹游戏也会自动打包；启动前再硬链接到无空格路径
  （xemu 的 QEMU 参数会把带空格的路径截断）
- 扫描器去重：打包后不会同时出现「文件夹 + ISO」两条记录
- 限制：xemu **没有键盘映射**（只认 SDL 手柄）；HDD 里没有 Dashboard 就进不了系统菜单

### PS3（RPCS3）渲染器可选

- 渲染器可选 **Vulkan / OpenGL**，默认 **OpenGL**（Crysis 3 兜底），启动时写入 `[Video] Renderer`
- 设置 → PlayStation 新增「打开 PS3 预编译缓存位置」按钮
- 切换渲染器只改配置，**不删除**另一渲染器的预编译缓存，来回切不用等重新编译

### 游戏库：官方标题 + 区域

- 直接从文件头读官方标题与区域：NDS / GBA / N64 / NGC / Wii / PS3（`PARAM.SFO`）/
  Xbox（XBE 证书，XISO 内也能读）/ Xbox 360（STFS 显示名）
- 卡片显示区域标签（NTSC-U / NTSC-J / PAL / Region-Free）；修掉 `4D530AA4` 这类占位名
- 手动重命名永远优先，不会被自动识别覆盖
- **自定义封面**：右键「自定义封面…」/「恢复自动封面」；设置过自定义封面的游戏，自动截图不再覆盖
- 固件区域标签：PS1（`scph55xx`）、PS2（`SCPH-xxxxx`）、Wii WAD 按 dump 名标注

### 其它

- 修复：Xbox 菜单里切换时键位面板不刷新（xemu 之前没被算作 Xbox 家族）
- 设置窗口左下角新增 **「关于 Nest」**：LOGO + 版本 + 产品定位 + GitHub 地址 + 全部引擎鸣谢
- 便携包清理新增剔除 xemu 运行时（`xemu.toml` / 日志 / `eeprom.bin` / shaders）
- 测试基线：**147 条单测全绿**（0.5.0 为 118 条）

## 下载信息

> **安全更正（2026-11-12）**：首次上传的包误带开发机的 Wii U NAND（`cemu/portable/mlc01`），
> 已删除并重新打包（402.4 MB）。请以下方信息为准，重新下载。

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.6.0-beta.1-portable.zip` |
| 大小 | 402.4 MB（421,930,148 字节） |
| 解压 | 992.2 MB / 3864 个文件 |
| SHA256 | `7613E1F5F46F2092337C5F853F4532CB645EE591B4DD700B101ED952B72EC00E` |

Release 页面（**最新版**）：<https://github.com/Parmetty/NEST-Emulator-Station/releases/tag/v0.6.0-beta.1>

## 首次使用

1. 解压到任意目录
2. 双击 `Nest.exe`；想完全便携就双击 `启动 Nest.bat`
3. 扫描你的 ROM / ISO / 游戏目录（PS3 选到游戏文件夹，Nest 认 `PARAM.SFO + USRDIR`）
4. 固件：PS3 自备 `dev_flash`（官方 PUP 安装后生成）；PS1 / PS2 / PSP 见设置 → PlayStation；
   任天堂系见设置 → Nintendo；Xbox 360 不需要固件
5. **初代 Xbox 先备固件**（设置 → Xbox，三个都要，缺一个会明确报错）：
   - MCPX：`mcpx_1.0.bin`，512 字节
   - BIOS：256 KB flash dump（1 MB 四连体也能导入，自动取第一段）
   - HDD：`xbox_hdd.qcow2`（QFI 头校验），只记路径，不复制、不移动
6. **初代 Xbox 游戏怎么放**：
   - 推荐 XISO 镜像，直接扫描即用
   - 解包的文件夹（含 `default.xbe`）：右键「打包为 XISO…」选保存位置，
     默认就是游戏文件夹同级的同名 `.iso`；也可以直接双击启动，Nest 会先自动打包
7. 键盘 / 手柄：设置 → 对应家族页的键位面板，保存立即生效（Xbox 初代目前只能用 SDL 手柄）

## 已知限制

- **xemu 无键盘映射**：xemu 0.8.139 只认 SDL 手柄，键位面板不覆盖 Xbox，请插手柄
- **初代 Xbox 系统菜单**：只有 HDD 镜像里带 Dashboard 才能进系统菜单；直读不受影响
- **xemu 只能读镜像**：不认解包文件夹，必须打包成 XISO（Nest 已内置手动与自动打包）
- **Xbox 360 无 Dashboard**：Xenia 不支持，只做直读
- **PS3 无 XMB**：只做直读；固件需自备，发布包不含固件 / 游戏数据 / 密钥
- **PS3 / Crysis 3 随机超时断言**：游戏自身的 RenderThread 超时后 `abort()`（`0x0144517c`），
  随机触发、调参不可根治，细节见 `docs/playstation/ENGINE-rpcs3.md`
- 其余沿用 0.5.0：Wii U Menu 仍为实验性、NGC 菜单走 Dolphin Qt + UIA、无数字签名
  （首次运行 SmartScreen 选「更多信息 → 仍要运行」）

完整改动见仓库 `docs/nintendo/CHANGELOG.md` 的 `0.6.0-beta.1` 节。
