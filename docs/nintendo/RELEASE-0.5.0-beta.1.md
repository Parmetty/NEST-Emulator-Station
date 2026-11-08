# Nest 0.5.0 Beta · Xbox 360 + PS3 接入

> Windows 免安装携带版。下载 `Nest-0.5.0-beta.1-portable.zip`，解压后双击 **`Nest.exe`** 即可；
> 想让数据留在程序目录就双击 **`启动 Nest.bat`**。

## 这个版本有什么

### Xbox 360 接入（Xenia Canary）

- 内置 Xenia Canary（`resources/engines/xenia/`），直读 **GOD / ISO / XEX**
- GOD / STFS 目录扫描：识别 `00007000/<hash>.data` + LIVE 头，`4D530AA4` 这类 GOD 目录也能进库
- 启动时 Xenia 的免责声明由 `nest-dialog.exe`（UIA）自动点「否」，绝不点「是」；封面不会截到弹窗
- 封面裁掉任务栏（`captureFitWorkArea`）；退出监视 `nest-window.exe --render-title Xenia-canary`，窗口一关就回 Nest
- 键位面板新增 **Xbox 360** 芯片；方向键同时写 D-Pad 与左摇杆（`keybind_left_thumb_*`），赛车 / 射击类能转向
- **修复「面板里设了、游戏里没反应」**：Xenia 默认 `[HID] keyboard_mode = 0`（键盘禁用），
  `[HID.Key]` 全部解析成功却送不进游戏；适配器写键位时强制 `keyboard_mode = 1`
- 首次需要档案：游戏弹 `No Profiles` 时点 `SIGN IN` → `Create Profile` → 输入 Gamertag（用户一次性设置）
- **无 Dashboard / 系统菜单**：Xenia 不支持，只做直读

### PS3 接入（RPCS3 0.0.43）

- 内置 RPCS3 引擎核心 + seed 配置；**固件与用户数据不进仓库，也不进发布包**
- 扫描 `PARAM.SFO + USRDIR`（兼容 `PS3_GAME/...` 结构），直读 `rpcs3.exe --no-gui <游戏目录>`
- 默认窗口化；seed 配置固定 `Renderer: OpenGL`——Vulkan 下 Crysis 3 每轮约 70 秒必崩
- seed 里去掉了 RPCS3 0.0.43 拒绝的 `Input/Output: Keyboard` 行，以及被错误编码的 `Emulated Midi devices` 行
- 键位面板新增 **PS3** 芯片，写 `config/input_configs/global/Default.yml`；
  方向键同时写 D-Pad 与 `Left Stick Up/Down/Left/Right`
- **无 XMB / 系统模式**：RPCS3 不模拟 XMB，只做直读；固件（`dev_flash`）需自备

### 游戏库与界面

- **右键重命名**：只改 Nest 库里的显示名，不动磁盘文件——GOD 的 `4D530AA4` 这类占位标题终于能改了
- **Xbox 家族主机墙解锁**：Xbox / Xbox 360 与其它家族一起按发售年份排列

### 文档与工程

- 新增 `docs/BUILD-PORTABLE.md`：便携包从构建、组装、清理到 zip 与解压验证的完整流程
- 重建 `docs/README.md` 索引；更新 RPCS3 与 Xbox 文档
- 修复 2026-11-08 的 docs 编码损坏事故（6 份不可恢复文件已删除，记录见 `docs/archive/README.md`）
- 测试基线：**118 条单测全绿**

## 下载信息

| 项 | 值 |
|---|---|
| 文件 | `Nest-0.5.0-beta.1-portable.zip` |
| 大小 | 613.1 MB（642,832,700 字节） |
| 解压 | 1334.7 MB / 4723 个文件 |
| SHA256 | `BCE9A9B264EAC8BE351CB4EEFF4790DEBA9F5CAD09AA4F4EA53E80FF917B6BD2` |

Release 页面：<https://github.com/Parmetty/NEST-Emulator-Station/releases/tag/v0.5.0-beta.1>

## 首次使用

1. 解压到任意目录
2. 双击 `Nest.exe`；想完全便携就双击 `启动 Nest.bat`
3. 扫描你的 ROM / ISO / 游戏目录（PS3 选到游戏文件夹，Nest 认 `PARAM.SFO + USRDIR`）
4. 固件：PS3 自备 `dev_flash`（官方 PUP 安装后生成）；PS1 / PS2 / PSP 见设置 → PlayStation
5. **Xbox 360 首次建档**（只需一次）：
   - 启动游戏后若弹 `No Profiles`，用鼠标点 `SIGN IN`
   - 选 `Create Profile`
   - 输入 Gamertag → `OK`（之后 Xenia 自己记住，不再询问）
6. 键盘 / 手柄：设置 → 对应家族页的键位面板，保存立即生效

## 已知限制

- **PS3 / Crysis 3 随机超时断言**：游戏自身的 RenderThread 等待超时后 `abort()`（`0x0144517c`，预算约 0.8 秒），
  随机触发、调参不可根治（已试：存档、音频 NULL、SPU ASMJIT、网络开关、IP、`game_debug`、Clocks 50、宿主抓帧干扰）。
  这是时序竞态，不是固件或兼容性列表问题；建议换其它 PS3 游戏验证引擎。细节见 `docs/playstation/ENGINE-rpcs3.md`
- **PS3 无 XMB**：没有系统模式；固件需自备，发布包不含固件 / 游戏数据
- **Xbox 360 无 Dashboard**：只做直读；能否玩取决于 Xenia 版本，格式识别不等于可玩
- **初代 Xbox（xemu）未接入**：主机墙已就位，等 P7.1
- 其余沿用 0.4.2：Wii U Menu 仍为实验性、NGC 菜单走 Dolphin Qt + UIA、无数字签名
  （首次运行 SmartScreen 选「更多信息 → 仍要运行」）

完整改动见仓库 `docs/nintendo/CHANGELOG.md` 的 `0.5.0-beta.1` 节。
