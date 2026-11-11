# Xbox 家族引擎与系统文件清单（P7）

> **状态（2026-11-12 / 0.6.0-beta.1）**：两台 Xbox 引擎均已内置并跑通直读——
> 初代 Xbox 走 **xemu 0.8.139**，Xbox 360 走 **Xenia Canary**。本文留作系统文件、游戏格式与坑的清单。
>
> **原则**：BIOS、MCPX、HDD 镜像、游戏文件都必须来自你自己的主机/合法 dump；Nest 不提供、不打包、不下载这些文件。

## 优先级总表

| 优先级 | 主机 | 引擎 | 状态 |
|---|---|---|---|
| P7.1 | Xbox（2001） | xemu 0.8.139 | ✅ 已接入（0.6.0-beta.1），直读 |
| P7.2 | Xbox 360（2005） | Xenia Canary | ✅ 已接入（0.5.0-beta.1），直读 |
| 可选 | 初代 Xbox Dashboard | xemu + 自备 HDD 镜像 | 受限：HDD 里自带 Dashboard 才能进系统菜单 |

## 一、初代 Xbox / xemu

### 1. 引擎

- **已内置**：`resources/engines/xemu/`（xemu 0.8.139，GPLv2），无需自己下载
- 官方发布页：<https://github.com/xemu-project/xemu/releases/latest>（升级时取 Windows x86_64 的 `.zip` 覆盖引擎目录）
- 参考文档：<https://xemu.app/docs/>
- 注意：`resources/engines/xemu/xemu.toml` 由 Nest **每次启动前重写**（便携模式开关 + 固件路径），不要手改或提交

### 2. 必需的系统文件（用户自备）

| 文件 | 说明 |
|---|---|
| `mcpx_1.0.bin` | MCPX boot ROM，xemu 启动必需 |
| `Complex_4627v1.03.bin` / `xbox_f5200.bin` 等 | Xbox BIOS，按 xemu 文档要求 |
| `xbox_hdd.qcow2` | Xbox HDD 镜像，必需；带 Dashboard 才能进初代 Xbox 系统界面 |

> HDD 镜像体积通常数 GB，必须来自你自己的 Xbox 或自己的合法备份。
> 没有 HDD 镜像时，xemu 的 Dashboard 系统模式不可用；直读能否启动取决于镜像构建。

### 3. 游戏格式

- `.iso`（XISO / XDVDFS 格式）—— **xemu 只认这种镜像**
- `.xiso.iso`（同一格式的常见命名）
- 解包目录，含 `default.xbe` —— Nest 会先打包成 XISO 再启动（见下一节）

### 4. 接入方式（0.6.0 已实现）

- 设置 → Xbox：**MCPX**（512 B）、**BIOS**（256 KB；1 MB 四连体 dump 会自动取第一段）、**HDD**（qcow2，只记路径不复制）
- 扫描：XISO 用 XDVDFS 魔数判定，另收 `.xbe` 与含 `default.xbe` 的文件夹
- 启动：Nest 写便携 `xemu.toml`，再补 `-bios <dump> -dvd_path <iso>`
  （xemu 0.8.139 不会自己把 `flashrom_path` 变成启动参数）
- **文件夹 → XISO**：右键「打包为 XISO…」弹保存对话框，默认输出到游戏文件夹同级、同名 `.iso`（内置 `extract-xiso`）；
  直接启动文件夹游戏也会自动打包；启动前再硬链接到无空格路径（xemu 的 QEMU 参数会按空格切路径）
- 扫描去重：打包后同一游戏不会同时出现「文件夹 + ISO」两条记录
- **区域 / 标题**：读 XBE 证书（XISO 内也会走 XDVDFS 目录表找 `default.xbe`），卡片显示 NTSC-U / NTSC-J / PAL / Region-Free
- 系统模式：**不做**。HDD 里没有 Dashboard 就进不了系统菜单；有 Dashboard 也不是 Nest 的系统菜单入口

## 二、Xbox 360 / Xenia

### 1. 引擎

- **已内置**：`resources/engines/xenia/`（Xenia Canary，BSD-3-Clause）
- 发布页：<https://github.com/xenia-canary/xenia-canary/releases/latest>（升级时取 Windows x64 资产覆盖引擎目录）
- 参考：<https://github.com/xenia-project/xenia/wiki/Quickstart>
- 再分发条款已核实并按 BSD-3-Clause 随包，许可证文本见 `resources/engines/xenia/LICENSE`

### 2. 系统文件

- **不需要固件**
- **没有 Dashboard / 系统菜单**：Xenia 不支持初代 Xbox 360 Dashboard，别做系统模式入口
- 存档由 Xenia 自己管理，Nest 只做路径隔离/封面

### 3. 游戏格式

- `.iso`
- GOD / STFS 安装目录（`<TitleID>/00007000/...`）
- 解包目录，含 `default.xex`
- GOD 目录示例（仓库里已有）：

```
nest-assets\roms\xbox 360\4D530AA4\00007000\99B5F58BC37BA43E6271
nest-assets\roms\xbox 360\4D530AA4\00007000\99B5F58BC37BA43E6271.data\Data0000...
```

## 当前实测状态

- **Xenia Canary 直读已跑通**：GOD 包《Forza Horizon 2》能进入开场画面（Direct3D 12）
- 启动时 Xenia 会弹免责声明框；Nest 已用高速 UIA（`nest-dialog.exe`）自动点掉，实测约 3 ms，封面不会再截到弹窗
- Dashboard / 系统模式仍不做
- **xemu 初代 Xbox 直读已跑通**：Halo 2（美版中文）经 Nest 启动并进入标题画面（0.6.0-beta.1）；
  官方标题与区域由 XBE 证书识别；XISO 直读与「文件夹 → 自动打包」两条路都验证过

## 三、交给 Nest 的方式

1. 引擎已内置（`resources/engines/xemu/`、`resources/engines/xenia/`），不需要手工解压
2. MCPX / BIOS / HDD 放你自己的目录，通过设置 → Xbox 导入（HDD 只记路径）
3. 扫描你的游戏目录：Xbox 用 XISO（或先让 Nest 打包），Xbox 360 指向 `nest-assets\roms\xbox 360\...`
4. 从 0.5.0 升级上来时，先在设置 → Xbox 重新确认三个固件项还在（换机/换目录后路径会失效）

## 四、开箱检查（0.6.0 之后）

- [x] xemu 引擎已内置（`resources/engines/xemu/`，0.8.139）
- [x] Xenia Canary 已内置（`resources/engines/xenia/`）
- [ ] 初代 Xbox：MCPX + BIOS + HDD 镜像（设置 → Xbox 导入）
- [ ] 初代 Xbox：至少一个 XISO 游戏（或一个含 `default.xbe` 的文件夹，右键打包）
- [ ] Xbox 360：至少一个 ISO / GOD / XEX 游戏
- [x] 确认 Xenia 许可证与再分发条款（BSD-3-Clause）
- [x] 明确两台 Xbox **都不做 Dashboard 系统菜单**，只做直读

## 五、已知限制

- **xemu 无键盘映射**：0.8.139 只认 SDL 手柄，Nest 键位面板不覆盖 Xbox，必须插手柄
- **xemu 只读镜像**：不认解包文件夹，必须先打包成 XISO（右键「打包为 XISO…」或直接启动让 Nest 自动打包）
- 初代 Xbox 的 HDD 镜像不能随包，且必须**自带 Dashboard** 才能进系统菜单；直读不受影响
- xemu 的 QEMU 参数会按空格切分路径，Nest 已用硬链接绕开；手动在命令行起 xemu 时注意别用带空格的路径
- Xenia 没有系统菜单，Xbox 360 只做直读
- GOD 格式比 ISO 挑版本；优先用最新 Xenia Canary
- Forza Horizon 2 这类游戏兼容性取决于 Xenia 版本，格式识别不等于可玩

## 六、键盘映射（Nest 键位面板）

> 初代 Xbox（xemu 0.8.139）**没有键盘映射**：只接 SDL 手柄，键位面板不覆盖 Xbox。
> 下面都是 Xbox 360（Xenia）的实现。

- 绑定写在 `xenia-canary.config.toml` 的 `[HID.Key]`，值是 Windows VK 十六进制（如 `"0x4A"`）
- **必须同时打开 `[HID] keyboard_mode = 1`**：Xenia 默认是 `0`（Disabled），
  此时所有 `[HID.Key]` 都能解析、但不会送进游戏（表现为“面板里设了，游戏里没反应”）。
  Nest 适配器现在写键位时会自动把它设成 1，并保持 `keyboard_user_index = 0`
- **方向键会同时写 D-Pad 与左摇杆**（`keybind_dpad_*` + `keybind_left_thumb_*`）：
  赛车/射击类游戏的移动读左摇杆，只写 D-Pad 会出现“车不能左右动”
- **Xbox Live 档案**：首次启动需要档案的游戏会弹 `No Profiles` → 鼠标点 `SIGN IN`
  → `Create Profile` → 输入 Gamertag → `OK`，Xenia 会把 XUID 记进 `[Profiles] logged_profile_slot_0_xuid`
