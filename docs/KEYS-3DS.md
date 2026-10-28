# 3DS（Azahar）使用说明

本文对应 Nest 10.28 的 3DS 接入。Azahar 不是内嵌核心，而是以独立进程启动；Nest 负责准备配置、启动、抓封面和收尾。

## 1. 能做什么

| 场景 | 启动方式 | 需要自备 |
| --- | --- | --- |
| 3DS 游戏直读 | `azahar.exe "<游戏>"` | `.3ds` / `.cci` / `.cxi` 镜像，或自制程序 `.3dsx` |
| 全屏启动 | 设置面板勾“全屏启动引擎” → `azahar.exe -f "<游戏>"` | 同上 |
| HOME Menu 系统模式 | **不支持**（Azahar 没有这个入口，Nest 也不显示） | — |

> 没有系统模式是引擎能力边界，不是配置问题。Citra 系模拟器从来没有启动 HOME Menu 的能力，
> 所以 Nest 的 3DS 信息卡不会给「系统模式」入口（D12：没有的不假装）。

## 2. 数据放在哪

Azahar 默认把配置和 NAND 写到 `%APPDATA%\Azahar`，且不认 `--user-data-dir`。Nest 在启动子进程时把
`USERPROFILE / APPDATA / LOCALAPPDATA` 重定向到 Nest 的数据目录，所以实际位置是：

```
.profile\azahar\AppData\Roaming\Azahar\
├─ config\qt-config.ini     ← 键位与设置
├─ nand\                    ← 系统文件 / 存档 / SD
├─ sdmc\
├─ sysdata\                 ← DSP 固件等
└─ shaders\                 ← 着色器缓存
```

换 `--user-data-dir` 就换一套 3DS 数据；删掉 `.profile\azahar` 等于恢复出厂。

## 3. 默认键盘映射

首次启动 Azahar 时，Nest 会检查 `qt-config.ini` 是否还是 Azahar 原始默认（`button_a="code:65…"`，即 A/S/Z/X + 方向键）：

- 还是默认：备份为 `qt-config.ini.before-nest`，写入下表，并标记 `.profile\azahar\.nest-controls-v1`。
- 已经自定义：不覆盖，只写标记。

| 3DS 功能 | 按键 |
| --- | --- |
| 摇杆（Circle Pad）上 / 下 / 左 / 右 | `W` / `S` / `A` / `D` |
| A | `空格` |
| B | `J` |
| X | `K` |
| Y | `L` |
| L / R | `Q` / `E` |
| ZL / ZR | `1` / `2` |
| Start / Select | `Enter` / `Backspace` |
| 十字键 | 方向键 |
| C 摇杆（C-Stick）上 / 下 / 左 / 右 | `T` / `G` / `F` / `H` |
| 触摸屏 | 鼠标（Azahar 的 `emu_window`） |

说明：

- 键盘摇杆只有“满/零”，没有力度；需要精细操作建议接手柄。
- 手柄不经过 Nest，接上后在 Azahar 的「模拟 → 配置 → 控制」里选。
- 键位写入与重启后保持已验证；实际按键手感没有自动化验证（测试用的自制程序只吃触摸）。

## 4. 自定义与恢复

- 自定义：在 Azahar 里改（模拟 → 配置 → 控制），Nest 不会覆盖。
- 恢复默认：关闭 Azahar，把 `qt-config.ini.before-nest` 改名回 `qt-config.ini`，删掉 `.nest-controls-v1`，下次启动 Nest 会重新写入默认键位。
- 想彻底重置：删掉 `.profile\azahar\AppData\Roaming\Azahar\config\qt-config.ini`。

## 5. 封面抓取

`resources\tools\nest-capture.exe` 抓 Azahar 客户区，退出时取最后一帧：

- 清单里 `captureCropTop: 26` / `captureCropBottom: 26`（96 DPI 逻辑像素），按窗口 DPI 放大后裁掉 Qt 菜单栏与底部状态栏。
- 实测 125% 缩放、1280×545 客户区 → 封面 1280×479，只剩双屏画面。
- 全屏启动时不裁切（全屏没有 chrome），封面就是整屏画面。
- 抓屏仍要求窗口在前台；最小化或被完全遮挡时不抓。

## 6. 会话结束

Azahar 是单进程 GUI：关闭游戏窗口 = 进程退出，Supervisor 的 `close` 事件直接把 Nest 拉回前台。
不需要 Dolphin 那套“渲染窗口监视”。

## 7. 常见问题

**没有声音**

Azahar 提示 `no sound: run DSP1 once to dump your DSP firmware`：需要用自己的 3DS 导出 DSP 固件，
放到 `.profile\azahar\AppData\Roaming\Azahar\sysdata\`。Nest 不附带。

**启动报缺少系统文件 / 黑屏**

部分商业游戏需要 shared font、seeddb 等系统文件；这些同样由用户自备，放进 `nand` / `sysdata`。
自制的 `.3dsx` 通常不需要。

**打开“全屏启动引擎”后 Azahar 一闪而过**

旧版清单写的是 `--fullscreen`，Azahar 不认长选项会直接退出；现在已改为 `-f`。若还有问题，
检查 `resources\engines\azahar.json` 的 `fullscreenFlag` 是否为 `-f`。

**游戏卡片没有封面**

运行时间太短（抓帧间隔 5 秒）或窗口不在前台。玩久一点、保持窗口可见再退出。

**存档在哪**

在 `.profile\azahar\AppData\Roaming\Azahar\nand` 里（Azahar 自己的 NAND 结构），不在 ROM 旁边。

## 8. 手柄
Azahar 的按键默认全部绑键盘，**没有默认手柄绑定**；而且一个按键只能存一个绑定，键盘和手柄不能同时生效。

Nest 的做法是**按启动时有没有手柄自动切换**：

- 插着手柄启动 → 写一整套 SDL 绑定（`maptype:all`，匹配任意手柄），键盘让位；
- 没插手柄启动 → 写回键盘绑定；
- 切换会备份 `qt-config.ini.before-nest`，并记录 `.nest-controls-mode`。

| 3DS | 手柄 |
| --- | --- |
| A / B / X / Y | B / A / Y / X（按物理位置） |
| Start / Select | Start / Back |
| L / R | LB / RB |
| ZL / ZR | LT / RT |
| 十字键 | 十字键 |
| Circle Pad | 左摇杆 |
| C-Stick | 右摇杆 |
| 触摸屏 | 鼠标（手柄替代不了） |

注意：手柄是**启动时判断**的，运行中插拔要下次启动才生效；支持 SDL 能识别的手柄，杂牌可能错位。
详见 `docs/GAMEPAD.md`。

## 9. 没有 3DS 游戏怎么办

Nest 不含任何 3DS 游戏。合法的测试/游玩方式是**自制程序（homebrew）**，`.testroms\3ds` 里已经放了两个：

| 文件 | 许可 | 用途 |
| --- | --- | --- |
| `blockblast.3dsx` | zlib | 触摸操作，验证启动 / 封面 |
| `snake.3dsx` | MIT | 十字键操作，验证**手柄/键盘按键** |

打开 Nest → 3DS → 扫描 `.testroms\3ds` → 卡片出现 → 启动即可。
商业 3DS 游戏需要你自己从卡带 dump（`.3ds` / `.cci` / `.cxi`），Nest 不提供也不下载。
