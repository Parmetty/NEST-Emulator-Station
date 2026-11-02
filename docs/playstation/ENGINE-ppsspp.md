# ENGINE · PPSSPP（PSP）

> 调研状态：官方文档 + 源码核实（CLI / XMB / memstick），未跑真实镜像
> 适用阶段：P6.2

## 基本信息

| 项 | 值 |
|---|---|
| 项目 | https://github.com/hrydgard/ppsspp |
| 作者 | Henrik Rydgård（2012 年起） |
| 最新稳定 | **v1.20.4**（2026-05-16） |
| 许可证 | GPLv2+（LICENSE.TXT，含 PSPSDK 等第三方声明） |
| Windows 包 | `PPSSPP-v1.20.4-Windows-x64.zip` 19.4 MB |
| 数据目录 | `memstick/PSP/SYSTEM/ppsspp.ini`；`--memstick=DIR` 可重定向 |

## 关键事实

- **无 BIOS 需求**（PSP 固件只用于 XMB/系统功能）
- 官方已支持 `--memstick=DIR`、`--root=DIR`、`--fullscreen`、`--windowed`、`--state=FILE`、`--pause-menu-exit`、`--escape-exit`
- 程序目录存在 `memstick\` 时自动使用（Windows 源码 `InitMemstickDirectory`）

## 系统模式（XMB / VSH）

- **PPSSPP 1.21 起支持 PSP 的 XrossMediaBar**（官方文档 *How to run the XMB (VSH)*）
- 入口：`File → Load XMB (VSH)`；开发版有 `--vsh` 直接 HLE 引导 `vshmain.prx`
- 前置：需要 **PSP 固件**
  - 从游戏光盘自动安装（1.21 起：启动游戏时自动装光盘里的固件更新）
  - 或下载官方 6.61 更新包后在 PPSSPP 里安装
- XMB 里能：启动游戏（Insert UMD）、启动自制程序、启动 PS1 游戏（Game 菜单）；退出游戏回 XMB
- 限制：**XMB 运行时即时存档不可用**；1.20.4 稳定版没有此功能

## Nest 接入设计

清单 `resources/engines/ppsspp.json`：

```json
{
  "id": "ppsspp",
  "name": "PPSSPP",
  "systems": ["psp"],
  "kind": "native",
  "detect": { "paths": ["{engines}/ppsspp/PPSSPPWindows64.exe"] },
  "launch": {
    "args": ["--fullscreen", "--memstick={userData}/playstation/ppsspp/memstick", "{rom}"],
    "systemArgs": ["--fullscreen", "--memstick={userData}/playstation/ppsspp/memstick", "--vsh"],
    "fullscreenFlag": "--fullscreen"
  },
  "capabilities": { "saveStates": true, "systemMode": "PSP XMB（需 1.21+ 与固件）" }
}
```

- 扫描：`.iso` / `.cso` / `.pbp`
- 抓帧：16:9
- 键位：`ppsspp.ini` 的 `[ControlMapping]`（字段待实测）
- 系统模式优先级：**先做直读**；XMB 作为实验性，等 1.21 稳定再默认开启

## 未决问题

- [ ] 1.21 正式版发布时间（当前 1.20.4 稳定版没有 XMB）
- [ ] `--vsh` 在 1.21 稳定版是否保留为 CLI（目前只见于开发版源码笔记）
- [ ] XMB 自动安装固件的兼容性（游戏盘版本各异）
- [ ] WebSocket API 是否能用于“插入 UMD / 启动游戏”自动化
- [ ] `ppsspp.ini` 键位字段结构（跑一次生成后抓取）
