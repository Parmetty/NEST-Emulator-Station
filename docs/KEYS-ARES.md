# ares（FC / SFC / N64）键盘绑定

> **状态：实验性，Nest 暂不自动写入（2026-10-30）。**
> 格式已破译（见下），但 ares 自己写出的 inputID 和我们按 VK 码推出的值对不上：
> 实测只有 W/S（Up/Down）能对上，A/D/J/K 等会被 ares 显示成别的键、游戏内无反应。
> 因此 `ares.ts` 保持只读：Nest 不会碰 `settings.bml`，用户需在 ares 设置里手动绑一次（或用游戏手柄），
> 手动绑好后 Nest 会识别为“自定义布局”并永不覆盖。

ares 是便携引擎：设置就写在 exe 旁边的 `settings.bml`（BML，缩进式 ini）。
Nest 在启动前检查 Famicom / FamicomDiskSystem / SuperFamicom / Nintendo64 四个系统的
`Input → Controller.Port.1 → Gamepad`，必要时写入一套键盘默认键位。

## 1. 默认键位

| 主机功能 | 按键 | KeyCode |
| --- | --- | --- |
| 方向 上 / 下 / 左 / 右 | `W` / `S` / `A` / `D` | KeyW / KeyS / KeyA / KeyD |
| A / B | `J` / `K` | KeyJ / KeyK |
| X / Y（SFC） | `U` / `I` | KeyU / KeyI |
| L / R（SFC / N64） | `Q` / `E` | KeyQ / KeyE |
| Start | `Enter` | Enter |
| Select（FC / SFC） | 右 `Shift` | ShiftRight |
| Z（N64，固定） | `Space` | Space |

- FC / FDS：Up/Down/Left/Right/B/A/Select/Start。
- SFC：在 FC 基础上多写 Y/X/L/R（B/A 顺序不变）。
- N64：Up/Down/Left/Right/B/A/Start/L/R/Z；C 键本轮不绑定，Z 固定为 `Space`（不在 Nest 的
  `PAD_ACTIONS` 里，UI 暂不可改）。
- 只写 `Controller.Port.1`，Port 2–4、鼠标、手柄（SDL）和其它系统一概不动。

## 2. 存储格式

```ini
Famicom
  Input
    Controller.Port.1
      Gamepad
        Up: 0x1/0/57;;
```

assignment 的格式是：

```
0x<deviceID>/<groupID>/<inputID(hex)>;;
```

- `deviceID`：键盘在 ares v148 里是 **`0x1`**（用户手动绑一次键、ares 自己写出来的值）。
- `groupID`：键盘恒为 `0`。
- `inputID`：**Windows 虚拟键码（VK）的十六进制**，不是 SDL scancode。
- 末尾 `;;`：ares 自己就这么写；去掉是否还能识别未验证，Nest 照抄保留。
- 未绑定 = `;;`（冒号后一个空格 + `;;`，即 `Up: ;;`）。

### VK 对照表（Nest 默认用到的部分）

| 键 | VK | 写入值 | 键 | VK | 写入值 |
| --- | --- | --- | --- | --- | --- |
| W | 0x57 | `57` | A | 0x41 | `41` |
| S | 0x53 | `53` | D | 0x44 | `44` |
| J | 0x4A | `4a` | K | 0x4B | `4b` |
| U | 0x55 | `55` | I | 0x49 | `49` |
| Q | 0x51 | `51` | E | 0x45 | `45` |
| Enter | 0x0D | `d` | Space | 0x20 | `20` |
| 右 Shift | 0xA1 | `a1` | Backspace | 0x08 | `8` |
| ↑ / ↓ / ← / → | 0x26 / 0x28 / 0x25 / 0x27 | `26` / `28` / `25` / `27` |

完整映射在 `src/main/controls/keymap.ts` 的 `codeToAresVk()`；十六进制**小写、无前导零**
（对齐 ares 用 `nall::hex()` 写出的形式）。

## 3. 写入策略

- 首次启动：若目标字段全是 `;;`（或已经是 Nest 写的那套），备份 `settings.bml.before-nest`，
  写入默认值，并留下 `.nest-controls-v1` 标记。
- 自定义保护：目标字段里出现任何非 `;;` 且不等于 Nest 默认值的绑定，视为用户自定义，
  `force=false` 时不覆盖，只写 `.nest-controls-v1 = kept-user-config`。
- 在 Nest 键位面板里保存 / 恢复默认（`force=true`）：无条件重写（备份保留第一次的版本）。
- 只改目标行，不重排、不删除 `settings.bml` 里的其它节点。

## 4. 已知限制与风险

- **设备号硬编码 `0x1`**：这是本机 ares v148 的值（键盘设备的枚举 id）。换机器、换 ares 版本、
  或接多个键盘时理论上可能变；变号后 ares 会把绑定当作未知设备忽略。真机验证方法见下。
  ares 再次保存 `settings.bml` 时会按它自己的设备号重写，因此只要用户进过一次 ares 设置界面，
  文件就会自愈；Nest 下次写入前会读回并用读到的值判断"是否已是我们的绑定"。
- **十六进制大小写**：Nest 按 ares 自身（`nall::hex()`）的习惯写小写（`4a`/`a1`/`d`）。
  Lead 的实测证据只有 `57` 这类纯数字，字母 A–F 的大小写未在 GUI 里逐一核对过；若出现
  「W/S/A/D 生效但 J/K 不生效」的现象，优先把 `codeToAresAssignment()` 改成大写再试。
- `settings.bml` 缺失时 Nest 不写（ares 需要完整设置树，凭空造一个不完整的 BML 有风险）。
- ares 是便携模式：装到 `C:\Program Files` 这类只读目录时写不进去（见 `docs/RELEASE.md`）。
- 手柄绑定不在本功能范围内；N64 C 键、连发键等暂未覆盖。
- 用户在 ares GUI 里改过任一只目标键位后，Nest 会永久让位（直到在 Nest 里改键或恢复默认）。

## 5. 验证方法（不依赖截屏）

1. 读回：`readAresControls()` 应返回 `{ up: 'KeyW', a: 'KeyJ', … }`。
2. ares 自己认不认：启动 ares → Settings → Input，Famicom 的 Up 行应显示键盘图标 + W。
3. 一次真机：`node tools/run.mjs . --no-sandbox --user-data-dir=.profile --scan=.roms-fc-sfc --trylaunch=fc --hold=10000`
   （Start 能进 SMB3 地图即为生效）。SFC / N64 同理。
4. 看日志：`[nest] ares controls applied (<path>)` / `custom layout kept`。
