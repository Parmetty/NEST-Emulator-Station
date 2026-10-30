# nest-libretro 输入 / 截图 / 超时验证（2026-10-31）

宿主：`resources/tools/nest-libretro.exe`（本次构建 85504 bytes，csc .NET Framework 4.0 / x64）
核心：`E:\workstop\engines-src\dolphin-libretro\dolphin_libretro.dll`（2609.0.157+c386bd3b95）
运行方式：全部 `--headless`（SDL 隐藏窗口 + OpenGL 4.5 Core），无可见窗口。

## 1. 新增 CLI

| 参数 | 说明 |
|---|---|
| `--shot-dir <dir>` | 每 `--shot-every` 帧存一张 PNG，命名 `frame-<帧号>.png`；第一张默认跳过黑帧 |
| `--shot-every <n>` | 截图间隔帧数（默认 120；`--shot-dir` 不写时也会补成 120） |
| `--timeout <秒>` | 硬超时（默认 120s，0 = 不限）；到点退出并打印 `WARNING: hard timeout reached after N frame(s)` |
| `--keys "A=J,B=K,LX=LEFT"` | 覆盖键盘绑定（Action=Key，逗号分隔；`LX/LY/RX/RY` 分别等价 `LL/LU/RL/RU`） |
| `--no-mouse` | 关闭鼠标（Wii 指针 / IR）|
| `--shot <png>` | 保留：退出时存最后一张 |

## 2. 输入映射（按核心自己声明的 input descriptors 建立，不猜）

核心通过 `RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS` 声明（描述符在第一次 `retro_run` 时到达，
宿主会在收到后重建映射表并打印）：

### GameCube（port 0, device=JOYPAD）
```
Up=4  Down=5  Left=6  Right=7
A=8   B=0    X=9    Y=1
L=12  R=13   Z=11   Start=3
L-Analog=14  R-Analog=15  Triforce-Test=10  Triforce-Coin=2
ANALOG index0: Control Stick X=0, Control Stick Y=1
ANALOG index1: C Buttons    X=0, C Buttons    Y=1
```

### Wii（port 0, device=JOYPAD）
```
Up=4  Down=5  Left=6  Right=7
A=8   B=0    "1"=9   "2"=1
"+"=3  "-"=2  Home=15  Shake Wiimote=13
ANALOG index0: Tilt Left/Right=0, Tilt Forward/Backward=1
```

### 键盘默认表（与 Nest 现有 Dolphin 布局一致）
```
十字键 = W/A/S/D
左摇杆 = ↑/↓/←/→（按下即满偏 ±32767）
A/B/X/Y/L/R/Z = J/K/U/I/Q/E/Space
Start/Select = Enter / 右 Shift
C 摇杆（右 ANALOG）= T/G/F/H
Wii: Home=F1, Shake=F2, Plus=Enter, Minus=RShift
```

### 实现方式
- 按钮：`retro_input_state(port, RETRO_DEVICE_JOYPAD(1|subclass), 0, id)`，走位掩码；
- 摇杆：`retro_input_state(port, RETRO_DEVICE_ANALOG(5), INDEX_ANALOG_LEFT/RIGHT(0/1), ID_ANALOG_X/Y(0/1))`
  返回 -32767..32767，键盘方向键为满偏，手柄轴超过 4000 死区后接管；
- 扳机：`ANALOG + INDEX_ANALOG_BUTTON(2) + id L/R` 返回 0/32767；
- Wii 指针：默认 `dolphin_ir_mode=1` 的核心读 **右 ANALOG**，鼠标相对位移映射到右摇杆；
  同时实现 `RETRO_DEVICE_POINTER(6)`（X/Y/PRESSED, index 0..3）与 `RETRO_DEVICE_MOUSE(2)`；
  鼠标只在 Wii 模式驱动右摇杆，避免误动 GC C 摇杆；`--no-mouse` 可关；
- `--keys` 覆盖示例（日志原样）：
  ```
  keys: A = Z (scancode 29)
  keys: B = K (scancode 14)
  keys: LL = LEFT (scancode 80)          # LX=LEFT
  keys: unknown action 'FOO' (known: ...)
  ```

## 3. 验证结果

### GC《红侠乔伊》600 帧 + 每 120 帧截图
命令：
```
nest-libretro.exe --core <core> --headless --frames 600 --shot-dir docs\evidence\libretro\shots-gc
  --shot-every 120 --rom "E:\workstop\nest-assets\roms\ngc\红侠乔伊_CN.火热乱斗.gcm"
  --system-dir docs\evidence\libretro\runtime\sys --save-dir docs\evidence\libretro\runtime\save
  --log docs\evidence\libretro\logs\final-gc.log
```
结果：`exit 0`，`run summary: frames=600 elapsed=10.07s effective_fps=59.58`，
`Using GFX backend: OGL`（非 Null）。
- 5 张 PNG（1280x1056）：`shots-gc/frame-00120.png` .. `frame-00600.png`
- 第 1 张即非黑：`avg_luma=1.30 nonblack=2.25%`（画面是记忆卡提示界面，黑底白字，
  旧判据 avg<5 会误杀；现判据为 `avg<5 且 nonblack<2%` 才算黑帧）

### Wii Menu WAD 900 帧 + 每 180 帧截图
命令同上，`--rom 4.3u.wad --frames 900 --shot-every 180`。
结果：`exit 0`，`run summary: frames=900 elapsed=15.07s effective_fps=59.70`，
`Active title: Wii Menu (0000000100000002)`。
- 4 张 PNG：`shots-wii/frame-00360.png` .. `frame-00900.png`
- frame-180 是开机黑帧（`avg_luma=0.37 nonblack=1.27%`）→ 按规则跳过；
  frame-360 起 `avg_luma=42.49 nonblack=22.11%`，画面为 Wii“Press A to continue”安全提示页

### 硬超时
`--timeout 6 --frames 900`（Wii）→ `loop finished: ... video_frames=360 elapsed=6.01s timeout=True`，
`WARNING: hard timeout reached after 360 frame(s)`，`exit 0`（日志 `logs/timeout-6s-test.log`）。

### `--core-option` 覆盖确实生效（补了可见日志）
- 旧现象解释：日志里 `variable dolphin_skip_gc_bios = 'enabled'` 是 `SET_VARIABLES` 的
  **默认值清单**，不是查询回答。现在 override 被核心查询时会额外打印：
  `GET_VARIABLE dolphin_skip_gc_bios -> 'disabled' (core option override)`，
  并在加载后打印 `core option overrides: default=... -> override=... [queried by core]`。
- 证据：`--core-option dolphin_cpu_core=0` → 核心日志 `CPU Core: Interpreter`；
  `--core-option dolphin_skip_gc_bios=disabled` → 核心走 IPL 分支（见下）。

## 4. GC 主菜单结论（libretro 路径不可行）

1) 带 GC 镜像 + `dolphin_skip_gc_bios=disabled`（180 帧）：
   核心日志出现 `Found IPL dump, loading Shift JIS font ... GC/USA/IPL.bin`，说明 IPL 被加载；
   但 IPL 会自动引导光盘，截图仍是游戏内记忆卡提示页（`logs/gc-ipl-boot-with-disc.log`、`.cache/gc-ipl-boot.png`）。
2) 不带内容（无 ROM）+ `skip_gc_bios=disabled`：`exit 0xC0000005`，
   WER：`nest-libretro.exe` 崩溃于 `ntdll.dll+0xA28D7`（CLR 异常分发二次崩溃），
   因此无盘停在 IPL 主菜单的路径不通（`logs/gc-menu-nodisc-crash.log`）。

**结论：Dolphin libretro 核心无法停在 GC IPL 主菜单；GC 主菜单需另想办法（Wii 菜单已可行）。**

## 5. 改动文件

- `tools/libretro/HostInput.cs`（重写：descriptor 驱动 id 表、键盘/手柄/鼠标、ANALOG、`--keys`）
- `tools/libretro/Sdl3.cs`（`SDL_GetGamepadAxis`、`SDL_GetRelativeMouseState`/`SDL_GetMouseState`/`SDL_SetRelativeMouseMode`）
- `tools/libretro/HostEnvironment.cs`（descriptor 表 + index 字段、`DescribeInputMapping`、`DescribeOverrides`、override 命中日志、descriptor 变更标记）
- `tools/libretro/HostVideo.cs`（`SaveCurrentFrame`、`LastShotNonBlack`、捕获新鲜度）
- `tools/libretro/Program.cs`（`--shot-dir/--shot-every/--timeout/--keys/--no-mouse`、硬超时、截图调度、映射表日志）
- `resources/tools/nest-libretro.exe`（重新编译，x64）

## 6. 复现命令

```powershell
cd E:\workstop\nest
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-libretro.ps1

$exe='resources\tools\nest-libretro.exe'
$core='E:\workstop\engines-src\dolphin-libretro\dolphin_libretro.dll'

# GC 600 帧 + 每 120 帧截图
& $exe --core $core --headless --frames 600 --shot-dir docs\evidence\libretro\shots-gc --shot-every 120 `
  --rom 'E:\workstop\nest-assets\roms\ngc\红侠乔伊_CN.火热乱斗.gcm' `
  --system-dir docs\evidence\libretro\runtime\sys --save-dir docs\evidence\libretro\runtime\save `
  --log docs\evidence\libretro\logs\final-gc.log

# Wii Menu 900 帧 + 每 180 帧截图
& $exe --core $core --headless --frames 900 --shot-dir docs\evidence\libretro\shots-wii --shot-every 180 `
  --rom 'E:\workstop\nest-assets\firmware\wii\4.3u.wad' `
  --system-dir docs\evidence\libretro\runtime\sys --save-dir docs\evidence\libretro\runtime\save `
  --log docs\evidence\libretro\logs\final-wii.log
```
