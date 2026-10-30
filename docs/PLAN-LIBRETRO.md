# PLAN-LIBRETRO：自写 libretro 宿主（替代 UIA）

> 状态：宿主已打通（2026-10-31 凌晨）。GC 直读、Wii Menu 系统菜单均在 headless 下 exit 0 出画面。
> 代码：`tools/libretro/*.cs`（C# / .NET Framework 4.0 / csc 编译），产物 `resources/tools/nest-libretro.exe`
> 核心：`resources/engines/dolphin/dolphin_libretro.dll`（官方 libretro buildbot，18 MB，commit c386bd3b95）

## 为什么不用 UIA

Dolphin Qt 的系统菜单（GameCube Menu / Wii Menu）当年只能靠 UIA 点菜单进，问题是：
抢焦点、时序脆弱、Qt 菜单展开期间输入会丢、无头环境不可用。libretro 核心提供命令行级入口，
菜单就是"加载一个 WAD / 走 IPL"，不需要任何 GUI 自动化。

## CLI 契约

```
nest-libretro.exe --core <dolphin_libretro.dll>
                  [--rom <path>]             .gcm/.iso/.wad 等；省略 = 无内容启动
                  [--fullscreen]
                  [--scale N]                窗口缩放（默认 2）
                  [--frames N]               跑 N 帧后退出（按回调交付帧计数）
                  [--headless]               不建可见窗口（GL 上下文仍在，隐藏窗口 + FBO 读回）
                  [--shot <png>]             退出时把最后一帧写 PNG（glReadPixels）
                  [--shot-dir <dir>] [--shot-every N]   周期性存帧（封面用）
                  [--system-dir <dir>] [--save-dir <dir>]
                  [--core-option Name=Value] 覆盖核心变量（可重复）
                  [--keys "A=J,B=K,LX=LEFT"] 输入覆盖（键位面板传值用）
                  [--timeout <秒>]           硬超时（默认 120）
                  [--log <file>]
```

退出码：0 正常，1 参数错误，2 核心加载失败，3 load_game 失败，4 SDL/GL 初始化失败，5 超时未出帧。

## 关键实现经验（踩过的坑，别再犯）

1. **VC++ 运行时**：本机 System32 的 `msvcp140.dll` 是 14.11，核心需要 14.51。必须把
   `msvcp140 / vcruntime140 / vcruntime140_1 / concrt140`（取自 `resources/engines/dolphin/`）
   放在宿主 exe 同目录，否则核心在 boot 早期固定 RVA 崩溃（0xC0000005）。
2. **`retro_hw_render_callback` 布局**（x64，自然对齐，必须与 `libretro.h` 完全一致）：
   `+0 context_type`、`+8 context_reset`、`+16 get_current_framebuffer`、`+24 get_proc_address`、
   `+32 depth`、`+33 stencil`、`+34 bottom_left_origin`、`+36 version_major`、`+40 version_minor`、
   `+44 cache_context`、`+48 context_destroy`、`+56 debug_context`。
   写错偏移会覆盖核心的 `context_reset`，表现为 `retro_load_game` 内固定 RVA 崩溃。
3. **Dolphin 的 `retro_run()` 是异步的**：不能按调用次数判断"跑了几帧"，必须等视频回调交付。
   否则 boot 未完成就 unload，核心崩溃。
4. **NULL / Software 渲染是死路**：Dolphin 需要硬件 OpenGL；Null 后端下 `g_vertex_manager` 为空，
   踩 `Boot_BS2Emu.cpp` 的 `Fling` 直接崩。必须由宿主提供 OpenGL Core 上下文。
5. headless 用隐藏窗口 + GL 上下文 + glReadPixels；截图前要 `glBindFramebuffer(GL_FRAMEBUFFER, 0)`
   并 `glReadBuffer(GL_BACK)`，否则读到核心留下的 FBO。

## 已验证（2026-10-31）

| 场景 | 结果 |
|---|---|
| GC《红侠乔伊》直读 `--rom *.gcm --frames 600` | exit 0，59.6 fps，画面正常（`docs/evidence/libretro/ok-gc-viewtiful-joe.png`） |
| Wii Menu `--rom 4.3u.wad --frames 900` | exit 0，59.7 fps，健康提示页（`docs/evidence/libretro/ok-wii-menu.png`） |
| 无内容启动 | 核心不支持（崩溃）→ 不做 |

## 剩余工作

1. 输入：模拟摇杆（GC 主摇杆/C 摇杆）、GC Z、Wii 指针；键位面板传值
2. 封面：`--shot-dir/--shot-every` 出非黑帧，替代 `nest-capture.exe`（libretro 引擎专用）
3. Nest 接线：`resources/engines/dolphin-lr.json` + 系统菜单路径切换到宿主，UIA 作为回退
4. GC 主菜单：`dolphin_skip_gc_bios=disabled` 是否能在 IPL 菜单停留，待确认；不行就只保留 Wii Menu
