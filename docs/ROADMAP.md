# Nest 总路线图（跨家族）

> 最后更新：2026-11-03 · 当前版本 `0.4.1-beta.1`
> 原始计划（2026-10-25，只覆盖任天堂）保留在 [nintendo/PLAN.md](nintendo/PLAN.md)，作为历史对照；
> 本文是**现在生效的路线图**：任天堂系收尾 + PlayStation 系主线 + Xbox 预留。

## 一、进度对比：原计划 vs 实际

初始计划按「P0 骨架 → P5 交付」的单个任天堂家族设计，估算按周计。实际从 0.2.0-beta.1（2026-10-25）
走到 0.4.1-beta.1（2026-11-03），**10 天完成原计划 P0–P5 的大部分**，还多做了 DSi/NDS 整条线、设置拆分、
GBA 金手指、Cemu 键位。

| 阶段 | 原计划内容 | 实际状态 | 说明 |
|---|---|---|---|
| P0 骨架 | Electron/IPC/库/监管/假引擎/测试 | ✅ 完成 | 2026-10-25 |
| P1 垂直切片 | 扫描 + GBA 全链路 | ✅ 完成 | mGBA 内置 |
| P2 多系统闭环 | FC / SFC / N64 + 固件校验 + 每游戏设置 + 存档备份 | 🟡 核心完成 | 三主机可玩、固件中心已有；每游戏设置 / 存档备份未做 |
| P3 NGC + Wii | 直读 + NGC Menu + Wii Menu | ✅ 完成 | NGC Qt+UIA（约 2.8s）；Wii 走自写 libretro 宿主 |
| P4 Wii U | Cemu 直读 + MLC/keys + Wii U Menu | ✅ 完成（菜单实验性） | Cemu 2.6 卡 `nn_act.LoadConsoleAccount` |
| P4.5（计划外） | — | ✅ 完成 | NDS 四机型、DSi Menu、NDS 菜单插卡、设置按家族拆分、Cemu 键位、GBA 金手指 |
| P5 打磨与交付 | 手柄导航、封面、CRT 滤镜、首启向导、便携版、自动更新 | 🟡 部分完成 | 封面/自动扫描/便携包/运行中高亮已上线；CRT 滤镜、首启向导、自动更新、安装版未做 |
| P6 预留 | Xbox/PS 清单 + 空状态 | ✅ 预留完成 | 6 台机型已锁定占位；现在开始真正接入 |

**结论**：原 P1–P5 表不用重写内容，但要按上表更新状态；真正的新计划从 **P6 开始 = PlayStation 家族**。

## 二、新阶段总表

| 阶段 | 主线 | 目标 | 状态 |
|---|---|---|---|
| P5.1 | 任天堂收尾（小修小补） | 随 PS 主线并行：3DS 系统模式（等系统文件）、NGC/Wii 菜单插盘、Wii U Menu 等上游、NDS 存档备份 | 持续 |
| **P6.0** | **PS 调研** | 四引擎的便携模式/CLI/许可/体积/系统模式均已核实，产出 RESEARCH-P6.0 + 4 份 ENGINE 规格 | ✅ 完成（2026-11-03） |
| **P6.1** | **PS1（SwanStation libretro）** | 扫描 `.cue/.bin/.chd/.pbp` → 宿主启动 → 封面 → 键位（DuckStation 仅可选探测） | 下一里程碑 |
| **P6.2** | **PSP（PPSSPP）** | 扫描 `.iso/.cso/.pbp` → 启动 → 存档目录隔离 → 键位 | 待 P6.1 完成 |
| **P6.3** | **PS2（PCSX2）** | BIOS/记忆卡、`.iso/.chd/.bin+cue`、BIOS 浏览器入口 | 待 P6.2 |
| **P6.4** | **PS3（RPCS3）** | 固件 PUP、游戏目录/ISO、键位（无 XMB，系统模式不做） | 后置 |
| P7 | Xbox 家族 | xemu（Xbox）/ Xenia（Xbox 360），与 PS 同模式 | 预留 |
| P8 | 平台收尾 | 首启向导、自动更新、安装版、手柄导航全覆盖 | 未排期 |

## 三、PlayStation 阶段细化

详细方案见 [playstation/PLAN-PLAYSTATION.md](playstation/PLAN-PLAYSTATION.md)，调研报告见 [playstation/RESEARCH-P6.0.md](playstation/RESEARCH-P6.0.md)。简要：

1. **P6.0 调研周**：核实 DuckStation / PPSSPP / PCSX2 / RPCS3 的
   - 便携模式与用户目录隔离（Nest 必须把配置/存档收进自己的 `data/`）
   - 命令行参数（直读、全屏、记忆卡、BIOS 路径）
   - 配置格式（键位、画面、最近文件）与可写性
   - 许可（DuckStation GPLv3 / PPSSPP GPLv2+ / PCSX2 LGPLv3 / RPCS3 GPLv2）与体积
2. **P6.1 PS1**：先做最轻的 DuckStation（单文件镜像、无强制 BIOS、引擎配置简单）
3. **P6.2 PSP**：PPSSPP（无 BIOS、`.cso` 压缩镜像、memstick 隔离）
4. **P6.3 PS2**：PCSX2（BIOS + 记忆卡 + 系统浏览器入口）
5. **P6.4 PS3**：RPCS3（固件 PUP、游戏目录，最重，后置）

每个阶段完成标准（沿用任天堂系）：
- 扫描 → 卡片 → 启动 → 退出返回 → 封面生成
- 无 BIOS/固件时给合规提示，不静默失败
- 设置 → PlayStation 页有对应导入入口
- 键位面板至少覆盖键盘默认布局
- 发布前用真实 ROM/BIOS 验证并截图存档

## 四、跨家族事项

- **设置页**：已有 Nest / Nintendo / Xbox / PlayStation 四页，PS 引擎落地后把系统文件/键位/画面逐步填进 PlayStation 页
- **主机墙**：`SYSTEMS` 里 PS1/PS2/PSP/PS3 已占位（`locked`），解锁时补插图与年份
- **引擎分发**：沿用 D2/D13——先探测本机安装，缺失给官方链接；是否随包视体积/许可再定（PS 引擎普遍比任天堂引擎大）
- **授权边界**：BIOS / 固件 / 游戏镜像全部用户自备；仓库和便携包不含
- **测试基线**：单测从 100 条继续往上加；每接入一个引擎补适配器测试

## 五、风险

| 风险 | 应对 |
|---|---|
| PS 引擎体积大（PCSX2/RPCS3 数十 MB 起） | 先探测 + 官方下载链接；便携包不盲目内置 |
| BIOS/固件缺失导致"启动即黑屏" | 启动前检查并给明确错误码与设置入口 |
| `.iso` 扩展名跨家族冲突（PS2/PSP/PS3/GC/Wii） | 按系统扫描根 + 文件头/目录结构判定，冲突时让用户指定 |
| RPCS3 没有可用的系统菜单 | 不做系统模式，只做直读，文档写明 |
| 键位格式各不相同（ini/yml） | 一个引擎一个适配器 + 单测，沿用现有 controls/ 模式 |
