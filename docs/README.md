# Nest 文档索引

> 当前版本 **0.6.0-beta.1**（2026-11-12，GitHub pre-release）。本目录是开发/内部文档；只想用 Nest 的话看根目录 [README.md](../README.md)。

## 当前状态看哪里

按这个顺序取当前事实，别用旧快照：

1. 根目录 [README.md](../README.md) —— 版本、下载、能力矩阵、已知限制
2. [ROADMAP.md](ROADMAP.md) —— 跨家族路线与阶段状态
3. 最新发布说明 [nintendo/RELEASE-0.6.0-beta.1.md](nintendo/RELEASE-0.6.0-beta.1.md)
4. 发布级变化 [nintendo/CHANGELOG.md](nintendo/CHANGELOG.md)

> `nintendo/STATE.md` 与 `nintendo/PROGRESS.md` 是 **0.4.2 时期的历史快照**，只用于追溯，不代表当前状态。

## 目录

| 位置 | 内容 |
|---|---|
| [nintendo/](nintendo/) | 任天堂系：发布日志、键位（KEYS-*）、内核构建指南、DECISIONS、证据与补丁 |
| [playstation/](playstation/) | PS 家族：计划、P6.0 调研、各引擎规格（ENGINE-*）与下载清单 |
| [xbox/](xbox/) | Xbox 家族：引擎与系统文件清单、键盘映射、各引擎规格（[ENGINE-xemu.md](xbox/ENGINE-xemu.md)） |
| [archive/](archive/) | 归档：旧计划、旧发布说明（含 2026-11-08 编码事故记录） |
| [BUILD-PORTABLE.md](BUILD-PORTABLE.md) | 便携包（portable zip）编译手册 |
| [ROADMAP.md](ROADMAP.md) | 跨家族总路线 |

## 常用入口

- 便携包怎么打 — [BUILD-PORTABLE.md](BUILD-PORTABLE.md)
- 发布流程 — [nintendo/RELEASE-RUNBOOK.md](nintendo/RELEASE-RUNBOOK.md)
- 发布说明 — [nintendo/RELEASE-0.6.0-beta.1.md](nintendo/RELEASE-0.6.0-beta.1.md)
- PS3 引擎与 Crysis 3 已知问题 — [playstation/ENGINE-rpcs3.md](playstation/ENGINE-rpcs3.md)
- PS3 渲染器 / 预编译缓存 — 同上（`[Video] Renderer`，默认 OpenGL）
- 初代 Xbox 引擎（xemu / XISO 打包 / 区域识别） — [xbox/ENGINE-xemu.md](xbox/ENGINE-xemu.md)
- Xbox 引擎与系统文件清单、Xbox 360 档案流程 — [xbox/DOWNLOADS-XBOX.md](xbox/DOWNLOADS-XBOX.md)
- 键位细节 — [nintendo/KEYS-GBA.md](nintendo/KEYS-GBA.md)、[nintendo/KEYS-DOLPHIN.md](nintendo/KEYS-DOLPHIN.md)、
  [nintendo/KEYS-3DS.md](nintendo/KEYS-3DS.md)、[nintendo/KEYS-ARES.md](nintendo/KEYS-ARES.md)、[nintendo/KEYS-CEMU.md](nintendo/KEYS-CEMU.md)

## 内部文件（未跟踪，不随仓库发布）

- `HANDOFF.local.md` —— 交接/新对话启动说明
- `HISTORY.md` —— 按功能组织的项目编年史
- `nintendo/HISTORY.md` —— 指向 `../HISTORY.md` 的重定向

## 维护约定

- 文本一律 UTF-8（无 BOM）。2026-11-08 用 PowerShell 5.1 的 `Get-Content`/`Set-Content`/`>` 批量改 Markdown，
  把 6 份文档按 GBK 解错后又存回 UTF-8，内容不可无损恢复，只能删除（见 [archive/README.md](archive/README.md)）。
  改文档请用 UTF-8 编辑器 / 仓库工具的 read/edit/write。
- 新增文档放进对应家族目录；跨家族的放本目录。
- 发布说明按 `nintendo/RELEASE-<version>.md` 命名，CHANGELOG 与根 README 同步更新。
