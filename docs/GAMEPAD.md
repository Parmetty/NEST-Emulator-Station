# 手柄适配（mGBA / Azahar）

> 日期：2026-10-28｜范围：GBA（mGBA）与 3DS（Azahar）。
> 状态：**已实现自动检测**——插着手柄启动就用手柄绑定，没插就回到键盘。

## 1. 现在的行为

| 引擎 | 有没有手柄 | Nest 做什么 | 结果 |
| --- | --- | --- | --- |
| mGBA | 有 / 没有都一样 | 键盘绑定（空格/J/Q/E）+ 手柄按钮绑定（A=0、B=1、L=9、R=10、Start=6、Select=4）同时写入 | 键盘和手柄**都能用**，谁按谁生效 |
| Azahar | 有手柄 | 把 `button_*` 写成一整套 SDL 绑定（`maptype:all`） | **只能用手柄**，键盘绑定被替换 |
| Azahar | 没手柄 | 写回键盘绑定（空格/J/K/L + 方向键 + TGFH） | 只能用键盘 |

判断依据是 `resources/tools/nest-pads.exe`：它用 ares 自带的 `SDL3.dll` 枚举当前手柄，输出
`count=N`。Nest 在拉起 Azahar 前跑一次，`count>0` 走手柄模式，否则走键盘模式。

## 2. 为什么这样能“认所有手柄”

SDL 会把识别到的手柄归一成同一套逻辑按键（A=0、B=1、X=2、Y=3、Back=4、Start=6、LB=9、RB=10、
十字键 11–14、左摇杆轴 0/1、右摇杆轴 2/3、扳机轴 4/5）。所以不写设备名、不写 GUID：

- mGBA：`[gba.input.SDLB]` 只存按钮序号，天然通用；
- Azahar：绑定串里带 `maptype:all` + `api:controller`，源码里等价于“匹配所有手柄”
  （`guid` 置空、`port` 置 -1），换手柄不用重配。

覆盖范围：Xbox / XInput、DualShock 4、DualSense、Switch Pro、8BitDo 等 SDL 映射库内的手柄。
SDL 映射库之外的杂牌 HID 不保证，可能按钮错位。

## 3. 3DS 按键映射

| 3DS | 手柄 |
| --- | --- |
| A / B / X / Y | B / A / Y / X（按物理位置对应任天堂布局） |
| Start / Select | Start / Back |
| L / R | LB / RB |
| ZL / ZR | LT / RT（`axis:4/5`，阈值 0.5） |
| 十字键 | 十字键（按钮 11–14） |
| Circle Pad | 左摇杆（`axis_x:0` / `axis_y:1`） |
| C-Stick | 右摇杆（`axis_x:2` / `axis_y:3`） |
| 触摸屏 | 鼠标（手柄替代不了） |

## 4. GBA 按键映射

| GBA | 键盘 | 手柄 |
| --- | --- | --- |
| A | 空格 | A |
| B | J | B |
| L / R | Q / E | LB / RB |
| Start / Select | Enter / Backspace | Start / Back |
| 十字键 | 方向键 | 十字键 / 左摇杆 |

## 5. 实现的文件

| 文件 | 作用 |
| --- | --- |
| `tools/pads/NestPads.cs` → `resources/tools/nest-pads.exe` | SDL3 枚举手柄，输出 `count=N` |
| `resources/tools/SDL3.dll` | 从 ares 复制（zlib 许可），给检测工具用 |
| `src/main/ipc.ts` | `countGamepads()`、`ensureAzaharControls()` 模式切换、`ensureMgbaControls()` 补按钮 |
| `docs/STATE.md`、`3DS键位说明.md`、`GBA键位说明.md` | 用户可见说明 |

配置写入规则不变：只在“出厂值或 Nest 自己写的布局”上动，用户自定义过就跳过并留标记；
写前备份 `*.before-nest`，标记 `.nest-controls-v1` / `.nest-controls-mode`。

## 6. 验证记录

| 项目 | 结果 |
| --- | --- |
| `nest-pads.exe`（无手柄） | `count=0`，退出码 2 |
| `nest-pads.exe`（ViGEm 虚拟手柄） | `count=1`、`pad[0]=Xbox 360 Controller`，退出码 0 |
| `nest-pads.exe`（真实蓝牙手柄） | `count=1`、`pad[0]=Xbox One S Controller` |
| Azahar 无手柄 | 日志 `azahar controls: keyboard (gamepads=0)`，`button_a="code:32,engine:keyboard"`，标记 `keyboard` |
| Azahar 有手柄 | 日志 `azahar controls: gamepad (gamepads=1)`，`button_a="button:1,engine:sdl,guid:0,port:-1,maptype:all,api:controller"`，`circle_pad` 为 `axis_x:0,axis_y:1`，标记 `gamepad` |
| 切回键盘 | 拔掉手柄再启动 → 日志回到 `keyboard`，绑定恢复 `code:32` |
| mGBA | 日志 `mgba controls installed (keyboard Space/J/Q/E + pad buttons)`，`[gba.input.SDLB]` 写入 `keyA=0/keyB=1/keyL=9/keyR=10/keyStart=6/keySelect=4`，游戏正常启动 |
| 3DS 游戏运行 | 手柄绑定生效后 Azahar 仍能启动并跑自制程序（封面正常生成） |

## 7. 未验证 / 风险

- **按键功能没有做“按下有反应”的实测**：真实手柄现在能被 SDL 识别（`Xbox One S Controller`），
  但自动化只能造虚拟手柄，无法按真实按键；当前验证到“检测到 → 写对配置 → 引擎能启动”。
  最后一步需要人按一下（打开 `snake.3dsx`，按十字键看蛇是否转向）。
- 多只手柄同时插：两个引擎都只支持单玩家，实际用哪一只未验证。
- 蓝牙手柄重连后 `maptype:all` 是否稳定匹配，未验证。
- 手柄热插拔：只在启动时判断一次，运行中插拔要下次启动才切换。
- 无 SDL 映射的杂牌手柄可能按钮错位。
