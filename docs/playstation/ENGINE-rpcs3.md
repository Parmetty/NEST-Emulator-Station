# ENGINE · RPCS3（PS3）

> 调研状态：官方源码核实（CLI / 无 XMB / 数据目录），未跑真实固件与游戏
> 适用阶段：P6.4（后置）

## 基本信息

| 项 | 值 |
|---|---|
| 项目 | https://github.com/RPCS3/rpcs3 |
| 作者 | RPCS3 团队（2011 年起） |
| 最新 | **v0.0.43 Alpha**（2026-09-30） |
| 许可证 | GPLv2 |
| Windows 包 | 官网 nightly（GitHub Releases API 没有 Windows 资产） |
| 数据目录 | Windows 默认 `%APPDATA%\rpcs3`；**没有 portable.txt 开关** |

## 关键事实

- **固件必需**：PS3 固件 PUP（`--installfw` 或 GUI 安装）才能运行游戏
- 游戏内容：目录型（`PS3_GAME`/`dev_hdd0`）或 `.iso`；不是单文件格式
- 数据隔离：Nest 用子进程重定向 `APPDATA` / `LOCALAPPDATA`（与 Azahar 相同思路）
- CLI（`rpcs3/rpcs3.cpp` 核实）：`no-gui`、`fullscreen`、`config`、`input-config`、`installfw`、`installpkg`、`savestate`、`headless` 等

## 系统模式

- **没有 XMB**：RPCS3 不模拟 PS3 的 XrossMediaBar（固件只用于运行游戏）
- 因此 PS3 在 Nest 里**只做直读 + 固件安装**，`capabilities.systemMode = null`
- 文档与 UI 都要写明“PS3 无系统菜单”，不假装

## Nest 接入设计（后置）

清单 `resources/engines/rpcs3.json`（草案）：

```json
{
  "id": "rpcs3",
  "name": "RPCS3",
  "systems": ["ps3"],
  "kind": "native",
  "detect": { "paths": ["{engines}/rpcs3/rpcs3.exe", "%APPDATA%/rpcs3/rpcs3.exe"] },
  "launch": { "args": ["--no-gui", "--fullscreen", "{rom}"], "systemArgs": [], "fullscreenFlag": "--fullscreen" },
  "capabilities": { "saveStates": true, "systemMode": null }
}
```

- 扫描：游戏目录 / `.iso`；目录型内容需要用户手动指定或按 `PS3_GAME` 结构识别
- 固件：设置页 PlayStation →「PS3 固件 PUP」导入（`--installfw <pup>`）
- 键位：`config/input_configs/.../Default.yml`（待实测）
- 体积/启动时间：文档如实标注，不承诺“即点即玩”

## 未决问题

- [ ] 固件 PUP 安装的 CLI 退出码与错误码
- [ ] 目录型游戏在扫描器里的识别方式（`PS3_GAME/PARAM.SFO`）
- [ ] `--no-gui` 与抓帧工具的兼容性
- [ ] RPCS3 数据目录重定向的副作用（更新检查、固件缓存）
