# PS1 / PS2 需要准备什么

> 用途：P6.1（PS1）与 P6.3（PS2）接入后的运行/验证素材。
> 原则：Nest 与引擎都**不提供、不下载、不分发** BIOS/固件/游戏；全部从你自己的主机和正版光盘获取。

## PS1（SwanStation / 可选 DuckStation）

| 需要 | 是否必需 | 说明 |
|---|---|---|
| **PS1 BIOS** | 推荐（SwanStation 可缺省用 OpenBIOS） | 任一区域：`scph5500`（日）、`scph5501`（美）、`scph5502`（欧）；约 512 KB，从自己的 PS1 导出 |
| **游戏镜像** | ✅ | `.cue` + `.bin`（推荐 redump 标准）、`.chd`（压缩单文件）、`.pbp`（PSN 版）、单轨 `.iso` |
| **记忆卡** | ❌ 不需要下载 | 引擎会按游戏创建；Nest 会把它收在数据目录 |
| DuckStation（可选） | 可选 | 只有想要 PS1 BIOS shell（系统模式）时才需要；SwanStation 不做 shell |
| 手柄 / 键盘 | 可选 | 默认键盘映射由 Nest 写入；手柄走引擎原生 SDL/XInput |

放置（接入后）：
- SwanStation BIOS → `data/libretro/sys/scph5501.bin` 等（Nest 设置页导入）
- 游戏 → 任意 ROM 文件夹，扫描 `.cue/.chd/.pbp/.iso`

## PS2（PCSX2）

| 需要 | 是否必需 | 说明 |
|---|---|---|
| **PS2 BIOS** | ✅ **必需** | 美版常用 `scph39001`、日版 `scph30000`/`scph70000` 等；约 4 MB，从自己的 PS2 导出 |
| **游戏镜像** | ✅ | `.iso`、`.chd`、`.bin` + `.cue` |
| **记忆卡** | ❌ 不需要下载 | PCSX2 启动时自动创建；Nest 会把记忆卡目录收在数据目录 |
| PCSX2 引擎 | 视打包方式 | 若 Nest 未内置，需要下载 PCSX2 2.8.2 Windows x64（`.7z`，约 24.5 MB） |
| 手柄 / 键盘 | 可选 | 同上 |

放置（接入后）：
- BIOS → `data/playstation/pcsx2/bios/scph39001.bin` 等（设置页导入）
- 游戏 → ROM 文件夹，扫描 `.iso/.chd/.bin+.cue`

## 格式与常见坑

- `.bin` 必须和同名 `.cue` 放一起；只有 `.bin` 会提示“缺少 cue”
- `.7z/.zip/.rar` 请先解压（Nest 不直接读压缩包里的镜像）
- PS1 的 `.pbp` 是单文件（PSN 版），可以直接扫描
- PS2 的 `.iso` 与 GC/Wii/PSP 冲突：接入时 Nest 按“系统绑定的扫描根/文件头”判定
- BIOS 区域与游戏区域不一致可能导致个别游戏异常；建议同区

## 许可与来源

- BIOS 属于主机的受版权保护固件：只能从自己拥有的主机导出（如 PS1 用 Caetla，PS2 用自制工具）
- 游戏镜像必须来自自己的正版光盘
- 仓库、便携包、Release 均不包含这些文件；测试/截图也只使用本地自备素材
