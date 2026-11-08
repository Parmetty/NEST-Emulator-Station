# ENGINE · RPCS3（PS3）

> 状态：**已接入 Nest，直读可用**（0.4.2 之后追加）。
> PS3 无 XMB / 系统模式；只做直读。
> **渲染器默认改用 OpenGL**：Vulkan 下 Crysis 3 每轮约 70 秒必崩，OpenGL 可进菜单/游戏（详见文末）。

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

## 渲染器（重要）

| 渲染器 | 表现 |
|---|---|
| **OpenGL（仓库默认）** | 能过标题 → 菜单 → 选战役 → 进游戏内训练关；崩溃变为随机 |
| Vulkan | 每次启动后约 62–96 秒、在加载完成切标题/菜单的瞬间必崩 |

> 结论：PS3 引擎的 seed 配置固定 `Renderer: OpenGL`。改动见 `seed/config.yml`。

## 配置约定

- 仓库只跟踪引擎核心与 `seed/`：
  - `seed/config.yml`
  - `seed/input_configs/global/Default.yml`
- 运行时 `config/`、`dev_flash*`、`dev_hdd*`、缓存/存档全部 gitignore
- `clean-engines.mjs` 打包前会剥离这些用户数据
- **不要**在 `config.yml` 的 `Input/Output` 下写 `Keyboard: "Keyboard"`：RPCS3 0.0.43 会报
  `cfg::try_to_enum_value('Keyboard','Keyboard'): invalid enum or integer`。键位由
  `Player 1 Input: Handler Keyboard` 接管即可；该行已从 seed 移除。
- seed `config.yml` 里原有的 `Emulated Midi devices: Keyboard脽脽脽@@@…` 是错误编码的残留，已删除。
- 缓存复用：把 `cache/<SERIAL>` 与 `dev_hdd0/game/<SERIAL>` 一起搬迁，可跳过首次
  “Precompiling shader interpreter variants（190 个变体，约 15–20 分钟）”。

## 当前已知问题

- **Crysis 3（BLAS50497）：游戏自身超时断言，非兼容性列表问题、非固件问题**

  崩溃签名（每轮完全一致）：

  ```
  Thread (RenderThread) [0x0144517c]  SIG: Thread terminated due to fatal error: PPU Trap!
  [01445174] cmpld cr0,r3,r23
  [01445178] ble   0x1445180        ; 未超时 → 继续等
  [0144517c] tw    31,r1,r1         ; 超时 → 游戏自己 abort()
  [01445188] sc    #sys_timer_usleep  ; 每次睡 2000µs，最多 1000 次
  ```

  - 本质：RenderThread 在一个“等待某完成信号”的循环里，预算约 0.8 秒（实测 363–471 次 × 2ms）；
    信号没来 → 游戏自己 abort。RPCS3 只是照执行，不是“不支持某条指令”。
  - `Stub PPU Traps: 1` 只是把 abort 换成空转：模拟器层面僵死（FPS 冻结、画面静止、僵尸进程）。
  - 崩溃时机随机：60 秒 ~ 20 分钟都有可能；与画面、按键、进度无关；同一配置两次结果可能差 3 倍。
  - 已排除：dev_flash/固件（4.93 正常、零模块/解密错误）、存档损坏、音频设备与 `Audio Renderer: Null`、
    `SPU Decoder: ASMJIT`、网络开关与 `Net: IP address`、`game_debug` 目录缺失、宿主抓帧干扰。
  - `Clocks scale: 50` 能降低触发概率（等待预算变 1.5 秒），但游戏降到约 1 FPS，不可用，**不作为默认**。
  - RPCS3 崩溃后关停还会报 `Some thread has probably deadlocked` —— 同一竞态的另一个表现。
  - 结论：RPCS3 0.0.43 × Crysis 3 的**时序竞态**；靠配置无法根治。
    建议：换其它 PS3 游戏验证引擎，或换 RPCS3 版本重试；不要反复清空重装 Crysis 3。
  - 证据：`nest/diag/ps3-run*/`（每轮的 RPCS3 日志、抓帧、时间线）。

- **方向键在 3D 游戏内无反应（已修）**
  - 原因：游戏内移动读的是**左摇杆**，而适配器原来只把方向键写到 D-Pad（`Up/Down/Left/Right`）。
  - 修复：`src/main/controls/rpcs3.ts` 现在把上/下/左/右同时写到 D-Pad 与
    `Left Stick Up/Down/Left/Right`；面板仍只读写 D-Pad 值。
  - Xbox 360（`xenia.ts`）同样处理（`keybind_left_thumb_*`），见 Xbox 相关记录。

- 原游戏目录只读，Nest/RPCS3 不修改它；删除的只应是 RPCS3 的 `dev_hdd0` 安装数据
