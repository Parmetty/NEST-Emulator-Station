# ENGINE · DuckStation（PS1）

> 调研状态：文档级核实（官方 README + Wiki CLI + LICENSE），未跑真实镜像
> 适用阶段：P6.1

## 基本信息

| 项 | 值 |
|---|---|
| 项目 | https://github.com/stenzek/duckstation |
| 作者 | stenzek（PS1 高精度路线，rolling release） |
| 最新 | rolling `2026-10-25` |
| 许可证 | **CC BY-NC-ND 4.0**（非商业、禁止改作） |
| Windows 包 | `duckstation-windows-x64-release.zip` 70.6 MB |
| 用户目录 | 默认 `%LOCALAPPDATA%\DuckStation`；放 `portable.txt` 后 = 程序目录 |

## 许可证约束（重要）

- **不随包分发**：Nest 便携包不内置 DuckStation；只做“探测本机安装 + 官方下载链接”
- 若将来要内置：只能原样打包 + 署名，且不得修改程序文件；商业分发不允许
- 设置页写明“PS1 引擎需自行下载 DuckStation”

## 数据与便携模式

- 程序目录创建空文件 `portable.txt` → 用户目录 = 程序目录
- 用户目录内放：`bios/`、`memcards/`、`savestates/`、`settings.ini`、`gamecontrollerdb.txt`
- Nest 目标：`data/playstation/duckstation/` 作为用户目录（portable.txt 由 Nest 写入）

## 启动参数（Wiki 已核实）

```
duckstation-qt-x64-ReleaseLTCG.exe [参数] [--] [镜像]
  -batch      批处理（关机后退出）
  -fastboot   强开快启
  -slowboot   强开慢启（BIOS 动画）
  -bios       启动 BIOS shell（系统模式）
  -fullscreen 全屏
  -nogui      不显示主窗口（退出即结束）
  -bigpicture 大屏 UI
  -state N / -statefile FILE   读即时存档
```

## 系统模式

- **有**：`-bios` 进入 PS1 BIOS shell（记忆卡管理 / CD 播放器）
- 局限性：BIOS shell **不提供游戏启动**；直读游戏仍由 Nest 传镜像
- 前置：BIOS 文件必需（README 明确：没有 BIOS 无法启动模拟器/游戏）
- Nest UI 文案：写成「BIOS / 记忆卡」而非「游戏菜单」

## Nest 接入设计

清单 `resources/engines/duckstation.json`：

```json
{
  "id": "duckstation",
  "name": "DuckStation",
  "systems": ["ps1"],
  "kind": "native",
  "detect": { "paths": ["{engines}/duckstation/duckstation-qt-x64-ReleaseLTCG.exe", "%LOCALAPPDATA%/Programs/DuckStation/duckstation-qt-x64-ReleaseLTCG.exe"] },
  "launch": { "args": ["-batch", "{rom}"], "systemArgs": ["-batch", "-bios"], "fullscreenFlag": "-fullscreen" },
  "capabilities": { "saveStates": true, "systemMode": "PS1 BIOS Shell" }
}
```

- 扫描：`.cue` / `.chd` / `.pbp` / `.iso` / `.mds` / `.ccd`；`.bin` 必须伴随 `.cue`
- BIOS 导入：`bios/scph*.bin` 校验（大小 512 KB / 区域），写 `settings.ini` 或直接放目录
- 键位：`settings.ini` 的 `[Controller1]`/`[Controller2]` 字段（待实测格式）
- 封面：4:3 抓帧

## 未决问题

- [ ] `-batch` 与窗口关闭时是否影响 Nest 的“运行中”判定
- [ ] `-nogui` 是否能稳定配合 Nest 的抓帧（无主窗口 = 抓不到？）
- [ ] `settings.ini` 的键盘绑定字段结构（需要跑一次 DuckStation 生成）
- [ ] PS1 BIOS 的校验值和区域匹配策略
