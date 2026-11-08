# PlayStation 家族接入计划

> **历史阶段计划（P6.0 时期）。** P6.1–P6.4 已落地；当前状态见 `docs/ROADMAP.md` 与 `docs/playstation/ENGINE-rpcs3.md`。

> 状态：**P6.0 调研完成**（2026-11-03）→ 下一步 P6.1
> 调研报告：[RESEARCH-P6.0.md](RESEARCH-P6.0.md)；逐引擎规格：[duckstation](ENGINE-duckstation.md) · [ppsspp](ENGINE-ppsspp.md) · [pcsx2](ENGINE-pcsx2.md) · [rpcs3](ENGINE-rpcs3.md)
> 目标：把 PS1 / PSP / PS2 / PS3 按「Nest 主机墙 + 扫描 → 卡片 → 启动 → 返回 → 封面」的既有模式接进来，
> 配置、存档、键位都收在 Nest 数据目录里，不落到用户文档目录。

## 一、边界

- 不内置、不下载、不分发 BIOS / 固件 / 游戏镜像
- 不自研模拟器内核，只做宿主/调度/体验
- 没有真实系统菜单的引擎不假造「系统模式」

## 二、引擎选型（初步，P6.0 逐项核实）

| 主机 | 引擎 | 许可 | 体积（估） | 镜像格式 | BIOS/固件 | 系统菜单 |
|---|---|---|---|---|---|---|
| PS1 | **SwanStation**（主选，GPLv3 libretro） | GPLv3 | libretro core | `.cue+.bin` / `.chd` / `.pbp` / `.iso` | **可选**（缺省 OpenBIOS） | 无（DuckStation 可选提供 BIOS shell） |
| PSP | PPSSPP | GPLv2+ | 数十 MB | `.iso` / `.cso` / `.pbp` / `.chd` | 无 | 无（XMB 不可用） |
| PS2 | PCSX2 | LGPLv3 | 数十 MB | `.iso` / `.chd` / `.bin+.cue` | **必须**（BIOS） | BIOS 浏览器（待验证入口） |
| PS3 | RPCS3 | GPLv2 | 大（含运行时） | 游戏目录 / `.iso` | **必须**（固件 PUP） | 无（XMB 不可用） |

> 体积、便携模式、CLI 参数都要在 P6.0 实测后回填；不凭印象写死。

## 二点五、调研结论（P6.0，2026-11-03）

- **PS1**：DuckStation，BIOS **必需**；系统模式 = `-bios` 的 BIOS shell（只能管记忆卡，不能起游戏）；许可证 CC BY-NC-ND 4.0 → **不随包，探测本机安装**
- **PSP**：PPSSPP，无 BIOS；系统模式 = **XMB（VSH）**，但需要 PPSSPP **1.21+** 与 PSP 固件；1.20.4 稳定版只能直读
- **PS2**：PCSX2，BIOS **必需**；系统模式 = `-bios` 的无盘 BIOS 浏览器
- **PS3**：RPCS3，固件必需；**没有 XMB**，只做直读
- 便携：DuckStation `portable.txt`、PCSX2 `portable.ini`、PPSSPP `--memstick`、RPCS3 用 `APPDATA` 重定向
- 体积：PPSSPP 19.4 MB / PCSX2 24.5 MB / DuckStation 70.6 MB / RPCS3 以官网 nightly 为准

## 三、接入顺序与理由

1. **P6.1 PS1 · SwanStation** —— 复用 Nest 自写 libretro 宿主，GPLv3 可随包，OpenBIOS 兜底；先把 PS 家族骨架跑通
2. **P6.2 PSP · PPSSPP** —— 无 BIOS、`.cso` 常见、memstick 目录天然可隔离，复制 PS1 经验
3. **P6.3 PS2 · PCSX2** —— 引入 BIOS 与记忆卡管理，设置页需要新导入类型
4. **P6.4 PS3 · RPCS3** —— 固件安装、游戏目录型内容、体积最大，后置

每个引擎独立清单 `resources/engines/<id>.json` + `systems.ts` 解锁对应机型 + 设置页 PlayStation 分类。

## 四、分阶段任务

### P6.0 调研（先做，1 个阶段）

- [x] DuckStation / PPSSPP / PCSX2 / RPCS3 的 **便携模式**（见 RESEARCH-P6.0.md）
- [x] **CLI**：直读/全屏/BIOS/固件参数已从 Wiki 或源码核实
- [ ] **配置格式**：键位字段尚未实测（需要各引擎跑一次生成配置文件）
- [x] **许可与再分发**：DuckStation CC BY-NC-ND（不随包）、PPSSPP GPLv2+、PCSX2 GPLv3、RPCS3 GPLv2
- [ ] **真实内容需求**：BIOS/固件校验值与镜像验证（等待用户提供）
- [x] 产出：`ENGINE-duckstation.md` / `ENGINE-ppsspp.md` / `ENGINE-pcsx2.md` / `ENGINE-rpcs3.md`

### P6.1 PS1（SwanStation 主选，DuckStation 可选）

> 引擎规格：[ENGINE-swanstation.md](ENGINE-swanstation.md)；DuckStation 仅作为用户自装的 BIOS shell 可选项（[ENGINE-duckstation.md](ENGINE-duckstation.md)）。
> 原计划用 DuckStation，因 **CC BY-NC-ND 4.0** 不适合随包，主选改为 SwanStation（GPLv3 libretro core，BIOS 可选）。

> 引擎不随包（CC BY-NC-ND）；系统模式 = `-bios` BIOS shell；BIOS 必需。

- 扫描扩展名：`.cue` / `.chd` / `.pbp` / `.iso` / `.mds` / `.ccd`（`.bin` 需配 `.cue`，否则提示）
- 启动：宿主 `nest-libretro.exe --core swanstation_libretro.dll --rom <镜像>`；确认核心选项/BIOS 路径
- 数据隔离：BIOS、记忆卡、存档、截图目录指向 `data/playstation/duckstation/`
- 设置 → PlayStation：PS1 BIOS 导入（可选，放 `libretro/sys`，缺省 OpenBIOS）
- 键位：DuckStation 配置格式的键盘适配器（先默认布局，再进面板）
- 封面：抓帧工具复用（PS1 4:3）
- 验收：扫描 → 卡片 → 启动 → 退出返回 → 封面；无 BIOS 时明确提示

### P6.2 PSP（PPSSPP）

> 直读可先做；XMB 系统模式需要 1.21+ 与 PSP 固件，标记实验性。

- 扫描：`.iso` / `.cso` / `.pbp` / `.chd`
- 便携：确认 `memstick/PSP/SYSTEM/ppsspp.ini` 可重定向；存档随 memstick 隔离
- 画面：16:9，抓帧裁剪按 PPSSPP 窗口比例
- 键位：`ppsspp.ini` 的键盘映射适配器
- 验收：同 P6.1；`.cso` 能识别

### P6.3 PS2（PCSX2）

> 系统模式 = `-bios` 无盘启动 BIOS 浏览器；BIOS 必需。

- 扫描：`.iso` / `.chd` / `.bin+.cue`；`.iso` 与 GC/Wii/PSP 冲突需按系统扫描根或文件头判定
- BIOS 导入：`scph*.bin`（大小/版本校验），配置写入 PCSX2 的 `BIOS` 路径
- 记忆卡：每游戏/全局记忆卡目录隔离
- 系统模式：PCSX2 的 BIOS 浏览器（进入后能看到记忆卡/版本），验证后再决定是否挂「系统菜单」
- 键位：`PCSX2.ini` 适配器
- 验收：BIOS 缺失有错误码；有 BIOS 时能直读 + 进浏览器

### P6.4 PS3（RPCS3）

> **没有 XMB，也没有替代方案**：RPCS3 不模拟 PS3 系统菜单，固件只用于运行游戏。
> 不做系统模式；如需在 Nest 里展示 PS3 游戏，用 Nest 原生游戏库视图（不冒充 XMB）。

> 无 XMB，只做直读；固件 PUP 必需。

- 前置：固件 PUP 安装（用户自备）；游戏目录/ISO 识别
- 无 XMB：不做系统模式，文档写明
- 键位：`config.yml` 适配器
- 验收：安装固件后可直读至少一个游戏；体积/启动时间如实标注

## 五、设置页与主机墙

- `systems.ts` 里 PS1/PS2/PSP/PS3 已占位（`locked`），接入后逐个解锁并补插图（Wikimedia，CC 授权 + `THIRD-PARTY-NOTICES.md`）
- 设置 → PlayStation 页逐步填充：
  - 系统文件：PS1 BIOS、PS2 BIOS、PS3 固件（PUP）
  - 存储：记忆卡目录、memstick 目录
  - 画面/键位：沿用现有组件

## 六、跨引擎共用改造

- 扫描器扩展名冲突：`.iso` 目前归 NGC/Wii；PS 家族接入时按「扫描根绑定的系统」或文件头判定，避免抢文件
- 抓帧工具：PS1 4:3、PSP 16:9、PS2 4:3/16:9（按引擎窗口比例）
- 键位面板：`CONTROL_ENGINE_IDS` 增加 4 个引擎；每引擎一个适配器 + 单测
- 存档备份（原 P2 遗留项）有望在 PS 阶段一并做掉：统一 `saves/` 快照机制

## 七、需要的验证资源（用户自备）

| 资源 | 用途 |
|---|---|
| PS1 BIOS（如 scph5501） | 可选；没有则 SwanStation 用 OpenBIOS 兜底 |
| PS2 BIOS（如 scph39001） | PCSX2 必需 |
| PS3 固件 PUP | RPCS3 必需 |
| 各平台真实游戏镜像 | 扫描/启动/封面验证 |

> 没有这些资源时，代码可以先就绪并给出明确错误提示，但不对外宣称“已验证”。

## 八、风险

| 风险 | 应对 |
|---|---|
| 引擎不留便携模式 | 用命令行参数/环境变量重定向；不行则先探测安装版，数据仍尝试集中 |
| BIOS 缺失直接黑屏 | 启动前校验 + 错误码 + 设置页入口 |
| `.iso` 争抢 | 系统绑定扫描根 / 文件头判定，冲突时要求用户确认 |
| RPCS3 启动慢、体积大 | 后置；文档标注真实需求 |
| 许可证差异 | 探测优先；随包前逐项确认许可文本与再分发条款 |
