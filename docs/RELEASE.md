# 打包与发布须知

> **状态：已改版（2026-10-29）** —— 参见 `docs/DECISIONS.md` D20：当前只发**免安装携带版**
> `Nest-0.3.0-portable.zip`（解压后双击 `启动 Nest.bat`），不做 NSIS 安装包。
> 下面关于安装器、注册表、卸载的章节保留作为**将来需要安装版时的参考**，不是当前发布流程。
> 当前发布流程见 `docs/CHANGELOG.md` 的「打包与发布」一节。

> 给未来的自己/接手者看。**现在还没有打包**——这份文档是动手那天的清单，不是现状说明。
> 目标：像正常 Windows 程序一样安装、能在控制面板卸载、安装目录布局固定、引擎收纳合理。

## 0. 什么才算一个 release

- ✅ 编译产物（安装包），不是仓库快照
- ✅ 版本说明（这版有什么、怎么装、已知问题）
- ✅ SHA-256 校验值（放 Release 正文里）
- ✅ 干净安装验证：新用户目录 → 安装 → 启动 → 扫描 → 玩游戏 → 卸载

仓库 tag 只是代码里程碑，不等同于 Release。

## 1. 打包前必须先修的两处代码

### 1.1 抓屏工具在 asar 里执行不了

`src/main/index.ts`：

```ts
function captureToolPath(): string {
  const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
  return path.join(base, 'resources', 'tools', 'nest-capture.exe');
}
```

### 1.2 引擎目录必须解包

`enginesDir()` 已经按 `app.isPackaged` 分支到 `process.resourcesPath`，不用改；但要在 electron-builder 里用 `extraResources` 把它拷出去（见第 3 节）。

另外 `startLaunch()` 里给 node 型引擎拼脚本路径用的是 `app.getAppPath()`。打包后 fake 引擎不会随包，这条分支只影响开发，可以不动，但**不要**在打包版里留“找不到脚本”的静默失败。

## 2. 安装后的目录布局（定死，别随意改）

```
%LOCALAPPDATA%\Programs\Nest\
├─ Nest.exe
├─ Uninstall Nest.exe
├─ resources\
│  ├─ app.asar            ← 应用代码
│  ├─ engines\            ← 内置引擎（本版只有 mgba）
│  │  └─ mgba\mGBA.exe …
│  └─ tools\
│     └─ nest-capture.exe
└─ locales\ …             ← Electron 自带
```

用户数据（**不随卸载删除**）：

```
%APPDATA%\Nest\
├─ library.json
├─ covers\
├─ shots\
├─ nest.log
└─ engines\               ← 用户自备/更新的引擎（可写）
```

## 3. electron-builder 配置（`electron-builder.yml`）

```yaml
appId: com.parmetty.nest
productName: Nest
copyright: Copyright © 2026 Nest contributors

directories:
  output: release
  buildResources: build

files:
  - out/**
  - package.json

extraResources:
  - from: resources/engines
    to: engines
  - from: resources/tools
    to: tools

asar: true
asarUnpack:
  - "**/*.node"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
  # 暂不签名：见第 9 节

nsis:
  oneClick: false
  perMachine: false                     # 装到 %LOCALAPPDATA%，不需要管理员
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Nest
  uninstallDisplayName: Nest
  deleteAppDataOnUninstall: false       # 默认保留库和封面
  artifactName: Nest-${version}-Setup.${ext}
```

`npm scripts`：

```json
{
  "build:capture": "powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-capture.ps1",
  "dist": "npm run build:capture && npm run build && electron-builder --win",
  "dist:dir": "npm run build:capture && npm run build && electron-builder --win --dir"
}
```

`dist:dir` 只产出解包目录，用来快速验证路径问题，不打安装包。

## 4. 注册表与安装行为

electron-builder 的 NSIS 会自动处理：

| 内容 | 位置 |
| --- | --- |
| 卸载入口（控制面板可见） | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\<appId>` |
| 安装路径、版本、发布者 | 同上，作为键值 |
| 开始菜单 / 桌面快捷方式 | `%APPDATA%\Microsoft\Windows\Start Menu\Programs` / 桌面 |

**文件关联默认不做**。如果以后要做（双击 `.gba` 进 Nest）：

```yaml
fileAssociations:
  - ext: gba
    name: Game Boy Advance ROM
    role: Editor
```

代价：会抢走用户已有的关联，卸载要干净摘除，而且要处理“用户不想关联”的选项。评分：收益小、麻烦大，**建议做成安装向导里的可选勾选**，别默认开。

## 5. 引擎收纳策略

| 引擎 | 放哪 | 为什么 |
| --- | --- | --- |
| mGBA（内置，MPL 2.0） | 安装目录 `resources/engines/mgba/` | 随版本走，开箱即用，约 41.5 MB |
| ares（内置，ISC） | 安装目录 `resources/engines/ares/` | FC/SFC/N64 三合一，约 42.6 MB（已去掉 `Shaders/`） |
| Dolphin（内置，GPLv2+） | 安装目录 `resources/engines/dolphin/` | NGC/Wii，约 57 MB；必须随包带 VC++ 14.51 的 4 个 DLL |
| Cemu（闭源，重） | 用户目录 `%APPDATA%\Nest\engines\` | 不随包分发，避开许可和体积 |
| 用户指定路径 | 记在 `library.json` 的 settings 里 | 兜底 |

探测顺序（`EngineRegistry`）：**用户目录 → 安装目录 → 系统安装路径**。

### 5.1 关键坑：引擎目录可写性

mGBA 是便携模式（`portable.ini`），配置写在 exe 旁边的 `config.ini`。如果用户把 Nest 装到 `C:\Program Files`（perMachine + 自定义路径），**引擎目录不可写，mGBA 会保存不了设置和存档配置**。

两个解法，选一个：

- **A（推荐）**：首次运行时把 `resources/engines/mgba/` 整个复制到 `%APPDATA%\Nest\engines\mgba\`，之后一律从用户目录启动。安装目录保持只读，用户还能改配置和着色器。
- **B**：强制 per-user 安装（默认配置就是这样），并在文档里写“别装到需要管理员的目录”。

选 A 更稳，但要处理“版本升级时怎么更新引擎副本”（比较版本号，或每次启动校验哈希）。

### 5.2 存档位置

mGBA 默认把 `.sav` 写在 ROM 旁边，不是 Nest 的数据目录。发布说明里要讲清楚：**存档跟着 ROM 走**。以后要做“统一存档管理”，就得在启动前把 ROM 所在目录纳入备份策略，或者用 mGBA 的 `-C savegamePath=` 覆盖。

## 6. 构建流程

```powershell
npm ci
npm run build:capture      # 需要 .NET Framework 4.x 的 csc.exe
npm run typecheck
npm test
npm run dist               # 产出 release\Nest-<version>-Setup.exe
```

第一次构建前先清干净：`rm -rf out release`，避免旧产物混进去。

## 7. 体积预估

| 组成 | 大小 |
| --- | --- |
| Electron 运行时 | ~90 MB |
| mGBA 0.10.5 | 41.5 MB |
| ares v148（FC/SFC/N64） | 42.6 MB |
| Dolphin 2609a（NGC/Wii） | 57 MB |
| 应用代码 + 资源 | ~5 MB |
| **安装包（LZMA 压缩后）** | **约 190–220 MB** |

如果嫌大：mGBA 的 `shaders/`、`scripts/`、`licenses/` 只有几 MB，可精简；但 `licenses/` **不能删**（MPL 2.0 要求保留）。

## 8. 版本与 Release 流程

1. 改 `package.json` 的 `version`（semver：0.3.0、0.3.1…）
2. 更新 `docs/STATE.md` 的发布状态
3. `git tag -a v0.3.0 -m "..."`，推 tag
4. 构建安装包，算 SHA-256：`Get-FileHash release\Nest-0.3.0-Setup.exe -Algorithm SHA256`
5. GitHub Release：
   - Title：`Nest 0.3.0`
   - 附安装包 + SHA-256
   - 正文用下面的模板

```markdown
## Nest 0.3.0

### 新增
- FC / SFC / N64 扫描与启动
- 存档备份

### 修复
- …

### 已知问题
- 未签名，首次运行会弹 SmartScreen：点「更多信息」→「仍要运行」
- 只支持 Windows x64

### 安装
下载 `Nest-0.3.0-Setup.exe`，双击安装。数据在 `%APPDATA%\Nest`，卸载不会删除。
SHA-256: `…`
```

## 9. 签名（暂时不做）

未签名的后果：首次运行 Windows SmartScreen 拦一下，用户点「更多信息 → 仍要运行」即可。
代码签名证书（OV 约 $200/年，EV 更贵）等有真实用户再说。**不要在 README 里隐瞒这件事**。

## 10. 安装后冒烟清单

装完在一台干净机器（或删掉 `%APPDATA%\Nest` 的虚拟机）上逐条过：

- [ ] 安装向导能选路径，装完桌面/开始菜单有图标
- [ ] 双击启动，主窗口正常出现（不是白屏、不是一闪而过）
- [ ] 左侧九台主机都在，GBA 能进游戏库
- [ ] 扫描一个含 `.gba` 的目录，卡片出现
- [ ] 启动游戏 → mGBA 弹出 → Nest 最小化 → 退出后还原
- [ ] 封面生成（`%APPDATA%\Nest\covers\<id>.png`，尺寸 480×320 左右）
- [ ] 右键卡片 → 从库中移除，ROM 文件仍在
- [ ] 设置里两个开关能改、重启后保持
- [ ] 卸载：控制面板能看到、能卸干净；`%APPDATA%\Nest` 按预期保留
- [ ] 安装目录里没有混进 `.roms`、`.profile`、`diag` 这类开发残留
- [ ] **引擎配置文件里没有本地路径**（ares 的 `settings.bml` 会写 `Path:` 和 `Recent`；
      mGBA 的 `qt.ini` 会写窗口位置和最近打开；FCEUX 的 `fceux.cfg` 会写 `recent_files`）。
      打包前用仓库里的干净版本覆盖，别把自己机器上的路径带进发行包。

## 11. 常见坑（都踩过）

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 打包版启动即崩 | 默认 userData 在 `%APPDATA%` 且写入失败 | 正常机器不会；受限环境用 `--user-data-dir` |
| exe 一闪而过、无窗口 | 子进程 `windowsHide: true` 把 GUI 首个窗口藏了 | 原生引擎一律 `windowsHide: false`（已在 supervisor 里区分） |
| 抓屏不工作 | exe 在 asar 里 | 见 1.1 |
| 引擎“未找到” | `extraResources` 路径不对，或清单里的 `{engines}` 没解析 | 检查 `process.resourcesPath\engines` 是否存在 |
| `npm install` 卡在 Electron 下载 | 网络 | 设 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` |
| 首次运行没封面 | 游戏运行时间 < 抓屏间隔（5 秒） | 正常，玩久一点就有了 |
| 卸载后配置还在 | `deleteAppDataOnUninstall: false` | 设计如此，文档里说明 |

## 12. 以后可以做的

- **自动更新**：`electron-updater` + GitHub Releases（需要签名才干净）
- **CI 出包**：GitHub Actions `windows-latest`，打 tag 时自动构建并上传 artifact（不需要签名也能跑）
- **便携版**：`target: portable`，一个 exe，适合放 U 盘；和安装版共用同一份 `%APPDATA%` 数据
- **多语言**：`build/installer.nsh` 加中文语言包
- **仓库瘦身**：`resources/engines/` 41MB 进 Git LFS，或改成首次运行下载（会牺牲开箱即用）
