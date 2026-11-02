# Dolphin（NGC / Wii）使用说明

本文对应 Nest 10.28 的 Dolphin 缝合版。Dolphin 不是 Nest 内嵌核心，而是以独立进程启动；Nest 负责准备配置、启动、监视窗口、抓封面和收尾。

## 1. 能做什么

| 场景 | 启动方式 | 需要自备 |
| --- | --- | --- |
| NGC 游戏直读 | `Dolphin.exe -u <profile>/dolphin -b -e <游戏>` | NGC 镜像（`.gcm` / `.iso` / `.rvz`） |
| Wii 游戏直读 | 同上 | Wii 镜像（`.iso` / `.wbfs`） |
| NGC 系统菜单 | Dolphin GUI → 工具 → 载入 GameCube 主菜单 | 对应区域 `IPL.bin` |
| Wii 系统菜单 | `-b -e wii-menu.wad`，或 `-b -n 0000000100000002` | `wii-menu.wad`，或已安装 Wii NAND |

> Dolphin 官方命令行没有“直接进入 GameCube 主菜单”的参数。Nest 的做法是：先用 GUI 启动 Dolphin，再通过 UI Automation 精确调用「工具 → 载入 GameCube 主菜单 → 对应区域」，不发送键盘序列，也不依赖鼠标坐标。

## 2. NGC 系统菜单

把 IPL 放到 Nest 的 Dolphin 用户目录：

```
.profile\dolphin\GC\USA\IPL.bin   → NTSC-U
.profile\dolphin\GC\JAP\IPL.bin   → NTSC-J
.profile\dolphin\GC\EUR\IPL.bin   → PAL
```

Nest 会自动检测存在的区域，并在菜单里选择对应项。三个区域都有时按 USA → JAP → EUR 的顺序优先。

启动 NGC 系统模式时，Nest 会临时把 `Dolphin.ini` 的 `[Core] SkipIPL` 设为 `False`；直读游戏时会设回 `True`。这是必须的：

- 直读：`SkipIPL=True`，否则日版/美版游戏会去找对应区域 IPL，找不到就报错。
- 系统菜单：`SkipIPL=False`，因为 GameCube 主菜单本身就是 IPL。

## 3. Wii 系统菜单

把 System Menu WAD 放到：

```
.profile\dolphin\wii-menu.wad
```

Nest 用 `-b -e wii-menu.wad` 直接启动，不需要先安装 WAD，也不会打开 Dolphin 游戏列表。

如果 WAD 不存在，但 `<profile>\dolphin\Wii\title\00000001\00000002\content\title.tmd` 已存在，Nest 会自动改用 `-b -n 0000000100000002`，从 NAND 直接启动已安装的 Wii 菜单。

## 4. 默认键盘映射

首次启动 Dolphin 时，Nest 会写入一套默认键位；写入前会检测 `GCPadNew.ini` 是否还是 Dolphin 原始默认值：

- 如果还是默认值：备份为 `GCPadNew.ini.before-nest`，然后写入下表。
- 如果已经自定义：不覆盖，只写一个 `.nest-controls-v1` 标记。

| GameCube 功能 | 按键 |
| --- | --- |
| 主摇杆 上 / 下 / 左 / 右 | `W` / `S` / `A` / `D` |
| A | `空格` |
| B | `J` |
| X | `K` |
| Y | `L` |
| Z | `U` |
| Start | `Enter` |
| C 摇杆 上 / 下 / 左 / 右 | `T` / `G` / `F` / `H` |
| L 模拟肩键 | `Q` |
| R 模拟肩键 | `E` |
| 十字键 | 方向键 |

说明：

- 键盘不能真正模拟模拟摇杆的力度，只能输出最大/最小方向；需要精细操作时建议接手柄。
- Dolphin 自带手柄支持，接上手柄后可在 Dolphin 的「控制器」里改用真实手柄。
- Wii 遥控器/双节棍不在默认键盘映射内，需要在 Dolphin 控制器设置里单独配置。

## 5. 封面抓取

Dolphin 使用 `resources\tools\nest-capture.exe` 抓取客户区，`captureMinHeight=240`：

- 正常游戏窗口（如 800×600）会被抓取。
- Dolphin 的“警告”对话框通常只有 100 多像素高，会被跳过，不会变成封面。
- 抓屏仍要求窗口在前台；最小化或完全被遮挡时不抓。

## 6. 会话结束

- 直读：Dolphin 以 `-b` 批处理模式运行，关闭游戏后进程退出，Nest 自动收尾。
- 系统模式：Dolphin 启动器进程可能比游戏窗口活得久；`nest-window.exe --render-title JIT64` 监视模拟窗口，窗口关闭后结束会话并恢复 Nest。

## 7. 常见问题

**启动 NGC 系统菜单提示缺少 IPL**

把对应区域的 `IPL.bin` 放进上面的目录。IPL 需要从自己的 GameCube 提取，Nest 不附带。

**启动后停在 Dolphin 游戏列表**

说明系统菜单的 UI 自动化没有点中菜单。查看：

```
.profile\shots\menu.log
```

日志里应出现 `expanded ...` 和 `invoked NTSC-U`。如果菜单语言不是中文/英文，Nest 会退回逐项扫描，速度会慢一些。

**直读游戏报“找不到 GC IPL”**

用 Nest 启动即可；Nest 会在直读前把 `SkipIPL` 设回 `True`。不要手动把 `Dolphin.ini` 改成 `False` 后直接用 Dolphin 开游戏。

**想恢复 Dolphin 原始键位**

关闭 Dolphin，把 `GCPadNew.ini.before-nest` 改名回 `GCPadNew.ini`，再删除 `.nest-controls-v1` 标记。
