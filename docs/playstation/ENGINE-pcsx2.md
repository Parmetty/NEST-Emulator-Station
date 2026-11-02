# ENGINE · PCSX2（PS2）

> 调研状态：官方源码核实（CLI `-bios` / portable.ini），未跑真实镜像
> 适用阶段：P6.3

## 基本信息

| 项 | 值 |
|---|---|
| 项目 | https://github.com/PCSX2/pcsx2 |
| 作者 | PCSX2 团队（2001 年起的老牌项目，Qt 前端自 2.0） |
| 最新 | **v2.8.2**（2026-09-04） |
| 许可证 | GPLv3 |
| Windows 包 | `pcsx2-v2.8.2-windows-x64-Qt.7z` 24.5 MB |
| 数据目录 | 默认 `Documents\PCSX2`；程序目录放 `portable.ini`/`portable.txt` 走便携（源码 `EmuFolders::ShouldUsePortableMode`） |

## 关键事实

- **BIOS 必需**：没有 PS2 BIOS 无法启动游戏/BIOS 浏览器
- 便携：程序目录放 `portable.ini` 或 `portable.txt`，或命令行 `-portable`
- 记忆卡默认在 `memcards/`，可按游戏/全局配置
- CLI（`pcsx2-qt/QtHost.cpp` 核实）：`-batch` `-nogui` `-fastboot` `-slowboot` `-bios` `-fullscreen` `-nofullscreen` `-state` `-elf` `-disc` `-gameargs`

## 系统模式（BIOS 浏览器）

- `pcsx2-qt.exe -bios`：源码中 `-bios` → `AutoBoot(autoboot)->source_type = CDVD_SourceType::NoDisc`，即“无盘启动”进入 PS2 系统菜单（版本信息 / 记忆卡 / 浏览器）
- 是否需要额外参数：`-bios` 单独即可，BIOS 路径来自 PCSX2 配置
- 待实测：BIOS 浏览器里能否通过 PCSX2 的 `-disc` / Change Disc 插入 Nest 库里的镜像并启动

## Nest 接入设计

清单 `resources/engines/pcsx2.json`：

```json
{
  "id": "pcsx2",
  "name": "PCSX2",
  "systems": ["ps2"],
  "kind": "native",
  "detect": { "paths": ["{engines}/pcsx2/pcsx2-qt.exe", "C:/Program Files/PCSX2/pcsx2-qt.exe"] },
  "launch": { "args": ["-batch", "-fullscreen", "{rom}"], "systemArgs": ["-batch", "-bios"], "fullscreenFlag": "-fullscreen" },
  "capabilities": { "saveStates": true, "systemMode": "PS2 BIOS 浏览器" }
}
```

- 扫描：`.iso` / `.chd` / `.bin`+`.cue`；`.iso` 争抢需要按系统绑定扫描根或文件头判定
- BIOS 导入：设置页选 `scph*.bin`，校验后写入 PCSX2 便携目录 `bios/` + 配置
- 记忆卡：`data/playstation/pcsx2/memcards/`
- 抓帧：4:3（个别 16:9 游戏按窗口比例）
- 键位：`PCSX2.ini` 的 `[Pad1]` 字段（待实测）

## 未决问题

- [ ] `-bios` 启动后 Memory Card / Browser 的行为与截图
- [ ] 能否在 BIOS 浏览器中 Change Disc 后启动库里的镜像
- [ ] PCSX2 便携模式下 `BIOS` 路径写入的配置键
- [ ] 记忆卡按游戏隔离还是全局；存档备份（原 P2 遗留项）
