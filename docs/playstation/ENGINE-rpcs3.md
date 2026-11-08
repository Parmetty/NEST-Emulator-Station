# ENGINE · RPCS3（PS3）

> 状态：**已接入 Nest，直读可用**（0.4.2 之后追加）。
> PS3 无 XMB / 系统模式；只做直读。Crysis 3 有游戏级兼容性阻塞，见文末。

## 基本信息

| 项 | 值 |
|---|---|
| 项目 | https://github.com/RPCS3/rpcs3 |
| 许可证 | GPLv2 |
| 内置版本 | RPCS3 0.0.43 Alpha（Windows x64） |
| 引擎目录 | `resources/engines/rpcs3/` |
| 数据目录 | 跟随引擎目录；`dev_flash` 为用户自备固件 |
| 启动方式 | `rpcs3.exe --no-gui <游戏目录>` |

## Nest 接入

清单：`resources/engines/rpcs3.json`

```json
{
  "id": "rpcs3",
  "name": "RPCS3",
  "systems": ["ps3"],
  "kind": "native",
  "detect": { "paths": ["{engines}/rpcs3/rpcs3.exe"] },
  "launch": { "args": ["--no-gui", "{rom}"], "systemArgs": [], "cwd": "engineDir" },
  "captureAspect": 1.777777,
  "capabilities": { "saveStates": true, "systemMode": null }
}
```

- 扫描：PS3 游戏文件夹，识别 `PARAM.SFO + USRDIR`（也接受 `PS3_GAME/PARAM.SFO`）
- 封面：`captureAspect` 16:9，窗口化抓图
- 默认窗口化：`config.yml` 中 `Start games in fullscreen mode: false`；启动前适配器会补齐
- 键位：`config/input_configs/global/Default.yml`，默认：
  - 方向键
  - Cross=J / Circle=K / Square=U / Triangle=I
  - L1/R1=Q/E
  - Start=Enter / Select=Backspace
- 固件：用户自备 `dev_flash`（PUP 安装后生成）；仓库/发布包不包含固件
- 系统模式：**无**。RPCS3 不模拟 XMB，`capabilities.systemMode = null`

## 配置约定

- 仓库只跟踪引擎核心与 `seed/`：
  - `seed/config.yml`
  - `seed/input_configs/global/Default.yml`
- 运行时 `config/`、`dev_flash*`、`dev_hdd*`、缓存/存档全部 gitignore
- `clean-engines.mjs` 打包前会剥离这些用户数据
- 不要强行把 `Input/Output: Keyboard` 写成 `"Keyboard"`：RPCS3 会报 `invalid enum or integer`；玩家 Pad 由 `Player 1 Input: Handler Keyboard` 接管即可

## 当前已知问题

- **Crysis 3（BLAS50497）**
  - `Stub PPU Traps: 0`：启动阶段 PPU Trap，RenderThread 崩溃
  - `Stub PPU Traps: 1`：可启动，但游戏 “installing game data” 卡死；安装数据停在约 2.45 GB / 358 文件，无磁盘增长
  - 判定：游戏 + RPCS3 0.0.43 兼容性问题，不是 Nest 接入问题
  - 不要反复清空重装；优先换 PS3 游戏验证引擎，或使用真机 PS3 的完整 `dev_hdd0/game/BLAS50497` 数据
- 原游戏目录只读，Nest/RPCS3 不修改它；删除的只应是 RPCS3 的 `dev_hdd0` 安装数据
