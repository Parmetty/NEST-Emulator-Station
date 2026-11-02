# ENGINE · SwanStation（PS1 主选）

> 调研状态：README / 源码 / libretro buildbot 核实；未跑真实镜像
> 结论：**PS1 改用 SwanStation 作为主选引擎**，DuckStation 降级为“可选探测”（用户自己装）

## 为什么换成 SwanStation

| 对比项 | DuckStation（原计划） | **SwanStation** |
|---|---|---|
| 许可证 | CC BY-NC-ND 4.0（非商业、禁改、不宜随包） | **GPLv3**（可随包分发） |
| 形态 | 独立 Qt 前端 | **libretro core**（`swanstation_libretro.dll`） |
| 与 Nest 集成 | 外部进程 | 直接复用 Nest 自写 libretro 宿主（`nest-libretro.exe`） |
| BIOS | 必需 | **可选**：没有 BIOS 时回落 OpenBIOS |
| 格式 | bin/cue、CHD、PBP 等 | 同一套（DuckStation hard fork）：bin/cue、raw bin/img、CHD、ECM、MDS/MDF、PBP |
| 功能 | 完整 Qt UI | 核心功能齐全：JIT、PGXP、存档、快进、金手指、RetroAchievements |
| 分发 | 只能引导用户安装 | 可直接内置 dll（约几十 MB） |

来源：https://github.com/libretro/swanstation （README：DuckStation hard fork、OpenBIOS 回落、GPLv3）

## 形态与集成

- core 下载：`buildbot.libretro.com/nightly/windows/x86_64/latest/swanstation_libretro.dll.zip`（HTTP 206 可访问）
- Nest 宿主已支持：`--core`、`--rom`、`--system-dir`、`--save-dir`、`--shot-dir`、`--core-option`
- BIOS：放进 `--system-dir`（SwanStation 按区域找 `scph*.bin`；缺省可用 OpenBIOS）
- 存档：`--save-dir` 隔离到 Nest 数据目录
- 键位：宿主把键盘/手柄映射到 libretro joypad；具体 PS1 按键语义需实测
- 抓帧：宿主 `--shot-dir` 已有封面链路

## 系统模式

- SwanStation 作为 libretro core **以内容启动**；没有“单独 BIOS shell”入口
- 因此 PS1 的系统模式（BIOS shell）：
  - **默认不做**（PS1 没有游戏库式系统菜单，BIOS shell 只能管记忆卡）
  - 如果用户本机装了 DuckStation，可选用其 `-bios` 作为“BIOS shell”（探测到才显示，不随包）
- Nest 里 PS1 的 `capabilities.systemMode` 先留空，避免假装

## Nest 接入设计（P6.1）

清单 `resources/engines/swanstation.json`（kind=node/native 由宿主方式决定）：

```json
{
  "id": "swanstation",
  "name": "SwanStation (libretro)",
  "systems": ["ps1"],
  "kind": "native",
  "detect": { "paths": ["{tools}/nest-libretro.exe", "{engines}/swanstation/swanstation_libretro.dll"] },
  "launch": {
    "args": [
      "--core", "{engines}/swanstation/swanstation_libretro.dll",
      "--rom", "{rom}",
      "--system-dir", "{userData}/libretro/sys",
      "--save-dir", "{userData}/libretro/save",
      "--shot-dir", "{userData}/covers-pending",
      "--shot-every", "120",
      "--timeout", "0",
      "--log", "{userData}/libretro/nest-libretro.log"
    ],
    "systemArgs": []
  },
  "capabilities": { "saveStates": true, "systemMode": null }
}
```

- 扫描：`.cue` / `.chd` / `.pbp` / `.iso` / `.mds` / `.ccd`；`.bin` 必须配 `.cue`
- BIOS 导入：设置 → PlayStation →「PS1 BIOS」（可选），放 `{userData}/libretro/sys/scph*.bin`
- 键位：先走宿主默认键盘表，后续按核心 joypad id 做适配器
- 封面：复用宿主抓帧（4:3）

## 待验证

- [ ] SwanStation core 在 Nest 宿主里的实际启动（`retro_load_game` 内容路径、核心选项）
- [ ] BIOS 文件名识别规则（`scph5501.bin` 等）与 OpenBIOS 回落表现
- [ ] 键位/手柄映射与 Nest 键位面板的对接
- [ ] 存档目录与即时存档路径
- [ ] 与 DuckStation 的兼容差异（个别游戏）

## 备选方案（如果 SwanStation 出问题）

| 方案 | 许可 | 形态 | 备注 |
|---|---|---|---|
| Beetle PSX（libretro core） | GPLv2 | libretro | 同样可走 Nest 宿主；BIOS 必需 |
| PCSX-Redux | GPLv2 | 独立进程 | 调试向 UI，可做兜底 |
| Mednafen | GPLv2 | 独立 CLI | 无 GUI，配置繁琐 |
| DuckStation | CC BY-NC-ND | 独立进程 | 只探测、不随包 |
