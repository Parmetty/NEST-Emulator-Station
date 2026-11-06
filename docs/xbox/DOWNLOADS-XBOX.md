# Xbox 家族下载清单（P7）

> 目标：先把两台 Xbox 的引擎与系统文件备齐，再接主机墙之后的直读。
>
> **原则**：BIOS、MCPX、HDD 镜像、游戏文件都必须来自你自己的主机/合法 dump；Nest 不提供、不打包、不下载这些文件。

## 优先级总表

| 优先级 | 主机 | 引擎 | 是否必需 |
|---|---|---|---|
| P7.1 | Xbox（2001） | xemu | 是 |
| P7.2 | Xbox 360（2005） | Xenia Canary | 是 |
| 可选 | 初代 Xbox Dashboard | xemu + 自备 HDD 镜像 | 否，只影响“系统模式” |

## 一、初代 Xbox / xemu

### 1. 引擎

- 官方发布页：<https://github.com/xemu-project/xemu/releases/latest>
- 选择 **Windows x86_64** 的 `.zip`
- 参考文档：<https://xemu.app/docs/>

下载后放到：

```
E:\workstop\ps\
```

### 2. 必需的系统文件（用户自备）

| 文件 | 说明 |
|---|---|
| `mcpx_1.0.bin` | MCPX boot ROM，xemu 启动必需 |
| `Complex_4627v1.03.bin` / `xbox_f5200.bin` 等 | Xbox BIOS，按 xemu 文档要求 |
| `xbox_hdd.qcow2` | Xbox HDD 镜像，必需；带 Dashboard 才能进初代 Xbox 系统界面 |

> HDD 镜像体积通常数 GB，必须来自你自己的 Xbox 或自己的合法备份。
> 没有 HDD 镜像时，xemu 的 Dashboard 系统模式不可用；直读能否启动取决于镜像构建。

### 3. 游戏格式

- `.iso`（XISO 格式）
- `.xiso.iso`
- 解包目录，含 `default.xbe`

### 4. 接入 Nest 时要做的

- 设置 → Xbox：MCPX、BIOS、HDD 三个导入项
- 扫描：Xbox ISO magic / `.xiso.iso` / `default.xbe`
- 启动：xemu CLI 直读
- 系统模式：可选 `Xbox Dashboard`，依赖 HDD 镜像

## 二、Xbox 360 / Xenia

### 1. 引擎

- **Xenia Canary** 发布页：<https://github.com/xenia-canary/xenia-canary/releases/latest>
- 下载 `xenia_canary.zip`（或对应 Windows x64 资产）
- 参考：<https://github.com/xenia-project/xenia/wiki/Quickstart>

下载后放到：

```
E:\workstop\ps\
```

> 许可证在 P7.0 再核实一次上游仓库；不随包前先确认再分发条款。

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

## 三、下载后交给 Nest 的方式

1. 引擎压缩包放 `E:\workstop\ps\`
2. 解压到 `resources/engines/xemu/` 与 `resources/engines/xenia/`（接入阶段执行）
3. BIOS/MCPX/HDD 放你自己的目录，通过 Nest 设置导入
4. Xbox 360 游戏直接指向 `nest-assets\roms\xbox 360\...`

## 四、开工前检查

- [ ] xemu Windows 包已下载
- [ ] Xenia Canary 已下载
- [ ] 初代 Xbox：MCPX + BIOS + HDD 镜像
- [ ] 初代 Xbox：至少一个 ISO / XISO 游戏
- [ ] Xbox 360：至少一个 ISO / GOD / XEX 游戏
- [ ] 确认 Xenia 许可证与再分发条款
- [ ] 明确 Xbox 360 **不做 Dashboard**，只做直读

## 五、已知限制

- 初代 Xbox 的 HDD 镜像不能随包，用户不提供就无法进 Dashboard
- Xenia 没有系统菜单，Xbox 360 只做直读
- GOD 格式比 ISO 挑版本；优先用最新 Xenia Canary
- Forza Horizon 2 这类游戏兼容性取决于 Xenia 版本，格式识别不等于可玩
